<?php

namespace App\Console\Commands;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Console\Command;

/**
 * One-off migration helper: copies the legacy "River Pay API" credentials
 * (Site Settings -> API Keys & Secrets -> River Pay API) into a new
 * GameApiProvider row using the "river_pay_simple" protocol (see
 * RiverPaySimpleProtocol). Never prints the agent password — it's read from
 * Site Settings and written straight into the encrypted
 * game_api_provider_secrets row.
 */
class MigrateRiverPayToProvider extends Command
{
    protected $signature = 'game-api:migrate-river-pay {--name=river_pay : Internal name for the new provider}';

    protected $description = 'Copy the legacy Site Settings "River Pay API" credentials into a new Game API Providers entry (river_pay_simple protocol)';

    public function handle(): int
    {
        $settings = SiteSetting::first();

        if (!$settings || empty($settings->river_pay_base_url) || empty($settings->river_pay_login) || empty($settings->river_pay_password)) {
            $this->error('Site Settings is missing one of: river_pay_base_url, river_pay_login, river_pay_password. Nothing to migrate.');

            return self::FAILURE;
        }

        $name = $this->option('name');

        if (GameApiProvider::where('name', $name)->exists()) {
            $this->error("A Game API Provider named \"{$name}\" already exists. Pass --name=something-else to avoid colliding with it.");

            return self::FAILURE;
        }

        $provider = GameApiProvider::create([
            'name' => $name,
            'protocol' => 'river_pay_simple',
            'display_name' => 'River Pay',
            'base_url' => $settings->river_pay_base_url,
            'agent_username' => $settings->river_pay_login,
            'is_active' => true,
            'automate_create_account' => true,
            'automate_deposit' => false,
            'automate_withdraw' => false,
            'notes' => 'Migrated from Site Settings -> API Keys & Secrets -> River Pay API. River Pay assigns its own account "code" on creation (see RiverPaySimpleProtocol) — verify with Run Safe Test, not just Test Connection, before relying on it.',
        ]);

        GameApiProviderSecret::updateOrCreate(
            ['provider_id' => $provider->id],
            ['agent_password' => $settings->river_pay_password]
        );

        $this->info("Created Game API Provider #{$provider->id} (\"{$name}\") with base_url={$provider->base_url}, agent_username={$provider->agent_username}.");
        $this->line('Secret key copied over (not displayed). Go to Admin -> Game API Providers, click "Run Safe Test" to verify, then assign it to a game.');

        return self::SUCCESS;
    }
}
