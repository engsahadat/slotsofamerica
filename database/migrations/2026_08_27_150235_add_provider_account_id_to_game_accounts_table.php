<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The upstream provider's own account reference (e.g. External Signed's numeric
     * data.user_id, FastAPI's prefixed data.full_account) — captured for support/reference
     * only. Never used as the login username: our own generated username (see
     * GameUsernameGenerator) stays authoritative for every later API call, matching each
     * provider's own "account (not include prefix)" convention.
     */
    public function up(): void
    {
        Schema::table('game_accounts', function (Blueprint $table) {
            $table->string('provider_account_id', 100)->nullable()->after('username');
        });
    }

    public function down(): void
    {
        Schema::table('game_accounts', function (Blueprint $table) {
            $table->dropColumn('provider_account_id');
        });
    }
};
