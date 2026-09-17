<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GameAccessDirectApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_unlock_direct_api_hit_and_instant_approval(): void
    {
        $user = User::factory()->create([
            'username' => 'testplayer',
            'is_flagged' => false,
        ]);
        $token = JwtAuthService::generateToken($user);

        $game = Game::create([
            'name' => 'Orion Stars',
            'description' => 'Orion Stars Fish & Slot Games',
            'is_active' => true,
        ]);

        // OrionStarsApiService requires these to even attempt the call — a
        // real "provider is properly configured" scenario, needed now that
        // registration success/failure is meaningfully enforced (an
        // unconfigured provider must fail with a clear error, not fabricate
        // credentials).
        \App\Models\SiteSetting::create([
            'orion_stars_agent_name' => 'agent1',
            'orion_stars_agent_password' => 'secretkey',
        ]);

        Http::fake([
            '*ws/service.ashx?action=registerUser*' => Http::response(['code' => 200], 200),
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY123'], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/unlock', [
                'game_id' => $game->id,
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('request.status', 'approved')
            ->assertJsonStructure([
                'message',
                'request' => ['id', 'status', 'username', 'game_password'],
            ]);
        // Game username is now the site username + this game's suffix (see
        // GameUsernameGenerator) — "Orion Stars" has no configured suffix here, so it falls
        // back to a derived one (first letter of each word: O + S).
        $this->assertSame('testplayerOS', $response->json('request.username'));

        $this->assertDatabaseHas('game_unlock_requests', [
            'user_id' => $user->id,
            'game_id' => $game->id,
            'status' => 'approved',
        ]);
    }

    /**
     * The account's real, working password must never change just from submitting a request —
     * only a genuine admin approval (reviewPasswordRequest()) is allowed to touch it. This used
     * to instantly overwrite password_hash and self-approve with no admin ever involved, despite
     * the frontend modal's own text promising "an admin will review and update it".
     */
    private function unlockGameAccount(string $token, Game $game): string
    {
        \App\Models\SiteSetting::create([
            'game_agent_base_url' => 'https://agent.example.com',
            'game_agent_id' => 'agent1',
            'game_agent_secret_key' => 'secretkey',
        ]);
        Http::fake([
            '*' => Http::response(['code' => 0, 'data' => ['account_name' => 'milkyplayer']], 200),
        ]);

        $unlockRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/unlock', ['game_id' => $game->id]);

        return $unlockRes->json('request.game_account_id');
    }

    public function test_request_password_reset_creates_a_pending_request_and_never_touches_the_real_password(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Milky Way', 'is_active' => true]);

        $gameAccountId = $this->unlockGameAccount($token, $game);
        $passwordBefore = \App\Models\GameAccount::find($gameAccountId)->password_hash;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/password-reset', [
                'game_account_id' => $gameAccountId,
                'requested_password' => 'NewPass123!',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('request.status', 'pending');

        $this->assertDatabaseHas('password_requests', [
            'user_id' => $user->id,
            'game_account_id' => $gameAccountId,
            'requested_password' => 'NewPass123!',
            'status' => 'pending',
        ]);
        // The account/unlock request still show the OLD, working password while pending.
        $this->assertSame($passwordBefore, \App\Models\GameAccount::find($gameAccountId)->password_hash);
        $this->assertDatabaseHas('game_unlock_requests', [
            'user_id' => $user->id, 'game_id' => $game->id, 'game_password' => $passwordBefore,
        ]);
    }

    public function test_a_second_password_reset_request_is_blocked_while_one_is_already_pending(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Milky Way', 'is_active' => true]);
        $gameAccountId = $this->unlockGameAccount($token, $game);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/password-reset', ['game_account_id' => $gameAccountId, 'requested_password' => 'First123!'])
            ->assertStatus(201);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/password-reset', ['game_account_id' => $gameAccountId, 'requested_password' => 'Second123!'])
            ->assertStatus(422);

        $this->assertSame(1, \App\Models\PasswordRequest::where('game_account_id', $gameAccountId)->count());
    }

    public function test_admin_approving_a_pending_password_request_actually_updates_the_account(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $admin = User::factory()->create(['role' => 'admin']);
        $adminToken = JwtAuthService::generateToken($admin);
        $game = Game::create(['name' => 'Milky Way', 'is_active' => true]);
        $gameAccountId = $this->unlockGameAccount($token, $game);

        $submitRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/games/password-reset', ['game_account_id' => $gameAccountId, 'requested_password' => 'NewPass123!']);
        $requestId = $submitRes->json('request.id');

        $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/admin/game-access/password/{$requestId}/review", ['status' => 'approved'])
            ->assertStatus(200);

        $this->assertSame('NewPass123!', \App\Models\GameAccount::find($gameAccountId)->fresh()->password_hash);
        $this->assertDatabaseHas('game_unlock_requests', [
            'user_id' => $user->id, 'game_id' => $game->id, 'game_password' => 'NewPass123!',
        ]);
    }
}
