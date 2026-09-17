<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            // Game Agent API Credentials
            $table->string('game_agent_base_url')->nullable();
            $table->string('game_agent_id')->nullable();
            $table->text('game_agent_secret_key')->nullable();

            // Orion Stars API Credentials
            $table->string('orion_stars_base_url')->nullable();
            $table->string('orion_stars_agent_name')->nullable();
            $table->text('orion_stars_agent_password')->nullable();

            // Fast API Credentials
            $table->string('fast_api_base_url')->nullable();
            $table->string('fast_api_app_id')->nullable();
            $table->text('fast_api_app_secret')->nullable();
            $table->string('fast_api_agent_account')->nullable();
            $table->text('fast_api_agent_password')->nullable();

            // River Pay Credentials
            $table->string('river_pay_base_url')->nullable();
            $table->string('river_pay_login')->nullable();
            $table->text('river_pay_password')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->dropColumn([
                'game_agent_base_url',
                'game_agent_id',
                'game_agent_secret_key',
                'orion_stars_base_url',
                'orion_stars_agent_name',
                'orion_stars_agent_password',
                'fast_api_base_url',
                'fast_api_app_id',
                'fast_api_app_secret',
                'fast_api_agent_account',
                'fast_api_agent_password',
                'river_pay_base_url',
                'river_pay_login',
                'river_pay_password',
            ]);
        });
    }
};
