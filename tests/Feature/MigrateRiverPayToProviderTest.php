<?php

namespace Tests\Feature;

use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MigrateRiverPayToProviderTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_copies_site_settings_river_pay_credentials_into_a_new_provider(): void
    {
        SiteSetting::create([
            'river_pay_base_url' => 'http://river-pay.com',
            'river_pay_login' => 'river_login',
            'river_pay_password' => 'river_password',
        ]);

        $this->artisan('game-api:migrate-river-pay')
            ->assertExitCode(0);

        $provider = GameApiProvider::where('name', 'river_pay')->first();
        $this->assertNotNull($provider);
        $this->assertSame('river_pay_simple', $provider->protocol);
        $this->assertSame('http://river-pay.com', $provider->base_url);
        $this->assertSame('river_login', $provider->agent_username);

        $secret = GameApiProviderSecret::where('provider_id', $provider->id)->first();
        $this->assertSame('river_password', $secret->agent_password);
    }

    public function test_it_fails_cleanly_when_site_settings_is_incomplete(): void
    {
        SiteSetting::create(['river_pay_base_url' => 'http://river-pay.com']);

        $this->artisan('game-api:migrate-river-pay')
            ->assertExitCode(1);

        $this->assertDatabaseCount('game_api_providers', 0);
    }
}
