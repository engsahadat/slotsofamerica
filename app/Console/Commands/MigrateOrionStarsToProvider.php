<?php

namespace App\Console\Commands;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

/**
 * One-off migration helper: copies the legacy "Orion Stars Terminal API"
 * credentials (Site Settings -> API Keys & Secrets -> Orion Stars Terminal
 * API) into a new GameApiProvider row using the "orion_stars_signed"
 * protocol (see OrionStarsAgentProtocol). Never prints the agent password —
 * it's read from Site Settings and written straight into the encrypted
 * game_api_provider_secrets row.
 */
class MigrateOrionStarsToProvider extends Command
{
    protected $signature = 'game-api:migrate-orion-stars {--name=orion_stars : Internal name for the new provider}';

    protected $description = 'Copy the legacy Site Settings "Orion Stars Terminal API" credentials into a new Game API Providers entry (orion_stars_signed protocol)';

    public function handle(): int
    {
        $settings = SiteSetting::first();

        if (!$settings || empty($settings->orion_stars_base_url) || empty($settings->orion_stars_agent_name) || empty($settings->orion_stars_agent_password)) {
            $this->error('Site Settings is missing one of: orion_stars_base_url, orion_stars_agent_name, orion_stars_agent_password. Nothing to migrate.');

            return self::FAILURE;
        }

        $name = $this->option('name');

        if (GameApiProvider::where('name', $name)->exists()) {
            $this->error("A Game API Provider named \"{$name}\" already exists. Pass --name=something-else to avoid colliding with it.");

            return self::FAILURE;
        }

        $provider = GameApiProvider::create([
            'name' => $name,
            'protocol' => 'orion_stars_signed',
            'display_name' => 'Orion Stars',
            'base_url' => $settings->orion_stars_base_url,
            'agent_username' => $settings->orion_stars_agent_name,
            'is_active' => true,
            'automate_create_account' => true,
            'automate_deposit' => false,
            'automate_withdraw' => false,
            'notes' => 'Migrated from Site Settings -> API Keys & Secrets -> Orion Stars Terminal API.',
        ]);

        GameApiProviderSecret::updateOrCreate(
            ['provider_id' => $provider->id],
            ['agent_password' => $settings->orion_stars_agent_password]
        );

        $this->info("Created Game API Provider #{$provider->id} (\"{$name}\") with base_url={$provider->base_url}, agent_username={$provider->agent_username}.");
        $this->line('Secret key copied over (not displayed). Go to Admin -> Game API Providers and click "Test Connection" to verify, then assign it to a game.');

        return self::SUCCESS;
    }
}
