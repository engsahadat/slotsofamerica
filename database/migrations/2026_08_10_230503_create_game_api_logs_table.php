<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_api_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->nullable()->constrained('game_api_providers')->onDelete('set null');
            $table->string('provider_name')->nullable();
            $table->string('action');
            $table->string('endpoint')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->integer('http_status')->nullable();
            $table->boolean('success')->default(false);
            $table->text('error_message')->nullable();
            $table->integer('duration_ms')->nullable();
            $table->unsignedBigInteger('related_user_id')->nullable();
            $table->unsignedBigInteger('related_transaction_id')->nullable();
            $table->unsignedBigInteger('related_request_id')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index('provider_id');
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_api_logs');
    }
};
