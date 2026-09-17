<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backups', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // full | customers | emergency | restore | storage
            $table->string('format'); // zip | csv | json
            $table->string('scope')->default('manual'); // manual | daily | weekly
            $table->string('status')->default('pending'); // pending | running | success | failed | expired
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('storage_path')->nullable();
            $table->text('error')->nullable();
            $table->json('meta')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index(['type', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backups');
    }
};
