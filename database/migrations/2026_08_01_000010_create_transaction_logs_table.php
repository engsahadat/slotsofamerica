<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaction_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained('transactions')->onDelete('cascade');
            $table->string('action');
            $table->foreignId('action_by')->constrained('users')->onDelete('cascade');
            $table->string('old_status')->nullable();
            $table->string('new_status')->nullable();
            $table->decimal('old_amount', 12, 2)->nullable();
            $table->decimal('new_amount', 12, 2)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('action_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_logs');
    }
};
