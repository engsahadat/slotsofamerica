<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\ManualVerificationRequest;
use App\Models\Notification;
use App\Models\OtpVerification;
use App\Models\RewardHistory;
use App\Models\RewardsConfig;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Models\VerificationSetting;
use App\Services\BrevoService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class VerificationApiController extends Controller
{
    private const OTP_LENGTH = 6;

    public function sendEmailOtp(Request $request)
    {
        $settings = VerificationSetting::instance();

        if (!$settings->email_verification_enabled) {
            return response()->json([
                'message' => 'Email verification is currently disabled by administrator.',
            ], 403);
        }

        $user = $request->user();
        $cooldownSecs = $settings->resend_cooldown_seconds ?? 60;
        $expiryMins = $settings->otp_expiry_minutes ?? 5;

        $cooldown = $this->secondsUntilResendAllowed($user->id, 'email', $cooldownSecs);
        if ($cooldown > 0) {
            return response()->json([
                'message' => "Please wait {$cooldown}s before requesting another verification code.",
            ], 429);
        }

        if (!$settings->brevo_email_enabled) {
            return response()->json([
                'message' => 'Email verification delivery is currently disabled by administrator.',
            ], 403);
        }

        $code = $this->generateCode();

        Log::info("Email OTP Verification Code generated for User #{$user->id} ({$user->email}): {$code}");

        // Created before the send attempt (matches the previous SMTP-based behavior) so the
        // resend cooldown still applies even if Brevo delivery itself fails — protects against
        // rapid retry spam during a delivery outage, not just against successful sends.
        OtpVerification::create([
            'user_id' => $user->id,
            'channel' => 'email',
            'destination' => $user->email,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes($expiryMins),
        ]);

        try {
            $siteName = SiteSetting::first()?->site_name ?: 'Horizon Players';
            $html = view('emails.otp', ['code' => $code, 'siteName' => $siteName])->render();
            BrevoService::sendEmail($user->email, 'Your verification code', $html, $user->name ?? $user->username ?? null);
        } catch (Exception $e) {
            Log::error("Failed to send email verification OTP to User #{$user->id} ({$user->email}): " . $e->getMessage());

            return response()->json([
                'message' => 'Verification code generated, but email delivery failed. Please contact support or check Brevo settings.',
            ], 500);
        }

        return response()->json([
            'message' => 'Verification code sent to your email.',
        ]);
    }

    public function sendPhoneOtp(Request $request)
    {
        $settings = VerificationSetting::instance();

        if (!$settings->phone_verification_enabled) {
            return response()->json([
                'message' => 'Phone verification is currently disabled by administrator.',
            ], 403);
        }

        $user = $request->user();

        // Normalize phone input
        $rawPhone = (string) $request->input('phone', '');
        $cleaned = preg_replace('/[\s()\-]/', '', $rawPhone);

        // Auto-prepend +88 for BD local format e.g. 017...
        if (preg_match('/^01[3-9]\d{8}$/', $cleaned)) {
            $cleaned = '+88' . $cleaned;
        } elseif (preg_match('/^[1-9]\d{7,14}$/', $cleaned)) {
            $cleaned = '+' . $cleaned;
        }

        $request->merge(['phone' => $cleaned]);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+[1-9]\d{7,14}$/'],
        ], [
            'phone.regex' => 'Enter a valid phone number with country code, e.g. +1XXXXXXXXXX or +88017XXXXXXXX.',
        ]);

        $cooldownSecs = $settings->resend_cooldown_seconds ?? 60;
        $expiryMins = $settings->otp_expiry_minutes ?? 5;

        $cooldown = $this->secondsUntilResendAllowed($user->id, 'sms', $cooldownSecs);
        if ($cooldown > 0) {
            return response()->json([
                'message' => "Please wait {$cooldown}s before requesting another verification code.",
            ], 429);
        }

        if (!$settings->brevo_sms_enabled) {
            return response()->json([
                'message' => 'SMS verification delivery is currently disabled by administrator.',
            ], 403);
        }

        $code = $this->generateCode();
        $phone = $validated['phone'];
        // Leads with the site name — plain "Your verification code is..." with no sender
        // identity reads as more likely to be filtered/flagged by carrier spam detection than a
        // clearly branded message, and it's what every legitimate OTP text looks like anyway.
        $siteName = SiteSetting::first()?->site_name ?: 'Horizon Players';
        $text = "{$siteName}: Your verification code is {$code}. Expires in {$expiryMins} min. Do not share this code with anyone.";

        Log::info("Phone OTP Verification Code generated for User #{$user->id} ({$phone}): {$code}");

        try {
            BrevoService::sendSms($phone, $text);
        } catch (Exception $e) {
            Log::warning('Brevo SMS sending failed: ' . $e->getMessage());

            // Never the raw Brevo response text here — that's provider-internal detail (SMS
            // credit balance, API error codes) with nothing a user can act on, and reads as
            // unprofessional. The real reason is still fully captured in the log line above.
            return response()->json([
                'message' => 'We could not send the SMS right now. Please try again in a moment, or use Email verification instead.',
            ], 500);
        }

        OtpVerification::create([
            'user_id' => $user->id,
            'channel' => 'sms',
            'destination' => $phone,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes($expiryMins),
        ]);

        return response()->json([
            'message' => 'Verification code sent to your phone via SMS.',
        ]);
    }

    public function verifyOtp(Request $request)
    {
        $settings = VerificationSetting::instance();
        $user = $request->user();

        $validated = $request->validate([
            'channel' => 'required|in:email,sms',
            'code' => 'required|digits:' . self::OTP_LENGTH,
        ]);

        $otp = OtpVerification::where('user_id', $user->id)
            ->where('channel', $validated['channel'])
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (!$otp || $otp->expires_at->isPast()) {
            return response()->json([
                'message' => 'This verification code has expired. Please request a new one.',
            ], 422);
        }

        $maxAttempts = $settings->max_attempts ?? 5;
        if ($otp->attempts >= $maxAttempts) {
            return response()->json([
                'message' => 'Too many invalid attempts. Please request a new verification code.',
            ], 422);
        }

        $otp->increment('attempts');

        if (!Hash::check($validated['code'], $otp->code_hash)) {
            return response()->json([
                'message' => 'Invalid verification code.',
            ], 422);
        }

        $otp->verified_at = now();
        $otp->save();

        if ($validated['channel'] === 'email') {
            $user->email_verified_at = now();
        } else {
            $user->phone = $otp->destination;
            $user->phone_verified = true;
            $user->phone_verified_at = now();
        }
        $user->save();

        // Check & Process Automated Verification Rewards
        $rewardKey = $validated['channel'] === 'email' ? 'email_verification_reward' : 'phone_verification_reward';
        $reward = RewardsConfig::where('key', $rewardKey)->where('is_active', true)->first();

        $rewardMessage = '';
        if ($reward) {
            $alreadyClaimed = RewardHistory::where('user_id', $user->id)->where('reward_key', $rewardKey)->exists();
            if (!$alreadyClaimed) {
                $amount = (float) $reward->value;
                if ($amount > 0) {
                    DB::transaction(function () use ($user, $rewardKey, $reward, $amount) {
                        $user->balance = (float) $user->balance + $amount;
                        $user->save();

                        RewardHistory::create([
                            'user_id' => $user->id,
                            'reward_key' => $rewardKey,
                            'amount' => $amount,
                        ]);

                        Transaction::create([
                            'user_id' => $user->id,
                            'type' => 'reward',
                            'amount' => $amount,
                            'status' => 'approved',
                            'notes' => "Reward credited for verifying {$rewardKey}",
                        ]);
                    });
                    $rewardMessage = " Bonus \${$amount} credited!";
                }
            }
        }

        return response()->json([
            'message' => ($validated['channel'] === 'email' ? 'Email verified successfully!' : 'Phone verified successfully!') . $rewardMessage,
            'user' => $user->fresh(),
        ]);
    }

    /**
     * Fallback for when self-service SMS/WhatsApp OTP delivery isn't working — the user submits
     * their phone number for an admin to manually verify (Rewards & Verification -> Phone
     * Verification tab). Mirrors the reference project's phone-verify edge function.
     */
    public function requestManualPhoneVerification(Request $request)
    {
        $user = $request->user();

        if ($user->phone_verified) {
            return response()->json(['message' => 'Your phone number is already verified.'], 422);
        }

        $rawPhone = (string) $request->input('phone', '');
        $cleaned = preg_replace('/[\s()\-]/', '', $rawPhone);
        if (preg_match('/^01[3-9]\d{8}$/', $cleaned)) {
            $cleaned = '+88' . $cleaned;
        } elseif (preg_match('/^[1-9]\d{7,14}$/', $cleaned)) {
            $cleaned = '+' . $cleaned;
        }
        $request->merge(['phone' => $cleaned]);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:20', 'regex:/^\+[1-9]\d{7,14}$/'],
        ], [
            'phone.regex' => 'Enter a valid phone number with country code, e.g. +1XXXXXXXXXX or +88017XXXXXXXX.',
        ]);

        $existingPending = ManualVerificationRequest::where('user_id', $user->id)
            ->where('type', 'phone')
            ->where('status', 'pending')
            ->exists();
        if ($existingPending) {
            return response()->json(['message' => 'You already have a pending manual verification request. An admin will review it shortly.'], 422);
        }

        $user->phone = $validated['phone'];
        $user->save();

        ManualVerificationRequest::create([
            'user_id' => $user->id,
            'type' => 'phone',
            'contact' => $validated['phone'],
            'status' => 'pending',
            'created_at' => now(),
        ]);

        User::where('role', 'admin')->pluck('id')->each(function ($adminId) use ($user) {
            Notification::notify(
                $adminId,
                'Manual Phone Verification Requested',
                ($user->username ?? $user->name ?? 'A user') . " requested manual phone verification.",
                'info',
                'system'
            );
        });

        return response()->json(['message' => 'Your request has been submitted. An admin will verify your number shortly.']);
    }

    private function secondsUntilResendAllowed(int $userId, string $channel, int $cooldownSeconds): int
    {
        $latest = OtpVerification::where('user_id', $userId)
            ->where('channel', $channel)
            ->latest()
            ->first();

        if (!$latest) {
            return 0;
        }

        $elapsed = now()->diffInSeconds($latest->created_at, absolute: true);
        $remaining = $cooldownSeconds - $elapsed;

        return max(0, (int) $remaining);
    }

    private function generateCode(): string
    {
        return str_pad((string) random_int(0, 10 ** self::OTP_LENGTH - 1), self::OTP_LENGTH, '0', STR_PAD_LEFT);
    }
}
