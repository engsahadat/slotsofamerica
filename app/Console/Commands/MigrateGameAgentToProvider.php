<?php

namespace App\Console\Commands;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

/**
 * One-off migration helper: copies the legacy "Game Agent API" credentials
 * (Site Settings -> API Keys & Secrets -> Game Agent API) into a new
 * GameApiProvider row using the "external_signed" protocol — the exact same
 * agent_id + timestamp + secret_key scheme GameAgentApiService already
 * speaks, so this is a pure data copy, no new protocol code needed (see the
 * same pattern already used for the gamevault999/juwa providers).
 *
 * Never prints the secret key — it's read from Site Settings and written
 * straight into the encrypted game_api_provider_secrets row.
 */
class MigrateGameAgentToProvider extends Command
{
    protected $signature = 'game-api:migrate-game-agent {--name=game_agent : Internal name for the new provider}';

    protected $description = 'Copy the legacy Site Settings "Game Agent API" credentials into a new Game API Providers entry (external_signed protocol)';

    public function handle(): int
    {
        $settings = SiteSetting::first();

        if (!$settings || empty($settings->game_agent_base_url) || empty($settings->game_agent_id) || empty($settings->game_agent_secret_key)) {
            $this->error('Site Settings is missing one of: game_agent_base_url, game_agent_id, game_agent_secret_key. Nothing to migrate.');

            return self::FAILURE;
        }

        $name = $this->option('name');

        if (GameApiProvider::where('name', $name)->exists()) {
            $this->error("A Game API Provider named \"{$name}\" already exists. Pass --name=something-else to avoid colliding with it.");

            return self::FAILURE;
        }

        $provider = GameApiProvider::create([
            'name' => $name,
            'protocol' => 'external_signed',
            'display_name' => 'Game Agent API',
            'base_url' => $settings->game_agent_base_url,
            'agent_username' => $settings->game_agent_id,
            'is_active' => true,
            'automate_create_account' => true,
            'automate_deposit' => false,
            'automate_withdraw' => false,
            'notes' => 'Migrated from Site Settings -> API Keys & Secrets -> Game Agent API. Verify with Test Connection before relying on it, then assign it to the game(s) it should serve.',
        ]);

        GameApiProviderSecret::updateOrCreate(
            ['provider_id' => $provider->id],
            ['agent_password' => $settings->game_agent_secret_key]
        );

        $this->info("Created Game API Provider #{$provider->id} (\"{$name}\") with base_url={$provider->base_url}, agent_username={$provider->agent_username}.");
        $this->line('Secret key copied over (not displayed). Go to Admin -> Game API Providers and click "Test Connection" to verify, then assign it to a game.');

        return self::SUCCESS;
    }
}
