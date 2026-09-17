<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('game_unlock_requests', 'web_login_url')) {
            Schema::table('game_unlock_requests', function (Blueprint $table) {
                $table->string('web_login_url')->nullable()->after('game_password');
            });
        }

        if (!Schema::hasColumn('game_accounts', 'web_login_url')) {
            Schema::table('game_accounts', function (Blueprint $table) {
                $table->string('web_login_url')->nullable()->after('password_hash');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('game_unlock_requests', 'web_login_url')) {
            Schema::table('game_unlock_requests', function (Blueprint $table) {
                $table->dropColumn('web_login_url');
            });
        }

        if (Schema::hasColumn('game_accounts', 'web_login_url')) {
            Schema::table('game_accounts', function (Blueprint $table) {
                $table->dropColumn('web_login_url');
            });
        }
    }
};
