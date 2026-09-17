<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: this page previously wrote to the dead Supabase `app_settings` stub — Save
 * Changes always showed a success toast but persisted nothing, and UserRedeemApiController
 * only ever read config/redeem.php's env-backed defaults, so the two were never connected
 * even in principle. Now SiteSetting.redeem_min_amount/max_amount is the real, shared source.
 */
class AdminRedeemSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_index_falls_back_to_config_defaults_when_unset(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/redeem-settings');
        $res->assertStatus(200);
        $this->assertEquals((float) config('redeem.min_amount'), $res->json('settings.min_amount'));
        $this->assertEquals((float) config('redeem.max_amount'), $res->json('settings.max_amount'));
    }

    public function test_admin_can_update_limits_and_they_persist(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/redeem-settings', ['min_amount' => 15, 'max_amount' => 500]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('site_settings', ['id' => 1, 'redeem_min_amount' => 15, 'redeem_max_amount' => 500]);

        $reread = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/redeem-settings');
        $this->assertEquals(15.0, $reread->json('settings.min_amount'));
        $this->assertEquals(500.0, $reread->json('settings.max_amount'));
    }

    public function test_max_must_exceed_min(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/redeem-settings', ['min_amount' => 100, 'max_amount' => 50]);
        $res->assertStatus(422);
    }

    public function test_non_admin_cannot_update_settings(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/admin/redeem-settings', ['min_amount' => 1, 'max_amount' => 2]);
        $res->assertStatus(403);
    }

    public function test_saved_admin_limits_are_actually_enforced_on_redeem_submission(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'redeem_min_amount' => 25, 'redeem_max_amount' => 60]);
        $user = User::factory()->create(['role' => 'user']);
        $game = \App\Models\Game::create(['name' => 'Slots Master', 'is_active' => true]);

        // Below the admin-configured minimum (25) — must be rejected even though it's above config/redeem.php's default (40 is irrelevant here since DB overrides it).
        $tooLow = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 10]);
        $tooLow->assertStatus(422);

        $ok = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 30]);
        $ok->assertStatus(201);

        // Now exceed the admin-configured daily max (60): 30 already used today + 40 more > 60.
        $exceedsMax = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 40]);
        $exceedsMax->assertStatus(422);
    }
}
