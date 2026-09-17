<?php

namespace Tests\Unit;

use App\Models\VerificationSetting;
use App\Services\BrevoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BrevoServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_send_sms_fails_cleanly_when_api_key_is_missing(): void
    {
        Http::fake();

        $this->expectExceptionMessage('Brevo is not configured');
        BrevoService::sendSms('+15551234567', 'test');

        Http::assertNothingSent();
    }

    public function test_send_sms_fails_cleanly_when_sender_is_missing(): void
    {
        Http::fake();
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key']);

        $this->expectExceptionMessage('sender name is not configured');
        BrevoService::sendSms('+15551234567', 'test');

        Http::assertNothingSent();
    }

    public function test_send_sms_sends_the_expected_payload_with_the_api_key_header(): void
    {
        Http::fake(['*/transactionalSMS/sms' => Http::response(['messageId' => 'abc'], 200)]);
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon']);

        BrevoService::sendSms('+15551234567', 'Your code is 123456');

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.brevo.com/v3/transactionalSMS/sms'
                && $request->hasHeader('api-key', 'test-key')
                && $request['sender'] === 'Horizon'
                && $request['recipient'] === '+15551234567'
                && $request['content'] === 'Your code is 123456'
                && $request['type'] === 'transactional';
        });
    }

    /**
     * Live report: "sometimes the SMS comes, sometimes it doesn't" — one dropped connection to
     * Brevo used to fail the whole OTP send outright with no second attempt. sendSms()/
     * sendEmail() now retry(2, 500, throw: false) on a genuine connection-level failure, the same
     * safety net FastPaymentService::call() already uses.
     */
    public function test_send_sms_retries_once_on_a_connection_blip_then_succeeds(): void
    {
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon']);
        $attempts = 0;
        Http::fake([
            '*/transactionalSMS/sms' => function () use (&$attempts) {
                $attempts++;
                if ($attempts === 1) {
                    throw new \Illuminate\Http\Client\ConnectionException('Connection timed out');
                }

                return Http::response(['messageId' => 'abc'], 200);
            },
        ]);

        BrevoService::sendSms('+15551234567', 'test'); // must not throw — the retry recovers it

        $this->assertSame(2, $attempts);
    }

    public function test_send_sms_throws_on_a_failed_response(): void
    {
        Http::fake(['*/transactionalSMS/sms' => Http::response(['message' => 'Invalid sender'], 400)]);
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon']);

        $this->expectExceptionMessage('Brevo SMS request failed');
        BrevoService::sendSms('+15551234567', 'test');
    }

    public function test_send_email_fails_cleanly_when_sender_address_is_missing(): void
    {
        Http::fake();
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key']);

        $this->expectExceptionMessage('sender address is not configured');
        BrevoService::sendEmail('someone@example.com', 'Subject', '<p>Hi</p>');

        Http::assertNothingSent();
    }

    public function test_send_email_sends_the_expected_payload(): void
    {
        Http::fake(['*/smtp/email' => Http::response(['messageId' => 'abc'], 200)]);
        VerificationSetting::instance()->update([
            'brevo_api_key' => 'test-key', 'brevo_email_sender' => 'no-reply@horizon.gg', 'brevo_email_sender_name' => 'Horizon Players',
        ]);

        BrevoService::sendEmail('someone@example.com', 'Your verification code', '<p>123456</p>', 'Someone');

        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.brevo.com/v3/smtp/email'
                && $request->hasHeader('api-key', 'test-key')
                && $request['sender']['email'] === 'no-reply@horizon.gg'
                && $request['sender']['name'] === 'Horizon Players'
                && $request['to'][0]['email'] === 'someone@example.com'
                && $request['to'][0]['name'] === 'Someone'
                && $request['subject'] === 'Your verification code'
                && $request['htmlContent'] === '<p>123456</p>';
        });
    }
}
