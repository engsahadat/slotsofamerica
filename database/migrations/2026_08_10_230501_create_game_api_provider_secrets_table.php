<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_api_provider_secrets', function (Blueprint $table) {
            $table->foreignId('provider_id')->primary()->constrained('game_api_providers')->onDelete('cascade');
            $table->text('agent_password');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_api_provider_secrets');
    }
};
