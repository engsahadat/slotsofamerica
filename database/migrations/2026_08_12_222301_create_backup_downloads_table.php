<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('backup_downloads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('backup_id')->constrained('backups')->cascadeOnDelete();
            $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
            $table->string('ip')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index('backup_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('backup_downloads');
    }
};
