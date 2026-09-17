<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameAccount;
use App\Models\GameUnlockRequest;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Regression: the "Approve Game Access" modal tells the admin that leaving both
 * override fields blank will "auto-assign the next available account from this
 * game's account pool" — but reviewUnlock() never actually looked at the pool; it
 * unconditionally tried the external Provider API (often unconfigured, e.g. the
 * seeded placeholder `agent.gameprovider.com`), producing a cURL "Provider API
 * Error" even when a ready-to-use pool account already existed for the game.
 */
class AdminGameAccessApprovalTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_flagged' => false]);
        return JwtAuthService::generateToken($admin);
    }

    public function test_approving_with_blank_fields_uses_an_available_pool_account_instead_of_calling_the_provider_api(): void
    {
        $token = $this->adminToken();
        $game = Game::create(['name' => 'Test Game 2', 'is_active' => true]);

        $poolAccount = GameAccount::create([
            'game_id' => $game->id,
            'username' => 'pooled_user1',
            'password_hash' => 'poolpass',
            'status' => 'available',
        ]);

        $requester = User::factory()->create(['is_flagged' => false]);
        $req = GameUnlockRequest::create([
            'user_id' => $requester->id,
            'game_id' => $game->id,
            'username' => 'requestedname',
            'email' => $requester->email,
            'status' => 'pending',
        ]);

        // No Http::fake() registered at all — if the code tried to reach the
        // external provider it would throw a real connection exception and this
        // test would fail/error, proving the pool path was taken instead.
        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-access/unlock/{$req->id}/review", [
                'status' => 'approved',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('request.username', 'pooled_user1');

        $this->assertDatabaseHas('game_accounts', [
            'id' => $poolAccount->id,
            'status' => 'assigned',
            'assigned_to' => $requester->id,
        ]);
    }

    /**
     * Regression: the provider's own echoed-back account_name used to silently overwrite our
     * already-decided username. Our system's username is now authoritative — the provider is
     * expected to accept exactly what we sent, and its response never overrides it.
     */
    public function test_approving_with_blank_fields_and_no_pool_account_still_falls_back_to_the_provider_api(): void
    {
        $token = $this->adminToken();
        $game = Game::create(['name' => 'Test Game 3', 'is_active' => true]);

        $requester = User::factory()->create(['is_flagged' => false]);
        $req = GameUnlockRequest::create([
            'user_id' => $requester->id,
            'game_id' => $game->id,
            'username' => 'requestedname',
            'email' => $requester->email,
            'status' => 'pending',
        ]);

        Http::fake([
            '*' => Http::response(['code' => 0, 'data' => ['account_name' => 'apiassigned']], 200),
        ]);
        \App\Models\SiteSetting::create([
            'game_agent_base_url' => 'https://agent.example.com',
            'game_agent_id' => 'agent1',
            'game_agent_secret_key' => 'secretkey',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-access/unlock/{$req->id}/review", [
                'status' => 'approved',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('request.username', 'requestedname');
    }

    public function test_approving_with_an_override_username_containing_spaces_is_rejected_with_a_friendly_message(): void
    {
        $token = $this->adminToken();
        $game = Game::create(['name' => 'Test Game 4', 'is_active' => true]);
        $requester = User::factory()->create(['is_flagged' => false]);
        $req = GameUnlockRequest::create([
            'user_id' => $requester->id,
            'game_id' => $game->id,
            'username' => 'requestedname',
            'email' => $requester->email,
            'status' => 'pending',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-access/unlock/{$req->id}/review", [
                'status' => 'approved',
                'game_username' => 'bad name with spaces',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('errors.game_username.0', 'Game username can only contain letters, numbers, underscores, hyphens and dots (no spaces).');
    }

    public function test_approving_with_a_too_short_override_password_is_rejected_with_a_friendly_message(): void
    {
        $token = $this->adminToken();
        $game = Game::create(['name' => 'Test Game 5', 'is_active' => true]);
        $requester = User::factory()->create(['is_flagged' => false]);
        $req = GameUnlockRequest::create([
            'user_id' => $requester->id,
            'game_id' => $game->id,
            'username' => 'requestedname',
            'email' => $requester->email,
            'status' => 'pending',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-access/unlock/{$req->id}/review", [
                'status' => 'approved',
                'game_username' => 'validname1',
                'game_password' => 'abc',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('errors.game_password.0', 'Game password must be at least 4 characters.');
    }
}
