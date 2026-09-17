<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class NewGameApiEndpointsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Regression: when NOTHING confirms a real registration — no Game API Providers assignment,
     * the legacy per-game dispatch (Game Agent / Orion Stars / etc., still attempted exactly as
     * before) doesn't succeed either (e.g. "— Manual only —" games whose global SiteSetting
     * credentials were never actually configured for them), and no pool account is available —
     * the endpoint used to hard-fail with a "Registration Failed. The game provider could not
     * be reached..." 503 and no recourse for the player. It now creates a real pending
     * GameUnlockRequest instead, visible on the admin's Game Access Requests page.
     */
    public function test_game_register_creates_a_pending_request_when_nothing_confirms_registration(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['username' => 'player1', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Panda Master', 'is_active' => true, 'web_url' => 'https://pandamaster.vip']);

        // No SiteSetting Game Agent credentials configured and no working response — the legacy
        // dispatch still gets attempted (unchanged), it just doesn't confirm anything real.
        Http::fake(['*' => Http::response(['code' => 1, 'msg' => 'Username or password error'], 200)]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(200)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('request.status', 'pending');

        $this->assertDatabaseHas('game_unlock_requests', [
            'user_id' => $user->id,
            'game_id' => $game->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $admin->id,
            'category' => 'game_access',
        ]);
    }

    /**
     * Re-requesting while already pending must not spam admins with a fresh notification (or
     * create a duplicate row) every time the player re-clicks "Request Access".
     */
    public function test_re_requesting_an_already_pending_game_does_not_duplicate_or_renotify(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create(['username' => 'player2', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Milky Way', 'is_active' => true]);

        Http::fake(['*' => Http::response(['code' => 1, 'msg' => 'Username or password error'], 200)]);
        $this->withHeader('Authorization', 'Bearer ' . $token)->postJson("/api/games/{$game->id}/register")->assertStatus(200);
        $this->assertEquals(1, \App\Models\Notification::where('user_id', $admin->id)->count());

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson("/api/games/{$game->id}/register");
        $response->assertStatus(200)->assertJsonPath('status', 'pending');

        $this->assertEquals(1, GameUnlockRequest::where('user_id', $user->id)->where('game_id', $game->id)->count());
        $this->assertEquals(1, \App\Models\Notification::where('user_id', $admin->id)->count());
    }

    /**
     * Testing Requirements: "Username > Existing game account" — a user who already has a
     * fully approved account for this game (not merely pending) must get their existing
     * credentials back immediately, with no new GameUnlockRequest row and no second
     * registration attempt against the provider.
     */
    public function test_re_requesting_an_already_approved_game_returns_existing_credentials_without_creating_a_new_request(): void
    {
        $user = User::factory()->create(['username' => 'approveduser', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'approveduserFK',
            'game_password' => 'ExistingPass123', 'email' => 'approved@example.com', 'status' => 'approved',
        ]);

        Http::fake(); // must never touch the network at all — nothing to register again.

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(200)
            ->assertJsonPath('status', 'approved')
            ->assertJsonPath('username', 'approveduserFK')
            ->assertJsonPath('password', 'ExistingPass123');

        Http::assertNothingSent();
        $this->assertEquals(1, GameUnlockRequest::where('user_id', $user->id)->where('game_id', $game->id)->count());
    }

    public function test_game_register_uses_assigned_game_api_provider_when_configured(): void
    {
        $user = User::factory()->create(['username' => 'riverplayer', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'River Sweeps', 'is_active' => true]);

        $provider = GameApiProvider::create([
            'name' => 'gameroom777test', 'display_name' => 'Game Room 777',
            'base_url' => 'https://agentserver1.gameroom777.com',
            'agent_username' => 'Teststore22', 'is_active' => true,
            'automate_create_account' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken(User::factory()->create(['role' => 'admin'])))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'realsecret']);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'fake-token']], 200),
            '*/api/player/insertPlayer' => Http::response(['code' => 0, 'data' => ['id' => 555]], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(201)->assertJsonPath('success', true);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/player/insertPlayer'));
        $this->assertDatabaseHas('game_api_logs', [
            'provider_name' => 'gameroom777test',
            'action' => 'create_player',
            'success' => true,
        ]);
        // Legacy per-game provider services must never be reached once the
        // Game API provider path succeeds.
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/external/'));
    }

    /**
     * Regression: found live — a leftover "available" pool account (an admin-pre-stocked real
     * account with its own fixed username, e.g. "juwa_user3") used to be checked BEFORE the
     * result of the live registration above, so it silently overrode a just-created account
     * under our own correctly-generated {app_username}{suffix} username — even though that live
     * registration succeeded. The pool account must only ever be used as a fallback when
     * nothing live actually confirmed a registration, never in preference to one that did.
     */
    public function test_a_successful_live_registration_takes_priority_over_a_leftover_available_pool_account(): void
    {
        $user = User::factory()->create(['username' => 'poolpriority', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Juwa', 'is_active' => true, 'username_suffix' => 'JW']);

        $provider = GameApiProvider::create([
            'name' => 'juwaprioritytest', 'display_name' => 'Juwa Priority Test',
            'base_url' => 'https://agentserver1.juwapriority.com',
            'agent_username' => 'Teststore22', 'is_active' => true,
            'automate_create_account' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken(User::factory()->create(['role' => 'admin'])))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'realsecret']);

        // A leftover pool account from before this game had live API automation configured.
        \App\Models\GameAccount::create([
            'game_id' => $game->id, 'username' => 'juwa_user3', 'password_hash' => 'poolpass',
            'status' => 'available',
        ]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'fake-token']], 200),
            '*/api/player/insertPlayer' => Http::response(['code' => 0, 'data' => ['id' => 555]], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('username', 'poolpriorityJW');

        // The pool account must be untouched — still available for the next request that
        // genuinely has no live registration to fall back on.
        $this->assertDatabaseHas('game_accounts', ['username' => 'juwa_user3', 'status' => 'available', 'assigned_to' => null]);
        $this->assertDatabaseHas('game_accounts', ['username' => 'poolpriorityJW', 'status' => 'assigned', 'assigned_to' => $user->id]);
    }

    /**
     * Regression: found live — Fire Kirin had a real, working Game API provider assigned AND a
     * leftover available pool account ("firekirin_user2") sitting in the database. A single
     * transient registration failure ("Invalid token") was enough to hand the user that pool
     * account instead of the standard {app_username}{suffix} username, breaking the "every
     * approved account uses the standard format" guarantee for what was often just a momentary
     * blip. A game with a provider assigned must never silently substitute a pool account on
     * failure — only a clean, immediately-retryable "try again" response, with nothing created
     * at all (no pool assignment, no stuck pending request) so the very next attempt can still
     * succeed with the standard username the moment the underlying issue clears.
     */
    public function test_a_game_with_an_assigned_provider_never_falls_back_to_a_pool_account_on_failure(): void
    {
        $user = User::factory()->create(['username' => 'firekirinplayer', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true, 'username_suffix' => 'FK']);

        $provider = GameApiProvider::create([
            'name' => 'firekirinprovider', 'display_name' => 'Fire Kirin Provider',
            'base_url' => 'https://agentserver1.firekirinprovider.com',
            'agent_username' => 'Teststore22', 'is_active' => true,
            'automate_create_account' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken(User::factory()->create(['role' => 'admin'])))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'realsecret']);

        // A leftover pool account, exactly like firekirin_user2 was live.
        \App\Models\GameAccount::create([
            'game_id' => $game->id, 'username' => 'firekirin_user2', 'password_hash' => 'poolpass',
            'status' => 'available',
        ]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'fake-token']], 200),
            '*/api/player/insertPlayer' => Http::response(['code' => 3, 'msg' => 'Invalid token'], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status', 'failed');
        $this->assertStringContainsString('try again', $response->json('message'));

        // Nothing was created at all — the pool account is still sitting there untouched, and
        // there's no stuck pending request blocking the user from simply trying again.
        $this->assertDatabaseHas('game_accounts', ['username' => 'firekirin_user2', 'status' => 'available', 'assigned_to' => null]);
        $this->assertDatabaseCount('game_unlock_requests', 0);
    }

    public function test_game_register_falls_back_to_available_pool_account_when_provider_fails(): void
    {
        $user = User::factory()->create(['username' => 'poolplayer', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Fire Kirin Pool', 'is_active' => true]);

        \App\Models\GameAccount::create([
            'game_id' => $game->id, 'username' => 'poolaccount1', 'password_hash' => 'poolpass1',
            'status' => 'available',
        ]);

        Http::fake([
            '*' => Http::response(['code' => 1, 'msg' => 'Username or password error'], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register");

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('username', 'poolaccount1');
    }

    public function test_game_access_api_returns_persisted_credentials(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Game Vault', 'is_active' => true]);

        GameUnlockRequest::create([
            'user_id' => $user->id,
            'game_id' => $game->id,
            'email' => $user->email,
            'username' => 'engmdsah',
            'game_password' => 'YbD4P1ANZk',
            'status' => 'approved',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson("/api/games/{$game->id}/access");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('approved', true)
            ->assertJsonPath('username', 'engmdsah')
            ->assertJsonPath('password', 'YbD4P1ANZk');
    }

    public function test_game_login_api_returns_redirect_url(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Juwa', 'is_active' => true, 'web_url' => 'https://juwa777.com']);

        GameUnlockRequest::create([
            'user_id' => $user->id,
            'game_id' => $game->id,
            'email' => $user->email,
            'username' => 'juwaplayer',
            'game_password' => 'pass123',
            'web_login_url' => 'https://juwa777.com/play',
            'status' => 'approved',
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/login", [
                'username' => 'juwaplayer',
                'password' => 'pass123',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('redirect_url', 'https://juwa777.com/play');
    }

    /**
     * The auto-generated game username is now the player's own site username plus the game's
     * configured suffix (Admin > Games > "Username Suffix", see GameUsernameGenerator) — e.g.
     * "sahadat123" on "Panda Master" (suffix "PM") -> "sahadat123PM" — decided BEFORE any
     * provider API call is made, never left to the provider to pick.
     */
    public function test_game_register_generates_username_from_site_username_plus_game_suffix(): void
    {
        $user = User::factory()->create(['username' => 'sahadat123', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Panda Master', 'username_suffix' => 'PM', 'is_active' => true]);

        // Unassigned ("Manual only") — lands on the pending path, but the username-generation
        // logic runs before that branching either way, so it's still exercised here; the
        // generated username is visible on the created pending request.
        Http::fake();

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/games/{$game->id}/register"); // no `username` in the body, matching GameCard.tsx

        $response->assertStatus(200)->assertJsonPath('status', 'pending');
        $this->assertSame('sahadat123PM', $response->json('request.username'));
    }

    /**
     * Regression: UserPasswordRequests.tsx's history table was wired to a dead Supabase stub
     * (no backend endpoint existed at all to list a user's own password_requests) — it always
     * showed "No requests yet" even after submitting real requests.
     */
    public function test_password_request_history_returns_only_the_current_users_own_requests(): void
    {
        $user = User::factory()->create(['username' => 'histplayer', 'is_flagged' => false]);
        $otherUser = User::factory()->create(['username' => 'otherplayer', 'is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $game = Game::create(['name' => 'Panda Master', 'is_active' => true]);

        $account = \App\Models\GameAccount::create([
            'game_id' => $game->id, 'username' => 'histaccount', 'password_hash' => 'old', 'status' => 'assigned', 'assigned_to' => $user->id,
        ]);
        $otherAccount = \App\Models\GameAccount::create([
            'game_id' => $game->id, 'username' => 'otheraccount', 'password_hash' => 'old', 'status' => 'assigned', 'assigned_to' => $otherUser->id,
        ]);

        \App\Models\PasswordRequest::create(['user_id' => $user->id, 'game_account_id' => $account->id, 'status' => 'approved', 'requested_password' => 'newpass1']);
        \App\Models\PasswordRequest::create(['user_id' => $otherUser->id, 'game_account_id' => $otherAccount->id, 'status' => 'pending']);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/user/games/password-requests');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Panda Master', $response->json('data.0.game_account.game.name'));
        $this->assertSame('histaccount', $response->json('data.0.game_account.username'));
    }
}
