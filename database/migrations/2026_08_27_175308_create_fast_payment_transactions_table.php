<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per FAST Payment (DollarPayWallet/Kashuuu) deposit attempt — linked 1:1 to the
     * normal `transactions` row (type=deposit) that actually represents the deposit in the
     * rest of the app (admin transactions list, balance history, etc). Kept as its own table
     * rather than bolting gateway-specific columns onto `transactions`, matching this
     * codebase's existing pattern (game_accounts, payment_gateway_accounts, ...).
     *
     * `order_sn` is OUR merchant-side order number (sent to FAST as order_sn / read back as
     * outer_order_sn) and is unique — the idempotency anchor: the webhook handler looks up by
     * this column, locks the row, and refuses to credit balance twice for it.
     * `fast_transaction_id` is FAST's OWN platform order number (their `transaction_id`),
     * captured for reference/reconciliation but never used as the matching key ourselves.
     */
    public function up(): void
    {
        Schema::create('fast_payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained('transactions')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('order_sn')->unique();
            $table->string('fast_transaction_id')->nullable()->index();
            $table->enum('provider', ['cashapp', 'applepay', 'googlepay']);
            $table->decimal('requested_amount', 12, 2);
            $table->decimal('confirmed_amount', 12, 2)->nullable();
            $table->enum('payment_status', ['pending', 'completed', 'failed', 'cancelled'])->default('pending');
            $table->text('pay_url')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('device_id')->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->index('payment_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fast_payment_transactions');
    }
};
