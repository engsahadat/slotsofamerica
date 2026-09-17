<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('game_unlock_requests', function (Blueprint $table) {
            $table->foreignId('game_account_id')->nullable()->after('game_id')
                ->constrained('game_accounts')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('game_unlock_requests', function (Blueprint $table) {
            $table->dropForeign(['game_account_id']);
            $table->dropColumn('game_account_id');
        });
    }
};
