<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->unsignedInteger('max_per_hour')->nullable()->after('max_attempts');
            $table->string('infobip_email_sender')->nullable()->after('infobip_whatsapp_sender');
            $table->boolean('infobip_email_enabled')->default(false)->after('infobip_whatsapp_enabled');
        });

        // Widen preferred_phone_channel from a 2-value enum (sms|whatsapp) to a plain string
        // supporting the admin UI's actual 4-value semantics (sms_only|whatsapp_only|sms_first|
        // whatsapp_first). Drop+re-add (rather than a raw MODIFY/->change()) so this works on both
        // MySQL and the SQLite connection the test suite runs against without doctrine/dbal.
        $existing = DB::table('verification_settings')->select('id', 'preferred_phone_channel')->get();

        Schema::table('verification_settings', function (Blueprint $table) {
            $table->dropColumn('preferred_phone_channel');
        });
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->string('preferred_phone_channel', 20)->default('sms_only')->after('infobip_email_enabled');
        });

        foreach ($existing as $row) {
            $migrated = match ($row->preferred_phone_channel) {
                'whatsapp' => 'whatsapp_only',
                'sms' => 'sms_only',
                default => 'sms_only',
            };
            DB::table('verification_settings')->where('id', $row->id)->update(['preferred_phone_channel' => $migrated]);
        }
    }

    public function down(): void
    {
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->dropColumn(['max_per_hour', 'infobip_email_sender', 'infobip_email_enabled']);
        });

        $existing = DB::table('verification_settings')->select('id', 'preferred_phone_channel')->get();

        Schema::table('verification_settings', function (Blueprint $table) {
            $table->dropColumn('preferred_phone_channel');
        });
        Schema::table('verification_settings', function (Blueprint $table) {
            $table->string('preferred_phone_channel', 20)->default('sms');
        });

        foreach ($existing as $row) {
            $migrated = str_starts_with((string) $row->preferred_phone_channel, 'whatsapp') ? 'whatsapp' : 'sms';
            DB::table('verification_settings')->where('id', $row->id)->update(['preferred_phone_channel' => $migrated]);
        }
    }
};
