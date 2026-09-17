<?php

namespace Database\Seeders;

use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\GameProviderAssignment;
use Illuminate\Database\Seeder;

/**
 * Seeds the Game API Providers module (/admin/game-api-providers) with the
 * providers and game assignments configured during development, so they
 * can be reproduced on another environment (e.g. live) with one command:
 *
 *   php artisan db:seed --class=GameApiProviderSeeder
 *
 * Agent passwords / secret keys are NEVER hardcoded here — real credentials
 * don't belong in a file that gets committed to git. Set them via .env
 * (see the GAMEROOM777_AGENT_PASSWORD / GAMEVAULT999_SECRET_KEY keys added
 * to .env.example) and this seeder will pick them up; if unset, it skips
 * that provider's secret and you set it later from the Providers tab →
 * "Set agent password".
 */
class GameApiProviderSeeder extends Seeder
{
    public function run(): void
    {
        $gameroom777 = GameApiProvider::updateOrCreate(
            ['name' => 'gameroom777'],
            [
                'protocol' => 'agent_login',
                'display_name' => 'Game Room 777',
                'base_url' => 'https://agentserver1.gameroom777.com',
                'agent_username' => 'Teststore22',
                'is_active' => true,
                'automate_create_account' => true,
                'automate_deposit' => false,
                'automate_withdraw' => false,
                'request_content_type' => 'multipart/form-data',
                'request_method' => 'POST',
                'health_check_path' => '/api/agent/login',
            ]
        );

        $gamevault999 = GameApiProvider::updateOrCreate(
            ['name' => 'gamevault999'],
            [
                'protocol' => 'external_signed',
                'display_name' => 'Game Vault 999',
                'base_url' => 'https://apius.gamevault999.com',
                // NOTE: "Megacashier" was provided by the vendor but the live
                // API rejected it with "Invalid request parameters" (code 2)
                // during testing — confirm the correct numeric agent_id with
                // the vendor before relying on this provider. Left inactive
                // below until that's confirmed.
                'agent_username' => 'Megacashier',
                'is_active' => false,
                'automate_create_account' => true,
                'automate_deposit' => false,
                'automate_withdraw' => false,
                'request_content_type' => 'multipart/form-data',
                'request_method' => 'POST',
                'health_check_path' => '/api/agent/login',
                'notes' => "Uses the vendor's External API protocol (agent_id + timestamp + secret_key HMAC signing — see API-Documentation.pdf), not the Bearer-login style. agent_username here holds the agent_id. Vendor-provided secret_key: set via GAMEVAULT999_SECRET_KEY in .env or the Providers tab. As of last test, the vendor's server returned 'Invalid request parameters' (code 2) — the agent_id likely needs to be the vendor's numeric ID rather than 'Megacashier'; confirm and update before activating.",
            ]
        );

        // Secrets — only set if present in .env. Never hardcode real
        // credentials in a seeder file.
        if ($password = env('GAMEROOM777_AGENT_PASSWORD')) {
            GameApiProviderSecret::updateOrCreate(
                ['provider_id' => $gameroom777->id],
                ['agent_password' => $password]
            );
        }
        if ($secretKey = env('GAMEVAULT999_SECRET_KEY')) {
            GameApiProviderSecret::updateOrCreate(
                ['provider_id' => $gamevault999->id],
                ['agent_password' => $secretKey]
            );
        }

        // Game → provider assignments, matched by game name so this works
        // regardless of auto-increment IDs differing between environments.
        $assignments = [
            'Cash Machine' => 'gameroom777',
            'Fire Kirin' => 'gameroom777',
            'Game Room' => 'gameroom777',
            'Juwa' => 'gameroom777',
            'River Sweeps' => 'gameroom777',
            'Game Vault' => 'gamevault999',
        ];

        foreach ($assignments as $gameName => $providerName) {
            $game = Game::where('name', $gameName)->first();
            $provider = GameApiProvider::where('name', $providerName)->first();
            if ($game && $provider) {
                GameProviderAssignment::updateOrCreate(
                    ['game_id' => $game->id],
                    ['provider_id' => $provider->id]
                );
            }
        }
    }
}
