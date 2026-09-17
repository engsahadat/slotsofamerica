<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('withdraw_methods', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('logo_url')->nullable();
            $table->decimal('minimum_amount', 12, 2)->default(0.00);
            $table->decimal('maximum_amount', 12, 2)->default(10000.00);
            $table->decimal('fee_percentage', 5, 2)->default(0.00);
            $table->decimal('fee_fixed', 12, 2)->default(0.00);
            $table->string('processing_time')->default('Instant');
            $table->text('instructions')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('withdraw_methods');
    }
};
