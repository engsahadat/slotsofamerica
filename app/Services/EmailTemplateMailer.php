<?php

namespace App\Services;

use App\Mail\GenericTemplateMail;
use App\Models\EmailTemplate;
use App\Models\SiteSetting;
use App\Models\User;
use App\Models\VerificationSetting;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Renders admin-authored Email Templates (placeholder substitution) and sends them —
 * used both by the "Send Test" button and by real trigger events (transaction
 * approved/rejected, password request approved/rejected, user registered).
 *
 * Deliberately NOT wired into the email-verification OTP or password-reset flows
 * (App\Mail\OtpMail / App\Mail\ResetPasswordMail) — those already work via hardcoded
 * Blade mailables with their own required variables (the OTP code, the signed reset
 * URL) that aren't part of this template system's placeholder set, so merging them
 * would risk breaking a working auth flow for comparatively little benefit.
 */
class EmailTemplateMailer
{
    /** Configures the default mailer from VerificationSetting/SiteSetting, same as VerificationApiController::configureMailSystem(). */
    private static function configureMail(): void
    {
        $settings = VerificationSetting::instance();
        $siteSettings = SiteSetting::first();

        $smtpHost = $settings->smtp_host ?: $siteSettings?->smtp_host;
        $smtpPort = $settings->smtp_port ?: $siteSettings?->smtp_port ?? 587;
        $smtpUser = $settings->smtp_username ?: $settings->smtp_email ?: $siteSettings?->smtp_email;
        $smtpPass = $settings->smtp_password ?: $siteSettings?->smtp_password;
        $fromAddress = $settings->mail_from_address ?: $smtpUser ?: 'noreply@horizon.gg';
        $fromName = $settings->mail_from_name ?: $siteSettings?->site_name ?: config('app.name', 'Horizon Players');

        if (!empty($smtpHost)) {
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
        }
    }

    public static function render(string $text, array $vars): string
    {
        $replacements = [];
        foreach ($vars as $key => $value) {
            $replacements['{{' . $key . '}}'] = (string) $value;
        }

        return strtr($text, $replacements);
    }

    /** Dummy data matching the admin UI's own client-side preview (Notifications page keeps these in sync). */
    public static function previewVars(): array
    {
        $site = SiteSetting::first();

        return [
            'user_name' => 'John Doe',
            'email' => 'john@example.com',
            'amount' => '50.00',
            'type' => 'deposit',
            'status' => 'Pending',
            'site_name' => $site?->site_name ?: 'Horizon Players',
            'date' => now()->format('n/j/Y'),
            'game_name' => 'Slots Master',
            'confirmation_url' => config('app.url'),
            'logo_url' => $site?->logo_url ?: '',
        ];
    }

    public static function sendTest(string $to, string $subject, string $bodyHtml): void
    {
        self::configureMail();
        $vars = self::previewVars();
        Mail::to($to)->send(new GenericTemplateMail(self::render($subject, $vars), self::render($bodyHtml, $vars)));
    }

    /**
     * Fire-and-forget: sends the active template matching $triggerEvent to $user, if one exists.
     * Never throws — logs and swallows failures so callers (transaction review, registration,
     * etc.) never fail because of a broken/missing email template or SMTP outage.
     */
    public static function fireTrigger(string $triggerEvent, User $user, array $data = []): void
    {
        try {
            $template = EmailTemplate::where('trigger_event', $triggerEvent)->where('is_active', true)->first();
            if (!$template || !$user->email) {
                return;
            }
            // Settings → Notifications → "Email Notifications" toggle used to be write-only (it
            // persisted but nothing ever checked it) — now every triggered email respects it.
            // Defaults to true (matches the User model's cast default), so this only changes
            // behavior for users who've actively opted out.
            if ($user->email_notifications === false) {
                return;
            }

            $site = SiteSetting::first();
            $vars = array_merge([
                'user_name' => $user->name ?: $user->username ?: 'there',
                'email' => $user->email,
                'site_name' => $site?->site_name ?: 'Horizon Players',
                'date' => now()->format('n/j/Y'),
                'logo_url' => $site?->logo_url ?: '',
                'confirmation_url' => config('app.url'),
                'amount' => '',
                'type' => '',
                'status' => '',
                'game_name' => '',
            ], $data);

            self::configureMail();
            Mail::to($user->email)->send(new GenericTemplateMail(self::render($template->subject, $vars), self::render($template->body_html, $vars)));
        } catch (Exception $e) {
            Log::warning("EmailTemplateMailer: failed to send trigger '{$triggerEvent}' to user #{$user->id}: " . $e->getMessage());
        }
    }
}
