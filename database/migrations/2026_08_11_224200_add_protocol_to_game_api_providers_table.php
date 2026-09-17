<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_api_providers', function (Blueprint $table) {
            // 'agent_login' — username+password login → bearer token (e.g. gameroom777).
            // 'external_signed' — agent_id+timestamp+secret_key HMAC-signed requests,
            //   no login step (e.g. gamevault999; see API-Documentation.pdf).
            $table->string('protocol')->default('agent_login')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('game_api_providers', function (Blueprint $table) {
            $table->dropColumn('protocol');
        });
    }
};
