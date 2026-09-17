<?php

namespace Tests\Feature;

use App\Models\ManualVerificationRequest;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\VerificationSetting;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdminVerificationTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_can_save_the_previously_dropped_settings_fields(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/settings', [
                'max_per_hour' => 10,
                'brevo_email_sender' => 'no-reply@horizon.gg',
                'brevo_email_enabled' => true,
            ]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('verification_settings', [
            'max_per_hour' => 10,
            'brevo_email_sender' => 'no-reply@horizon.gg',
            'brevo_email_enabled' => true,
        ]);
    }

    /**
     * Smart validation: same trim fix applied to Game API Providers/GHL/FAST credentials —
     * extended here since a pasted Brevo API key with a stray leading/trailing space or
     * newline would be indistinguishable from "wrong credential" once sent to Brevo.
     */
    public function test_admin_settings_save_trims_brevo_credentials(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/settings', [
                'brevo_api_key' => "  xkeysib-test123  \n",
                'brevo_sms_sender' => ' Horizon ',
            ]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('verification_settings', [
            'brevo_api_key' => 'xkeysib-test123',
            'brevo_sms_sender' => 'Horizon',
        ]);
    }

    public function test_test_email_endpoint_sends_via_configured_smtp(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin', 'email' => 'admin@horizon.gg']);
        VerificationSetting::instance()->update(['smtp_host' => 'smtp.example.com']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/test-email');
        $res->assertStatus(200)->assertJsonPath('success', true);

        Mail::assertSent(\App\Mail\OtpMail::class);
    }

    public function test_test_email_endpoint_fails_cleanly_without_smtp_configured(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/test-email');
        $res->assertStatus(422)->assertJsonPath('success', false);
    }

    public function test_test_sms_endpoint_hits_brevo(): void
    {
        Http::fake(['*/transactionalSMS/sms' => Http::response(['messageId' => 'abc'], 200)]);
        $admin = User::factory()->create(['role' => 'admin']);
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/test-sms', ['destination' => '+15551234567']);
        $res->assertStatus(200)->assertJsonPath('success', true);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/transactionalSMS/sms')
                && $request->hasHeader('api-key', 'test-key')
                && $request['recipient'] === '+15551234567';
        });
    }

    public function test_test_email_otp_endpoint_hits_brevo(): void
    {
        Http::fake(['*/smtp/email' => Http::response(['messageId' => 'abc'], 200)]);
        $admin = User::factory()->create(['role' => 'admin']);
        VerificationSetting::instance()->update(['brevo_api_key' => 'test-key', 'brevo_email_sender' => 'no-reply@horizon.gg']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/test-email-otp', ['destination' => 'someone@example.com']);
        $res->assertStatus(200)->assertJsonPath('success', true);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/smtp/email')
                && $request->hasHeader('api-key', 'test-key')
                && $request['to'][0]['email'] === 'someone@example.com';
        });
    }

    public function test_test_sms_endpoint_fails_cleanly_when_brevo_not_configured(): void
    {
        Http::fake();
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/verifications/test-sms', ['destination' => '+15551234567']);
        $res->assertStatus(500)->assertJsonPath('success', false);
        Http::assertNothingSent();
    }

    public function test_user_can_submit_manual_verification_request_and_admin_can_approve_it(): void
    {
        $user = User::factory()->create(['role' => 'user', 'phone_verified' => false]);
        $admin = User::factory()->create(['role' => 'admin']);

        $submitRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/phone/manual-request', ['phone' => '+15551234567']);
        $submitRes->assertStatus(200);
        $this->assertDatabaseHas('manual_verification_requests', [
            'user_id' => $user->id, 'type' => 'phone', 'status' => 'pending', 'contact' => '+15551234567',
        ]);

        // Duplicate pending request should be blocked.
        $dupRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/phone/manual-request', ['phone' => '+15551234567']);
        $dupRes->assertStatus(422);

        $listRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/verifications/phone-requests');
        $listRes->assertStatus(200);
        $this->assertCount(1, $listRes->json('requests'));
        $requestId = $listRes->json('requests.0.id');

        $approveRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/verifications/phone-requests/{$requestId}/approve");
        $approveRes->assertStatus(200)->assertJsonPath('success', true);

        $user->refresh();
        $this->assertTrue((bool) $user->phone_verified);
        $this->assertSame('+15551234567', $user->phone);
        $this->assertDatabaseHas('manual_verification_requests', ['id' => $requestId, 'status' => 'verified']);
    }

    public function test_rejecting_a_phone_request_requires_a_note_and_does_not_verify_the_user(): void
    {
        $user = User::factory()->create(['role' => 'user', 'phone_verified' => false]);
        $admin = User::factory()->create(['role' => 'admin']);
        $req = ManualVerificationRequest::create([
            'user_id' => $user->id, 'type' => 'phone', 'contact' => '+15551234567', 'status' => 'pending', 'created_at' => now(),
        ]);

        $noNoteRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/verifications/phone-requests/{$req->id}/reject", []);
        $noNoteRes->assertStatus(422);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/verifications/phone-requests/{$req->id}/reject", ['note' => 'Number does not match.']);
        $res->assertStatus(200);

        $this->assertFalse((bool) $user->fresh()->phone_verified);
        $this->assertDatabaseHas('manual_verification_requests', ['id' => $req->id, 'status' => 'rejected']);
    }

    public function test_non_admin_cannot_access_phone_requests(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->getJson('/api/admin/verifications/phone-requests');
        $res->assertStatus(403);
    }

    public function test_send_phone_otp_sends_via_brevo_sms(): void
    {
        Http::fake(['*/transactionalSMS/sms' => Http::response(['messageId' => 'abc'], 200)]);

        $user = User::factory()->create(['role' => 'user']);
        SiteSetting::create(['site_name' => 'Horizon Players']);
        VerificationSetting::instance()->update([
            'brevo_api_key' => 'test-key',
            'brevo_sms_sender' => 'Horizon',
            'brevo_sms_enabled' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/phone/send', ['phone' => '+15551234567']);
        $res->assertStatus(200);

        // Branded — a bare "Your verification code is..." with no sender identity reads as more
        // likely to be filtered by carrier spam detection, and doesn't look like a real OTP text.
        Http::assertSent(fn ($request) => str_contains($request->url(), '/transactionalSMS/sms')
            && str_starts_with($request['content'], 'Horizon Players:'));
        $this->assertDatabaseHas('otp_verifications', ['user_id' => $user->id, 'channel' => 'sms', 'destination' => '+15551234567']);
    }

    /**
     * The user-facing message on an SMS delivery failure must never be the raw Brevo response
     * text (SMS credit balance, provider error codes) — unprofessional and gives the user nothing
     * to act on. The real reason still reaches the Laravel log for admin troubleshooting.
     */
    public function test_send_phone_otp_shows_a_friendly_message_not_the_raw_brevo_error(): void
    {
        Http::fake(['*/transactionalSMS/sms' => Http::response(
            ['code' => 'invalid_parameter', 'message' => 'No sms related addons are found for the given organization'],
            400
        )]);

        $user = User::factory()->create(['role' => 'user']);
        VerificationSetting::instance()->update([
            'brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon', 'brevo_sms_enabled' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/phone/send', ['phone' => '+15551234567']);

        $res->assertStatus(500)
            ->assertJsonPath('message', 'We could not send the SMS right now. Please try again in a moment, or use Email verification instead.');
        $this->assertStringNotContainsString('addons', $res->json('message'));
        $this->assertDatabaseMissing('otp_verifications', ['user_id' => $user->id, 'channel' => 'sms']);
    }

    public function test_send_phone_otp_is_blocked_when_brevo_sms_is_disabled(): void
    {
        Http::fake();
        $user = User::factory()->create(['role' => 'user']);
        VerificationSetting::instance()->update([
            'brevo_api_key' => 'test-key', 'brevo_sms_sender' => 'Horizon', 'brevo_sms_enabled' => false,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/phone/send', ['phone' => '+15551234567']);
        $res->assertStatus(403);
        Http::assertNothingSent();
    }

    public function test_send_email_otp_sends_via_brevo_email(): void
    {
        Http::fake(['*/smtp/email' => Http::response(['messageId' => 'abc'], 200)]);

        $user = User::factory()->create(['role' => 'user', 'email' => 'otptest@example.com']);
        VerificationSetting::instance()->update([
            'brevo_api_key' => 'test-key', 'brevo_email_sender' => 'no-reply@horizon.gg', 'brevo_email_enabled' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/verification/email/send');
        $res->assertStatus(200);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/smtp/email') && $request['to'][0]['email'] === 'otptest@example.com';
        });
        $this->assertDatabaseHas('otp_verifications', ['user_id' => $user->id, 'channel' => 'email', 'destination' => 'otptest@example.com']);
    }
}
