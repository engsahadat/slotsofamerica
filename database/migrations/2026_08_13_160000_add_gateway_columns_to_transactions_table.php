<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            // Nullable: existing rows and non-deposit transaction types have no gateway. Lets
            // admins reliably filter/report deposits by gateway instead of parsing free-text
            // `notes` (see UserDepositApiController::store).
            $table->foreignId('gateway_id')->nullable()->after('game_id')->constrained('payment_gateways')->nullOnDelete();
            $table->foreignId('gateway_account_id')->nullable()->after('gateway_id')->constrained('payment_gateway_accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('gateway_id');
            $table->dropConstrainedForeignId('gateway_account_id');
        });
    }
};
