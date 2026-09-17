<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replaces Infobip with Brevo for SMS + Email OTP delivery. The old Infobip columns and
 * preferred_phone_channel are deliberately left in place (never dropped) — no longer read by
 * any sending path or exposed in the admin UI, but kept for rollback safety and so historical
 * settings rows aren't silently destroyed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->text('brevo_api_key')->nullable()->after('infobip_email_enabled');
            $table->string('brevo_sms_sender')->nullable()->after('brevo_api_key');
            $table->boolean('brevo_sms_enabled')->default(true)->after('brevo_sms_sender');
            $table->string('brevo_email_sender')->nullable()->after('brevo_sms_enabled');
            $table->string('brevo_email_sender_name')->nullable()->after('brevo_email_sender');
            $table->boolean('brevo_email_enabled')->default(true)->after('brevo_email_sender_name');
        });
    }

    public function down(): void
    {
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->dropColumn(['brevo_api_key', 'brevo_sms_sender', 'brevo_sms_enabled', 'brevo_email_sender', 'brevo_email_sender_name', 'brevo_email_enabled']);
        });
    }
};
