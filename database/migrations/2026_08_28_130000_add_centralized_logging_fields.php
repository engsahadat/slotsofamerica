<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * API Logging hardening: brings game_api_logs, ghl_api_logs, and fast_payment_api_logs to a
 * consistent shape — every one of them should be able to answer "which provider, which
 * operation, which internal user/transaction, what provider-side reference, HTTP status,
 * success/failure, response time, timestamp" without digging into a raw JSON payload.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_api_logs', function (Blueprint $table) {
            $table->string('provider_reference')->nullable()->after('endpoint');
        });

        Schema::table('ghl_api_logs', function (Blueprint $table) {
            $table->string('provider')->nullable()->after('user_id');
            $table->string('provider_reference')->nullable()->after('provider');
        });

        Schema::table('fast_payment_api_logs', function (Blueprint $table) {
            $table->string('provider')->nullable()->after('fast_payment_transaction_id');
            $table->unsignedBigInteger('user_id')->nullable()->after('provider');
            $table->string('provider_reference')->nullable()->after('user_id');
            $table->unsignedSmallInteger('http_status')->nullable()->after('provider_reference');
        });
    }

    public function down(): void
    {
        Schema::table('game_api_logs', function (Blueprint $table) {
            $table->dropColumn('provider_reference');
        });

        Schema::table('ghl_api_logs', function (Blueprint $table) {
            $table->dropColumn(['provider', 'provider_reference']);
        });

        Schema::table('fast_payment_api_logs', function (Blueprint $table) {
            $table->dropColumn(['provider', 'user_id', 'provider_reference', 'http_status']);
        });
    }
};
