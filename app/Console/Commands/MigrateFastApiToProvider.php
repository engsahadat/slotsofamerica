<?php

namespace App\Console\Commands;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

/**
 * One-off migration helper: copies the legacy "Fast API Integration"
 * credentials (Site Settings -> API Keys & Secrets -> Fast API Integration)
 * into a new GameApiProvider row using the "fast_api_signed" protocol (see
 * FastApiSignedProtocol). Never prints the agent password — it's read from
 * Site Settings and written straight into the encrypted
 * game_api_provider_secrets row.
 */
class MigrateFastApiToProvider extends Command
{
    protected $signature = 'game-api:migrate-fast-api {--name=fast_api : Internal name for the new provider}';

    protected $description = 'Copy the legacy Site Settings "Fast API Integration" credentials into a new Game API Providers entry (fast_api_signed protocol)';

    public function handle(): int
    {
        $settings = SiteSetting::first();

        if (!$settings || empty($settings->fast_api_base_url) || empty($settings->fast_api_agent_account) || empty($settings->fast_api_agent_password)) {
            $this->error('Site Settings is missing one of: fast_api_base_url, fast_api_agent_account, fast_api_agent_password. Nothing to migrate.');

            return self::FAILURE;
        }

        $name = $this->option('name');

        if (GameApiProvider::where('name', $name)->exists()) {
            $this->error("A Game API Provider named \"{$name}\" already exists. Pass --name=something-else to avoid colliding with it.");

            return self::FAILURE;
        }

        $provider = GameApiProvider::create([
            'name' => $name,
            'protocol' => 'fast_api_signed',
            'display_name' => 'Fast API',
            'base_url' => $settings->fast_api_base_url,
            'agent_username' => $settings->fast_api_agent_account,
            'is_active' => true,
            'automate_create_account' => true,
            'automate_deposit' => false,
            'automate_withdraw' => false,
            'notes' => 'Migrated from Site Settings -> API Keys & Secrets -> Fast API Integration. Verify with Test Connection before relying on it, then assign it to the game(s) it should serve.',
        ]);

        GameApiProviderSecret::updateOrCreate(
            ['provider_id' => $provider->id],
            ['agent_password' => $settings->fast_api_agent_password]
        );

        $this->info("Created Game API Provider #{$provider->id} (\"{$name}\") with base_url={$provider->base_url}, agent_username={$provider->agent_username}.");
        $this->line('Secret key copied over (not displayed). Go to Admin -> Game API Providers and click "Test Connection" to verify, then assign it to a game.');

        return self::SUCCESS;
    }
}
