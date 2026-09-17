<?php

namespace Tests\Feature;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MigrateOrionStarsToProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_copies_site_settings_orion_stars_credentials_into_a_new_provider(): void
    {
        SiteSetting::create([
            'orion_stars_base_url' => 'https://orionstars.vip:8033',
            'orion_stars_agent_name' => 'Mcashier01',
            'orion_stars_agent_password' => 'Fireron2026#$',
        ]);

        $this->artisan('game-api:migrate-orion-stars')
            ->assertExitCode(0);

        $provider = GameApiProvider::where('name', 'orion_stars')->first();
        $this->assertNotNull($provider);
        $this->assertSame('orion_stars_signed', $provider->protocol);
        $this->assertSame('https://orionstars.vip:8033', $provider->base_url);
        $this->assertSame('Mcashier01', $provider->agent_username);

        $secret = GameApiProviderSecret::where('provider_id', $provider->id)->first();
        $this->assertNotNull($secret);
        $this->assertSame('Fireron2026#$', $secret->agent_password);
    }

    public function test_it_fails_cleanly_when_site_settings_is_incomplete(): void
    {
        SiteSetting::create(['orion_stars_base_url' => 'https://orionstars.vip:8033']);

        $this->artisan('game-api:migrate-orion-stars')
            ->assertExitCode(1);

        $this->assertDatabaseCount('game_api_providers', 0);
    }
}
