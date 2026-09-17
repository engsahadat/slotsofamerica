<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\AuditLog;
use App\Models\ManualVerificationRequest;
use App\Models\Notification;
use App\Models\OtpVerification;
use App\Models\RewardHistory;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\VerificationSetting;
use App\Services\BrevoService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class AdminVerificationApiController extends Controller
{
    public function users(Request $request)
    {
        $users = User::select([
            'id',
            'legacy_id',
            'name',
            'username',
            'email',
            'phone',
            'email_verified_at',
            'email_verified_by_admin',
            'phone_verified',
            'phone_verified_at',
            'created_at',
            'balance',
            'role',
            'country',
            'state',
        ])->orderBy('created_at', 'desc')->get();

        return response()->json(['users' => $users]);
    }

    public function toggleUserVerification(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:email,phone',
            'verified' => 'required|boolean',
        ]);

        $user = User::findOrFail($validated['user_id']);

        if ($validated['type'] === 'email') {
            $user->email_verified_at = $validated['verified'] ? now() : null;
            $user->email_verified_by_admin = $validated['verified'];
        } else {
            $user->phone_verified = $validated['verified'];
            $user->phone_verified_at = $validated['verified'] ? now() : null;
        }

        $user->save();

        AuditLog::record($request, 'toggled_user_verification', 'User', $user->id, [
            'type' => $validated['type'],
            'verified' => $validated['verified'],
        ]);

        return response()->json([
            'message' => "User {$validated['type']} verification status updated successfully.",
            'user' => $user,
        ]);
    }

    public function settings()
    {
        $settings = VerificationSetting::instance();
        return response()->json(['settings' => $settings]);
    }

    public function updateSettings(Request $request)
    {
        $settings = VerificationSetting::instance();

        $validated = $request->validate([
            'email_verification_enabled' => 'nullable|boolean',
            'phone_verification_enabled' => 'nullable|boolean',
            'otp_expiry_minutes' => 'nullable|integer|min:1|max:60',
            'resend_cooldown_seconds' => 'nullable|integer|min:10|max:600',
            'max_attempts' => 'nullable|integer|min:1|max:20',
            'max_per_hour' => 'nullable|integer|min:1|max:100',

            // SMTP Settings
            'smtp_host' => 'nullable|string|max:255',
            'smtp_port' => 'nullable|integer|min:1|max:65535',
            'smtp_username' => 'nullable|string|max:255',
            'smtp_password' => 'nullable|string|max:255',
            'smtp_encryption' => 'nullable|string|max:10',
            'mail_from_address' => 'nullable|email|max:255',
            'mail_from_name' => 'nullable|string|max:255',

            // Brevo API Credentials (SMS + Email OTP delivery — replaces Infobip)
            'brevo_api_key' => 'nullable|string',
            'brevo_sms_sender' => 'nullable|string|max:50',
            'brevo_sms_enabled' => 'nullable|boolean',
            'brevo_email_sender' => 'nullable|email|max:255',
            'brevo_email_sender_name' => 'nullable|string|max:100',
            'brevo_email_enabled' => 'nullable|boolean',
        ]);

        // Smart validation — a copy-pasted API key/sender with a stray leading/trailing space
        // or newline is invisible in a text input and indistinguishable from "wrong credential"
        // once sent to Brevo (same fix already applied to Game API Providers/GHL/FAST credentials
        // elsewhere in Site Settings).
        foreach (['brevo_api_key', 'brevo_sms_sender', 'brevo_email_sender', 'brevo_email_sender_name'] as $field) {
            if (isset($validated[$field]) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }

        // Allow smtp_email input from UI to populate smtp_username and mail_from_address if not separately provided
        if ($request->has('smtp_email') && $request->input('smtp_email')) {
            $smtpEmail = $request->input('smtp_email');
            if (empty($validated['smtp_username'])) {
                $validated['smtp_username'] = $smtpEmail;
            }
            if (empty($validated['mail_from_address'])) {
                $validated['mail_from_address'] = $smtpEmail;
            }
        }

        $settings->update($validated);

        AuditLog::record($request, 'updated_verification_settings', 'VerificationSetting', $settings->id, [
            'updated_by' => $request->user()->id,
        ]);

        return response()->json([
            'message' => 'Verification settings and API credentials updated successfully.',
            'settings' => $settings->fresh(),
        ]);
    }

    public function codes()
    {
        $codes = OtpVerification::with('user:id,username,email,phone')
            ->latest()
            ->limit(300)
            ->get();

        return response()->json(['codes' => $codes]);
    }

    public function history()
    {
        $history = RewardHistory::with('user:id,username,email')
            ->latest()
            ->limit(300)
            ->get();

        return response()->json(['history' => $history]);
    }

    public function invalidateCodes(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'channel' => 'nullable|in:email,sms',
        ]);

        $query = OtpVerification::where('user_id', $validated['user_id'])->whereNull('verified_at');
        if (!empty($validated['channel'])) {
            $query->where('channel', $validated['channel']);
        }

        $count = $query->update(['verified_at' => now()]);

        return response()->json([
            'message' => "Invalidated {$count} pending verification code(s).",
        ]);
    }

    /** "Test SMTP" button in OTP Settings — replaces the dead send-test-email edge function call. */
    public function testEmail(Request $request)
    {
        $validated = $request->validate([
            'to' => 'nullable|email',
        ]);

        $to = $validated['to'] ?? $request->user()->email;
        $settings = VerificationSetting::instance();
        $siteSettings = SiteSetting::first();

        $smtpHost = $settings->smtp_host ?: $siteSettings?->smtp_host;
        $smtpPort = $settings->smtp_port ?: $siteSettings?->smtp_port ?? 587;
        $smtpUser = $settings->smtp_username ?: $siteSettings?->smtp_email;
        $smtpPass = $settings->smtp_password ?: $siteSettings?->smtp_password;
        $fromAddress = $settings->mail_from_address ?: $smtpUser ?: 'noreply@horizon.gg';
        $fromName = $settings->mail_from_name ?: $siteSettings?->site_name ?: config('app.name', 'Horizon Players');

        if (empty($smtpHost)) {
            return response()->json(['success' => false, 'message' => 'No SMTP host configured yet — enter one below and save before testing.'], 422);
        }

        config([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => $smtpHost,
            'mail.mailers.smtp.port' => $smtpPort,
            'mail.mailers.smtp.username' => $smtpUser,
            'mail.mailers.smtp.password' => $smtpPass,
            'mail.mailers.smtp.encryption' => $settings->smtp_encryption ?? 'tls',
            'mail.from.address' => $fromAddress,
            'mail.from.name' => $fromName,
        ]);

        try {
            Mail::to($to)->send(new OtpMail('123456'));
        } catch (Exception $e) {
            return response()->json(['success' => false, 'message' => 'SMTP test failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['success' => true, 'message' => "Test email sent to {$to}."]);
    }

    /** "Test SMS OTP" button (Brevo). */
    public function testSms(Request $request)
    {
        $validated = $request->validate([
            'destination' => 'required|string|max:32',
        ]);

        try {
            BrevoService::sendSms($validated['destination'], 'This is a test message from your Horizon Players admin panel. Brevo SMS is configured correctly.');
        } catch (Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        return response()->json(['success' => true, 'message' => "Test SMS sent to {$validated['destination']}."]);
    }

    /** "Test Email OTP" button (Brevo) — distinct from testEmail() above, which tests the
     * separate SMTP path used for transaction/password-request emails, not OTP delivery. */
    public function testEmailOtp(Request $request)
    {
        $validated = $request->validate([
            'destination' => 'required|email',
        ]);

        try {
            $siteName = SiteSetting::first()?->site_name ?: 'Horizon Players';
            $html = view('emails.otp', ['code' => '123456', 'siteName' => $siteName])->render();
            BrevoService::sendEmail($validated['destination'], 'Test verification code', $html);
        } catch (Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }

        return response()->json(['success' => true, 'message' => "Test email sent to {$validated['destination']}."]);
    }

    /** Manual phone-verification review queue (fallback path next to the self-service SMS OTP flow). */
    public function phoneRequests()
    {
        $requests = ManualVerificationRequest::with(['user:id,name,username,email,phone', 'reviewer:id,name,username'])
            ->where('type', 'phone')
            ->where('status', 'pending')
            ->latest('created_at')
            ->get();

        return response()->json(['requests' => $requests]);
    }

    public function approvePhoneRequest(Request $request, $id)
    {
        $req = ManualVerificationRequest::where('type', 'phone')->where('status', 'pending')->find($id);
        if (!$req) {
            return response()->json(['message' => 'Request not found or already processed.'], 404);
        }

        $note = $request->input('note');
        $user = User::findOrFail($req->user_id);
        $user->phone = $req->contact;
        $user->phone_verified = true;
        $user->phone_verified_at = now();
        $user->save();

        $req->update([
            'status' => 'verified',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'admin_note' => $note,
        ]);

        Notification::notify($user->id, 'Phone Verified', 'Your phone number has been manually verified by an admin.', 'success', 'system');
        AuditLog::record($request, 'verify_phone_request', 'ManualVerificationRequest', $req->id, ['user_id' => $user->id, 'phone' => $req->contact]);

        return response()->json(['success' => true, 'message' => 'Phone verification approved.', 'request' => $req->fresh()]);
    }

    public function rejectPhoneRequest(Request $request, $id)
    {
        $validated = $request->validate(['note' => 'required|string|max:1000']);

        $req = ManualVerificationRequest::where('type', 'phone')->where('status', 'pending')->find($id);
        if (!$req) {
            return response()->json(['message' => 'Request not found or already processed.'], 404);
        }

        $req->update([
            'status' => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'admin_note' => $validated['note'],
        ]);

        Notification::notify($req->user_id, 'Phone Verification Rejected', 'Reason: ' . $validated['note'], 'warning', 'system');
        AuditLog::record($request, 'reject_phone_request', 'ManualVerificationRequest', $req->id, ['user_id' => $req->user_id, 'reason' => $validated['note']]);

        return response()->json(['success' => true, 'message' => 'Phone verification rejected.', 'request' => $req->fresh()]);
    }
}
