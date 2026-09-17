<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression test: the Landing Page Editor saved to SiteSetting::landing_page_config
 * correctly, but the public GET /api/site-settings endpoint stripped that field out
 * (it wasn't in SiteSetting::PUBLIC_FIELDS) and Homepage.tsx never even asked for it —
 * so nothing an admin edited ever reached real visitors. This locks in the backend half
 * of the fix.
 */
class LandingPageConfigPublicTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_site_settings_endpoint_includes_landing_page_config(): void
    {
        SiteSetting::create([
            'id' => 1,
            'site_name' => 'Horizon Players',
            'landing_page_config' => ['hero' => ['title_line1' => 'CUSTOM TITLE']],
        ]);

        $res = $this->getJson('/api/site-settings');
        $res->assertStatus(200);
        $this->assertSame('CUSTOM TITLE', $res->json('settings.landing_page_config.hero.title_line1'));
    }
}
