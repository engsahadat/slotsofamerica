<?php

namespace App\Services;

use App\Models\VerificationSetting;
use Exception;
use Illuminate\Support\Facades\Http;

/**
 * Replaces InfobipService for OTP delivery — Brevo (formerly Sendinblue) transactional SMS +
 * email, both under https://api.brevo.com/v3/. Unlike Infobip's `Authorization: App {key}`
 * scheme, Brevo uses a flat `api-key` header. Mirrors InfobipService's shape deliberately (void
 * methods, throw a plain Exception with the raw response body on failure, no return value) so
 * the calling controllers barely change.
 */
class BrevoService
{
    private const BASE_URL = 'https://api.brevo.com/v3';

    public static function sendSms(string $to, string $text): void
    {
        $settings = VerificationSetting::instance();

        $apiKey = $settings->brevo_api_key;
        $sender = $settings->brevo_sms_sender;

        if (!$apiKey) {
            throw new Exception('Brevo is not configured. Please enter your Brevo API Key in Site Settings.');
        }
        if (!$sender) {
            throw new Exception('Brevo SMS sender name is not configured. Please enter it in Site Settings.');
        }

        // timeout + retry: a single dropped connection to Brevo used to fail the whole OTP send
        // outright with no second attempt — exactly what "sometimes the SMS comes, sometimes it
        // doesn't" looks like from the outside. retry() only retries a genuine connection-level
        // failure (timeout, DNS, refused) — never a clean non-2xx response — same safety net
        // FastPaymentService::call() already uses for the same reason.
        $response = Http::withHeaders([
            'api-key' => $apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ])->timeout(15)->retry(2, 500, throw: false)->post(self::BASE_URL . '/transactionalSMS/sms', [
            'sender' => $sender,
            'recipient' => $to,
            'content' => $text,
            'type' => 'transactional',
        ]);

        if ($response->failed()) {
            throw new Exception('Brevo SMS request failed: ' . $response->body());
        }
    }

    public static function sendEmail(string $to, string $subject, string $htmlContent, ?string $toName = null): void
    {
        $settings = VerificationSetting::instance();

        $apiKey = $settings->brevo_api_key;
        $senderEmail = $settings->brevo_email_sender;
        $senderName = $settings->brevo_email_sender_name ?: config('app.name', 'Horizon Players');

        if (!$apiKey) {
            throw new Exception('Brevo is not configured. Please enter your Brevo API Key in Site Settings.');
        }
        if (!$senderEmail) {
            throw new Exception('Brevo email sender address is not configured. Please enter it in Site Settings.');
        }

        $response = Http::withHeaders([
            'api-key' => $apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ])->timeout(15)->retry(2, 500, throw: false)->post(self::BASE_URL . '/smtp/email', [
            'sender' => ['name' => $senderName, 'email' => $senderEmail],
            'to' => array_filter([['email' => $to, 'name' => $toName]]),
            'subject' => $subject,
            'htmlContent' => $htmlContent,
        ]);

        if ($response->failed()) {
            throw new Exception('Brevo email request failed: ' . $response->body());
        }
    }
}
