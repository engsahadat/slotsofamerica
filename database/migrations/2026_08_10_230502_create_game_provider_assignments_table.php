<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_provider_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->unique()->constrained('games')->onDelete('cascade');
            $table->foreignId('provider_id')->constrained('game_api_providers')->onDelete('cascade');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_provider_assignments');
    }
};
