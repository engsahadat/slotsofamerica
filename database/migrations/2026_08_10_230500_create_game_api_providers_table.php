<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_api_providers', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('display_name');
            $table->string('base_url');
            $table->string('agent_username');
            $table->string('secret_name')->nullable()->comment('legacy env-var fallback for agent password');
            $table->boolean('is_active')->default(false);
            $table->boolean('automate_create_account')->default(false);
            $table->boolean('automate_deposit')->default(false);
            $table->boolean('automate_withdraw')->default(false);
            $table->text('notes')->nullable();

            // Request shape config
            $table->string('request_content_type')->default('multipart/form-data');
            $table->string('request_method')->default('POST');
            $table->json('custom_headers')->nullable();
            $table->string('proxy_url')->nullable();
            $table->boolean('requires_ip_whitelist')->default(false);
            $table->string('health_check_path')->default('/api/agent/login');
            $table->text('whitelist_ip_note')->nullable();
            $table->string('docs_url')->nullable();

            // Health tracking
            $table->string('last_health_status')->nullable();
            $table->text('last_health_message')->nullable();
            $table->integer('last_health_latency_ms')->nullable();
            $table->timestamp('last_health_checked_at')->nullable();
            $table->integer('consecutive_failures')->default(0);
            $table->timestamp('last_success_at')->nullable();
            $table->timestamp('last_failure_at')->nullable();
            $table->string('last_error_code')->nullable();
            $table->text('last_error_summary')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_api_providers');
    }
};
