<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only audit trail for every GoHighLevel API call GoHighLevelService makes —
     * mirrors game_api_logs' shape/conventions so the same admin patterns apply.
     */
    public function up(): void
    {
        Schema::create('ghl_api_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->string('action'); // 'upsert_contact', 'update_contact', 'bulk_sync', ...
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->integer('http_status')->nullable();
            $table->boolean('success')->default(false);
            $table->text('error_message')->nullable();
            $table->integer('duration_ms')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index('user_id');
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ghl_api_logs');
    }
};
