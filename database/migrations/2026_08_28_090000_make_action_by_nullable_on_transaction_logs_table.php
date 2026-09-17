<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FAST Payment webhook confirmations (and any other future automated/system-driven
 * transaction status change with no human admin actor) need to write a TransactionLog
 * row, but `action_by` was a NOT NULL FK to `users` with no "system user" convention
 * anywhere in this codebase. Making it nullable is the correct fix: a null `action_by`
 * now means "system/automated action", while every existing admin-driven log entry
 * (AdminTransactionApiController) keeps setting a real admin id as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->dropForeign(['action_by']);
        });

        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->foreignId('action_by')->nullable()->change();
        });

        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->foreign('action_by')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->dropForeign(['action_by']);
        });

        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->foreignId('action_by')->nullable(false)->change();
        });

        Schema::table('transaction_logs', function (Blueprint $table) {
            $table->foreign('action_by')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
