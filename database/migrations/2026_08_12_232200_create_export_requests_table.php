<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manager_id')->constrained('users')->cascadeOnDelete();
            $table->string('export_type')->default('transactions');
            $table->json('filters');
            $table->text('reason')->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected | expired
            $table->unsignedInteger('row_count')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('admin_note')->nullable();
            $table->timestamp('approved_expires_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index(['manager_id', 'status']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_requests');
    }
};
