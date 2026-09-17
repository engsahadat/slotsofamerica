<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_gateway_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gateway_id')->constrained('payment_gateways')->onDelete('cascade');
            $table->string('account_name');
            $table->string('account_number');
            $table->integer('priority_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->string('qr_code_url')->nullable();
            $table->string('deep_link')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_gateway_accounts');
    }
};
