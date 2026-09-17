<?php

namespace Tests\Unit;

use App\Services\PayloadSanitizer;
use Tests\TestCase;

class PayloadSanitizerTest extends TestCase
{
    public function test_it_redacts_known_sensitive_keys(): void
    {
        $out = PayloadSanitizer::sanitize([
            'username' => 'player1',
            'password' => 'hunter2',
            'agent_password' => 'agentsecret',
            'token' => 'abc123',
            'access_token' => 'xyz789',
            'refresh_token' => 'ref456',
            'authorization' => 'Bearer abc',
            'api_key' => 'sk_live_abc',
            'apikey' => 'sk_live_def',
            'agentkey' => 'rotating-key-value',
            'agent_key' => 'rotating-key-value-2',
            'merchant_key' => 'merchantsecret',
            'client_secret' => 'clientsecret',
        ]);

        $this->assertSame('player1', $out['username']);
        foreach (['password', 'agent_password', 'token', 'access_token', 'refresh_token', 'authorization', 'api_key', 'apikey', 'agentkey', 'agent_key', 'merchant_key', 'client_secret'] as $key) {
            $this->assertSame('[REDACTED]', $out[$key], "Expected {$key} to be redacted");
        }
    }

    public function test_it_redacts_payment_sensitive_fields(): void
    {
        $out = PayloadSanitizer::sanitize([
            'amount' => '4.99',
            'card_number' => '4111111111111111',
            'cvv' => '123',
            'account_number' => '000123456789',
            'routing_number' => '021000021',
            'ssn' => '123-45-6789',
        ]);

        $this->assertSame('4.99', $out['amount']);
        foreach (['card_number', 'cvv', 'account_number', 'routing_number', 'ssn'] as $key) {
            $this->assertSame('[REDACTED]', $out[$key]);
        }
    }

    public function test_it_recurses_into_nested_arrays_and_lists(): void
    {
        $out = PayloadSanitizer::sanitize([
            'data' => [
                'user_id' => 5,
                'nested' => ['password' => 'secret', 'ok' => 'fine'],
            ],
            'items' => [
                ['token' => 'a'],
                ['token' => 'b'],
            ],
        ]);

        $this->assertSame(5, $out['data']['user_id']);
        $this->assertSame('[REDACTED]', $out['data']['nested']['password']);
        $this->assertSame('fine', $out['data']['nested']['ok']);
        $this->assertSame('[REDACTED]', $out['items'][0]['token']);
        $this->assertSame('[REDACTED]', $out['items'][1]['token']);
    }

    public function test_it_leaves_non_sensitive_fields_and_null_untouched(): void
    {
        $this->assertNull(PayloadSanitizer::sanitize(null));
        $out = PayloadSanitizer::sanitize(['order_sn' => 'FP123', 'amount' => 4.99, 'status' => '00000']);
        $this->assertSame(['order_sn' => 'FP123', 'amount' => 4.99, 'status' => '00000'], $out);
    }
}
