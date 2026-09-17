<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public GET /api/site-settings route used to return the full SiteSetting model —
 * including every provider API secret (game agent, Orion Stars, FastAPI, River Pay, GHL,
 * SMTP) — to any unauthenticated visitor. This locks in the fix: the public route must
 * only ever expose SiteSetting::PUBLIC_FIELDS, while the authenticated admin route keeps
 * returning the full model so the Site Settings edit form still works.
 */
class SiteSettingsPublicSplitTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_site_settings_endpoint_excludes_secrets(): void
    {
        SiteSetting::create([
            'id' => 1,
            'site_name' => 'Horizon Players',
            'game_agent_secret_key' => 'super-secret-key',
            'orion_stars_agent_password' => 'super-secret-password',
            'fast_api_app_secret' => 'another-secret',
            'river_pay_password' => 'yet-another-secret',
            'ghl_api_key' => 'ghl-secret',
            'contact_display_mode' => 'icons_with_text',
            'contact_button_label' => 'Chat with us',
        ]);

        $res = $this->getJson('/api/site-settings');
        $res->assertStatus(200);

        $body = $res->json('settings');
        $this->assertSame('Horizon Players', $body['site_name']);
        $this->assertSame('icons_with_text', $body['contact_display_mode']);
        $this->assertSame('Chat with us', $body['contact_button_label']);

        foreach (['game_agent_secret_key', 'orion_stars_agent_password', 'fast_api_app_secret', 'river_pay_password', 'ghl_api_key'] as $secretField) {
            $this->assertArrayNotHasKey($secretField, $body, "Public site-settings response leaked {$secretField}");
        }
    }

    public function test_admin_site_settings_endpoint_still_returns_full_model(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'game_agent_secret_key' => 'super-secret-key']);
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->getJson('/api/admin/site-settings');
        $res->assertStatus(200);
        $this->assertSame('super-secret-key', $res->json('settings.game_agent_secret_key'));
    }

    /**
     * Regression: game_agent/orion_stars/fast_api/river_pay credentials are now configured
     * exclusively via Admin > Game API Providers — the Site Settings save endpoint must no
     * longer let a stray/cached old-frontend request overwrite an already-migrated value.
     */
    public function test_admin_site_settings_save_no_longer_accepts_legacy_provider_fields(): void
    {
        SiteSetting::create(['id' => 1, 'orion_stars_agent_name' => 'Mcashier01']);
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson('/api/admin/site-settings', [
                'orion_stars_agent_name' => 'someone-else',
                'game_agent_base_url' => 'https://attacker.example',
            ]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('site_settings', ['id' => 1, 'orion_stars_agent_name' => 'Mcashier01']);
        $this->assertDatabaseMissing('site_settings', ['game_agent_base_url' => 'https://attacker.example']);
    }

    public function test_admin_can_save_contact_widget_settings(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson('/api/admin/site-settings', [
                'contact_display_mode' => 'icons_with_text',
                'contact_button_label' => 'Need Help?',
                'contact_widget_position' => 'top-left',
                'contact_button_color' => '#6d28d9',
            ]);
        $res->assertStatus(200);
        $this->assertDatabaseHas('site_settings', [
            'id' => 1,
            'contact_display_mode' => 'icons_with_text',
            'contact_button_label' => 'Need Help?',
            'contact_widget_position' => 'top-left',
            'contact_button_color' => '#6d28d9',
        ]);
    }

    /**
     * Smart validation: a copy-pasted GHL/FAST credential with a stray leading/trailing space
     * or newline is invisible in a text input — and unlike a username, an opaque API key can't
     * be eyeballed for whitespace at all. Silently trimmed on save instead of quietly breaking
     * every live call with what looks like a "wrong credential" error.
     */
    public function test_admin_site_settings_save_trims_ghl_and_fast_payment_credentials(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson('/api/admin/site-settings', [
                'ghl_api_key' => "  pit-594b52be-213f-456f-a8c6-c7aef2a37ffb\n",
                'ghl_location_id' => '  T1QNjGrUssAlvTaHbjiH  ',
                'fast_payment_base_url' => 'https://mh.dollarpaywallet.com/',
                'fast_payment_merchant_id' => ' 1092768610 ',
                'fast_payment_key' => "f84019c271fa2020bba9141c7d8ee20e\t",
            ]);

        $res->assertStatus(200);
        $this->assertDatabaseHas('site_settings', [
            'id' => 1,
            'ghl_api_key' => 'pit-594b52be-213f-456f-a8c6-c7aef2a37ffb',
            'ghl_location_id' => 'T1QNjGrUssAlvTaHbjiH',
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1092768610',
            'fast_payment_key' => 'f84019c271fa2020bba9141c7d8ee20e',
        ]);
    }
}
