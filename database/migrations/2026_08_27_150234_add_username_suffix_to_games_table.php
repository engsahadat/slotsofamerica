<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Admin-configurable per-game username suffix — e.g. Game Vault -> "GV", Juwa -> "JW",
     * Orion Star -> "OS" — appended to a player's own site username to build their game
     * account name (see App\Services\GameUsernameGenerator), so the same person's account on
     * different games is recognizable ("john123GV" vs "john123JW") instead of an unrelated
     * random string. Not algorithmically derivable in general (e.g. "Juwa" -> "JW", not the
     * "JU" a first-two-letters rule would give), so this must be a real per-row setting rather
     * than logic scattered through the app — hence a column, editable from Admin -> Games.
     */
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->string('username_suffix', 10)->nullable()->after('name');
        });

        // Seed sensible values for the games already known to exist in this app (see
        // DatabaseSeeder.php) — everything else falls back to a derived suffix at runtime
        // (GameUsernameGenerator::suffixFor()) until an admin sets one explicitly.
        $known = [
            'Cash Machine' => 'CM',
            'Fire Kirin' => 'FK',
            'Game Room' => 'GR',
            'Game Vault' => 'GV',
            'Juwa' => 'JW',
            'Milky Way' => 'MW',
            'Orion Star' => 'OS',
            'Panda Master' => 'PM',
            'River Sweeps' => 'RS',
        ];
        foreach ($known as $name => $suffix) {
            DB::table('games')->where('name', $name)->whereNull('username_suffix')->update(['username_suffix' => $suffix]);
        }
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn('username_suffix');
        });
    }
};
