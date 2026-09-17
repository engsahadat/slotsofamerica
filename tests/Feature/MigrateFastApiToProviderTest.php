<?php

namespace Tests\Feature;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MigrateFastApiToProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_copies_site_settings_fast_api_credentials_into_a_new_provider(): void
    {
        SiteSetting::create([
            'fast_api_base_url' => 'https://api.fastprovider.com',
            'fast_api_agent_account' => 'agent_account',
            'fast_api_agent_password' => 'agent_password',
        ]);

        $this->artisan('game-api:migrate-fast-api')
            ->assertExitCode(0);

        $provider = GameApiProvider::where('name', 'fast_api')->first();
        $this->assertNotNull($provider);
        $this->assertSame('fast_api_signed', $provider->protocol);
        $this->assertSame('https://api.fastprovider.com', $provider->base_url);
        $this->assertSame('agent_account', $provider->agent_username);

        $secret = GameApiProviderSecret::where('provider_id', $provider->id)->first();
        $this->assertSame('agent_password', $secret->agent_password);
    }

    public function test_it_fails_cleanly_when_site_settings_is_incomplete(): void
    {
        SiteSetting::create(['fast_api_base_url' => 'https://api.fastprovider.com']);

        $this->artisan('game-api:migrate-fast-api')
            ->assertExitCode(1);

        $this->assertDatabaseCount('game_api_providers', 0);
    }
}
