<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            // Nullable = "not configured yet, fall back to config/redeem.php's env-backed
            // defaults" — see UserRedeemApiController. This lets Admin -> Redeem Settings
            // actually persist and take effect without needing a .env change + config cache
            // clear (which isn't possible from a web request).
            $table->decimal('redeem_min_amount', 10, 2)->nullable();
            $table->decimal('redeem_max_amount', 10, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('site_settings', function (Blueprint $table) {
            $table->dropColumn(['redeem_min_amount', 'redeem_max_amount']);
        });
    }
};
