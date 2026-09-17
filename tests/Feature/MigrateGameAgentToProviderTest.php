<?php

namespace Tests\Feature;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MigrateGameAgentToProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_copies_site_settings_game_agent_credentials_into_a_new_provider(): void
    {
        SiteSetting::create([
            'game_agent_base_url' => 'https://agent.realvendor.example',
            'game_agent_id' => '10045',
            'game_agent_secret_key' => 'supersecretkey123',
        ]);

        $this->artisan('game-api:migrate-game-agent')
            ->assertExitCode(0);

        $provider = GameApiProvider::where('name', 'game_agent')->first();
        $this->assertNotNull($provider);
        $this->assertSame('external_signed', $provider->protocol);
        $this->assertSame('https://agent.realvendor.example', $provider->base_url);
        $this->assertSame('10045', $provider->agent_username);

        $secret = GameApiProviderSecret::where('provider_id', $provider->id)->first();
        $this->assertNotNull($secret);
        $this->assertSame('supersecretkey123', $secret->agent_password);
    }

    public function test_it_fails_cleanly_when_site_settings_is_incomplete(): void
    {
        SiteSetting::create(['game_agent_base_url' => 'https://agent.realvendor.example']);

        $this->artisan('game-api:migrate-game-agent')
            ->assertExitCode(1);

        $this->assertDatabaseCount('game_api_providers', 0);
    }

    public function test_it_refuses_to_overwrite_an_existing_provider_with_the_same_name(): void
    {
        SiteSetting::create([
            'game_agent_base_url' => 'https://agent.realvendor.example',
            'game_agent_id' => '10045',
            'game_agent_secret_key' => 'supersecretkey123',
        ]);
        GameApiProvider::create([
            'name' => 'game_agent', 'protocol' => 'external_signed', 'display_name' => 'Existing',
            'base_url' => 'https://already-here.example', 'agent_username' => 'x', 'is_active' => true,
        ]);

        $this->artisan('game-api:migrate-game-agent')
            ->assertExitCode(1);

        $this->assertDatabaseCount('game_api_providers', 1);
    }
}
