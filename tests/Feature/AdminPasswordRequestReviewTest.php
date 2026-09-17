<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameAccount;
use App\Models\PasswordRequest;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression test for two stacked bugs found while wiring Email Templates:
 * 1. The route pointed at a nonexistent controller method (`reviewPassword` instead of
 *    `reviewPasswordRequest`), so this endpoint 500'd on every call.
 * 2. The controller wrote to a `admin_note` attribute that has no matching column on
 *    `password_requests` (the real column is `rejection_reason`, which is also what the
 *    frontend actually sends) — a second, independent 500 that the route fix alone didn't cover.
 * Both are fixed now; this locks the whole flow in.
 */
class AdminPasswordRequestReviewTest extends TestCase
{
    use RefreshDatabase;

    private function makeRequest(): PasswordRequest
    {
        $player = User::factory()->create(['role' => 'user']);
        $game = Game::create(['name' => 'Slots Master', 'is_active' => true]);
        $account = GameAccount::create(['game_id' => $game->id, 'username' => 'player1', 'password_hash' => 'old', 'status' => 'assigned', 'assigned_to' => $player->id]);

        return PasswordRequest::create([
            'user_id' => $player->id, 'game_account_id' => $account->id, 'requested_password' => 'newpass123', 'status' => 'pending',
        ]);
    }

    public function test_admin_can_approve_a_password_request(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $req = $this->makeRequest();

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/game-access/password/{$req->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        $this->assertDatabaseHas('password_requests', ['id' => $req->id, 'status' => 'approved']);
        $this->assertDatabaseHas('game_accounts', ['id' => $req->game_account_id, 'password_hash' => 'newpass123']);
    }

    public function test_admin_can_reject_a_password_request_with_a_reason(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $req = $this->makeRequest();

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/game-access/password/{$req->id}/review", [
                'status' => 'rejected', 'rejection_reason' => 'Password too weak.',
            ]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('password_requests', [
            'id' => $req->id, 'status' => 'rejected', 'rejection_reason' => 'Password too weak.',
        ]);
    }

    public function test_admin_can_delete_a_password_request(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $req = $this->makeRequest();

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->deleteJson("/api/admin/game-access/password/{$req->id}");
        $res->assertStatus(200);
        $this->assertDatabaseMissing('password_requests', ['id' => $req->id]);
    }

    /**
     * Regression: the "Enter new password" input (used when a request has no stored
     * requested_password, or the admin wants to override it) posts `new_password`, but the
     * controller never read that field at all — it silently re-applied whatever was already on
     * the row, so an admin-typed password never actually reached the game account.
     */
    public function test_admin_can_override_the_password_on_approval(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $game = Game::create(['name' => 'Slots Master', 'is_active' => true]);
        $account = GameAccount::create(['game_id' => $game->id, 'username' => 'player1', 'password_hash' => 'old', 'status' => 'assigned', 'assigned_to' => $player->id]);
        // No requested_password stored — this is the "admin must type one in" case.
        $req = PasswordRequest::create(['user_id' => $player->id, 'game_account_id' => $account->id, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/game-access/password/{$req->id}/review", [
                'status' => 'approved', 'new_password' => 'AdminChosen123',
            ]);
        $res->assertStatus(200);

        $this->assertDatabaseHas('password_requests', ['id' => $req->id, 'requested_password' => 'AdminChosen123']);
        $this->assertDatabaseHas('game_accounts', ['id' => $account->id, 'password_hash' => 'AdminChosen123']);
    }
}
