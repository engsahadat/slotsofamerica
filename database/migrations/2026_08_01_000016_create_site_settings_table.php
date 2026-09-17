<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_settings', function (Blueprint $table) {
            $table->id();
            $table->string('site_name')->default('Horizon Players');
            $table->string('logo_url')->nullable();
            $table->string('favicon_url')->nullable();
            $table->text('custom_css')->nullable();
            $table->json('colors')->nullable();
            $table->json('fonts')->nullable();
            $table->json('nav_links')->nullable();
            $table->json('landing_page_config')->nullable();
            $table->string('seo_title')->nullable();
            $table->text('seo_description')->nullable();
            $table->string('seo_keywords')->nullable();
            $table->text('header_scripts')->nullable();
            $table->text('body_scripts')->nullable();
            $table->text('footer_scripts')->nullable();
            $table->string('whatsapp_number')->nullable();
            $table->string('telegram_link')->nullable();
            $table->string('messenger_link')->nullable();
            $table->string('ghl_api_key')->nullable();
            $table->string('ghl_location_id')->nullable();
            $table->string('ghl_assigned_user_id')->nullable();
            $table->string('ghl_conversation_mode')->default('manual');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_settings');
    }
};
