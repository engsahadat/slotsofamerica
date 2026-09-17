<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Supports the instant (same-request) Game API recharge path in UserTransferApiController:
 * - idempotency_key: a client-generated token so a double-click / retried submission never
 *   creates a second transaction for the same intended action (unique when present).
 * - provider_reference: the recharge order/remark string sent to the Game API provider,
 *   stored for support/audit lookups ("Store provider transaction/reference ID where
 *   available" — not every protocol echoes back a distinct id, so this is our own
 *   deterministic reference, which is always available).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('idempotency_key')->nullable()->unique()->after('balance_reserved');
            $table->string('provider_reference')->nullable()->after('idempotency_key');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn(['idempotency_key', 'provider_reference']);
        });
    }
};
