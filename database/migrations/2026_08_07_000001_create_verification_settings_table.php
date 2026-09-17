<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('verification_settings', function (Blueprint $table) {
            $table->id();
            
            // Feature Toggles & Limits
            $table->boolean('email_verification_enabled')->default(true);
            $table->boolean('phone_verification_enabled')->default(true);
            $table->unsignedInteger('otp_expiry_minutes')->default(5);
            $table->unsignedInteger('resend_cooldown_seconds')->default(60);
            $table->unsignedInteger('max_attempts')->default(5);

            // Dynamic SMTP Settings (overrides .env if set)
            $table->string('smtp_host')->nullable();
            $table->unsignedInteger('smtp_port')->nullable()->default(587);
            $table->string('smtp_username')->nullable();
            $table->string('smtp_password')->nullable();
            $table->string('smtp_encryption')->nullable()->default('tls');
            $table->string('mail_from_address')->nullable();
            $table->string('mail_from_name')->nullable()->default('Horizon Players');

            // Dynamic SMS / Infobip Credentials (overrides .env if set)
            $table->string('infobip_base_url')->nullable();
            $table->text('infobip_api_key')->nullable();
            $table->string('infobip_sms_sender')->nullable()->default('Horizon');
            $table->string('infobip_whatsapp_sender')->nullable();
            $table->boolean('infobip_sms_enabled')->default(true);
            $table->boolean('infobip_whatsapp_enabled')->default(false);
            $table->enum('preferred_phone_channel', ['sms', 'whatsapp'])->default('sms');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('verification_settings');
    }
};
