<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VerificationSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'email_verification_enabled',
        'phone_verification_enabled',
        'otp_expiry_minutes',
        'resend_cooldown_seconds',
        'max_attempts',
        'max_per_hour',
        'smtp_host',
        'smtp_port',
        'smtp_username',
        'smtp_password',
        'smtp_encryption',
        'mail_from_address',
        'mail_from_name',
        // infobip_* / preferred_phone_channel intentionally no longer accepted here (or
        // anywhere else in the app) — replaced by Brevo below. The columns themselves still
        // exist in the database (nothing dropped), this just stops the old admin UI/API from
        // writing to them.
        'brevo_api_key',
        'brevo_sms_sender',
        'brevo_sms_enabled',
        'brevo_email_sender',
        'brevo_email_sender_name',
        'brevo_email_enabled',
    ];

    protected function casts(): array
    {
        return [
            'email_verification_enabled' => 'boolean',
            'phone_verification_enabled' => 'boolean',
            'brevo_sms_enabled' => 'boolean',
            'brevo_email_enabled' => 'boolean',
            'otp_expiry_minutes' => 'integer',
            'resend_cooldown_seconds' => 'integer',
            'max_attempts' => 'integer',
            'max_per_hour' => 'integer',
            'smtp_port' => 'integer',
        ];
    }

    /**
     * Get or create the singleton verification settings record.
     */
    public static function instance(): self
    {
        return static::firstOrCreate([], [
            'email_verification_enabled' => true,
            'phone_verification_enabled' => true,
            'otp_expiry_minutes' => 5,
            'resend_cooldown_seconds' => 60,
            'max_attempts' => 5,
            'smtp_port' => 587,
            'smtp_encryption' => 'tls',
            'mail_from_name' => 'Horizon Players',
            'brevo_sms_enabled' => true,
            'brevo_email_enabled' => true,
        ]);
    }
}
