<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Credentials for the "FAST Payment" automated deposit gateway (DollarPayWallet /
     * Kashuuu — merchant.kashuuu.com). Deliberately prefixed "fast_payment_", NOT "fast_api_"
     * — the latter already exists on this table for a completely unrelated legacy Game API
     * provider (Fire Kirin-style game panel), and reusing that prefix would be a serious
     * mix-up between a game integration and a real-money payment gateway.
     */
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->string('fast_payment_base_url')->nullable()->after('river_pay_password');
            $table->string('fast_payment_merchant_id')->nullable()->after('fast_payment_base_url');
            $table->text('fast_payment_key')->nullable()->after('fast_payment_merchant_id');
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->dropColumn(['fast_payment_base_url', 'fast_payment_merchant_id', 'fast_payment_key']);
        });
    }
};
