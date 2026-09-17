<?php

namespace Tests\Unit;

use App\Services\GameApiProvider\ErrorClassifier;
use Tests\TestCase;

class ErrorClassifierTest extends TestCase
{
    public function test_classifies_wrong_credentials_as_actionable_message(): void
    {
        $raw = "Upstream connection issue (urlencoded: HTTP 200 Username or password error). Retried 8 times with multipart and urlencoded encodings.";

        $msg = ErrorClassifier::friendly($raw);

        $this->assertStringContainsString('rejected the agent username or password', $msg);
    }

    public function test_classifies_provider_rate_limit_as_actionable_message(): void
    {
        $raw = "Upstream connection issue (urlencoded: HTTP 200 Too many login errors, please try again in an hour). Retried 8 times with multipart and urlencoded encodings.";

        $msg = ErrorClassifier::friendly($raw);

        $this->assertStringContainsString('rate-limiting login attempts', $msg);
    }

    public function test_falls_back_to_providers_own_message_when_unrecognized(): void
    {
        $raw = 'Upstream connection issue (urlencoded: HTTP 200 Some unexpected provider text). Retried 8 times.';

        $msg = ErrorClassifier::friendly($raw);

        $this->assertStringContainsString('Some unexpected provider text', $msg);
    }

    public function test_missing_password_message_unchanged(): void
    {
        $this->assertSame(
            'Agent password is not set for this provider.',
            ErrorClassifier::friendly('Agent password not set')
        );
    }

    /**
     * Found via live debugging this exact integration: "Invalid request parameters (code 2)"
     * was the one and only error a real provider returned for every single call, and it took a
     * database dig to work out it meant a mistyped/whitespace-polluted Agent Username. Smart
     * validation now names the likely cause directly instead of the bare provider code.
     */
    public function test_classifies_invalid_request_parameters_code_2_with_actionable_guidance(): void
    {
        $msg = ErrorClassifier::friendly('Invalid request parameters (code 2)');

        $this->assertStringContainsString('wrong Agent Username', $msg);
        $this->assertStringContainsString('code 2', $msg);
    }

    public function test_classifies_invalid_token_code_3_with_actionable_guidance(): void
    {
        $msg = ErrorClassifier::friendly('Invalid token (code 3)');

        $this->assertStringContainsString('IP', $msg);
        $this->assertStringContainsString('code 3', $msg);
    }

    /**
     * Found via live debugging: a real redeem/withdraw failure from gameroom777
     * ("Withdrawal amount is greater than customer balance. Please check and withdraw again")
     * didn't contain the word "insufficient" at all, so it fell all the way through to the
     * generic "Connection test failed" fallback — actively misleading, since this is a genuine,
     * non-retryable business rejection (the player's real in-game balance is lower than the
     * requested amount), not a transient connectivity issue.
     */
    public function test_classifies_amount_greater_than_balance_as_an_actionable_insufficient_balance_message(): void
    {
        $msg = ErrorClassifier::friendly('Withdrawal amount is greater than customer balance. Please check and withdraw again');

        $this->assertStringContainsString('more than', $msg);
        $this->assertStringContainsString('balance', $msg);
        $this->assertStringNotContainsString('Connection test failed', $msg);
    }

    public function test_classifies_exceeds_balance_phrasing_the_same_way(): void
    {
        $msg = ErrorClassifier::friendly('Amount exceeds available balance');

        $this->assertStringContainsString('more than', $msg);
        $this->assertStringNotContainsString('Connection test failed', $msg);
    }
}
