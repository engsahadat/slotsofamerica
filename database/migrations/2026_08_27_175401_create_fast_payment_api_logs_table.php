<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Append-only audit trail for every FAST Payment API call AND every inbound webhook —
     * including rejected/invalid-signature webhooks, which never touch fast_payment_transactions
     * at all otherwise and would be invisible without this. */
    public function up(): void
    {
        Schema::create('fast_payment_api_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fast_payment_transaction_id')->nullable()
                ->constrained('fast_payment_transactions')->nullOnDelete();
            $table->string('action'); // 'create_payment', 'query_payment', 'webhook_notify'
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->boolean('signature_valid')->nullable();
            $table->boolean('success')->default(false);
            $table->text('error_message')->nullable();
            $table->integer('duration_ms')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fast_payment_api_logs');
    }
};
