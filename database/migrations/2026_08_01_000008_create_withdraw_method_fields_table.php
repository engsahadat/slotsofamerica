<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('withdraw_method_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('method_id')->constrained('withdraw_methods')->onDelete('cascade');
            $table->string('field_name');
            $table->string('field_label');
            $table->enum('field_type', ['text', 'number', 'email', 'textarea', 'select'])->default('text');
            $table->string('placeholder')->nullable();
            $table->boolean('is_required')->default(true);
            $table->string('validation_rule')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('withdraw_method_fields');
    }
};
