<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Financial Transaction Safety hardening: every transaction that actually moves real money
 * (Recharge, Redeem, FAST Deposit — and, where derivable, the older deposit/withdraw flows)
 * now records which provider handled it and a before/after balance snapshot at the moment it
 * completed, plus a structured failure reason distinct from the free-text `notes` field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('provider')->nullable()->after('provider_reference');
            $table->decimal('balance_before', 12, 2)->nullable()->after('provider');
            $table->decimal('balance_after', 12, 2)->nullable()->after('balance_before');
            $table->text('failure_reason')->nullable()->after('balance_after');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn(['provider', 'balance_before', 'balance_after', 'failure_reason']);
        });
    }
};
