<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('category')->default('custom'); // transaction | promo | game | welcome | custom
            $table->string('transaction_type')->nullable();
            $table->string('trigger_event')->default('manual')->index(); // 'manual' = never auto-sent
            $table->string('subject');
            $table->longText('body_html');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_templates');
    }
};
