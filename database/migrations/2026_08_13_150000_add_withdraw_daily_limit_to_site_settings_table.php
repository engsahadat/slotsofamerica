<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            // Nullable = "not configured yet" -> falls back to a hardcoded default (100),
            // matching the admin UI's previous component-default. See
            // UserWithdrawApiController for the sliding-24h enforcement that reads this.
            $table->decimal('withdraw_daily_limit', 10, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->dropColumn('withdraw_daily_limit');
        });
    }
};
