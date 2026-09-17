<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Regression coverage for wiring Provisioner::processTransaction() into
 * AdminTransactionApiController::review() (previously built but never called from anywhere).
 *
 * Also locks in a direction bug found while wiring this up: 'redeem' ("cash out in-game
 * earnings" -> site wallet) must DEDUCT from the player's in-game balance, and 'transfer'
 * ("site wallet -> a game account") must ADD to it — the original port had these exactly
 * backwards (grouped redeem with deposit->recharge, and transfer with withdraw->withdraw),
 * which would have recharged a player's game balance when they cashed OUT and drained it
 * when money moved IN.
 */
class ProviderTransactionSyncTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function setUpAssignedProvider(Game $game, array $providerOverrides = []): GameApiProvider
    {
        $provider = GameApiProvider::create(array_merge([
            'name' => 'syncprovider', 'display_name' => 'Sync Provider',
            'base_url' => 'https://agentserver.syncprovider.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ], $providerOverrides));
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $admin = $this->adminToken();
        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        return $provider->fresh();
    }

    public function test_approving_a_redeem_transaction_withdraws_from_the_players_game_balance(): void
    {
        $player = User::factory()->create(['balance' => 0]);
        $game = Game::create(['name' => 'Cash Machine', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'username' => 'redeemplayer',
            'email' => 'redeem@example.com', 'status' => 'approved',
        ]);
        $provider = $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'redeemplayer', 'id' => 42]]]], 200),
            '*/api/player/playerWithdraw' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $txn = Transaction::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'type' => 'redeem', 'amount' => 30, 'status' => 'pending',
        ]);

        $admin = $this->adminToken();
        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/player/playerWithdraw'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/player/playerRecharge'));
        $this->assertDatabaseHas('game_api_logs', [
            'provider_name' => $provider->name, 'action' => 'withdraw', 'success' => true,
        ]);
        // The redeemed amount still correctly credits the user's site wallet regardless.
        $this->assertEquals(30, $player->fresh()->balance);
    }

    public function test_approving_a_transfer_transaction_recharges_the_players_game_balance(): void
    {
        $player = User::factory()->create(['balance' => 100]);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'username' => 'transferplayer',
            'email' => 'transfer@example.com', 'status' => 'approved',
        ]);
        $provider = $this->setUpAssignedProvider($game, ['automate_deposit' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'transferplayer', 'id' => 7]]]], 200),
            '*/api/player/playerRecharge' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        // Transfer reserves balance at submission time (already deducted), matching UserTransferApiController.
        $txn = Transaction::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'type' => 'transfer', 'amount' => 25,
            'status' => 'pending', 'balance_reserved' => true,
        ]);

        $admin = $this->adminToken();
        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/player/playerRecharge'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/player/playerWithdraw'));
        $this->assertDatabaseHas('game_api_logs', [
            'provider_name' => $provider->name, 'action' => 'recharge', 'success' => true,
        ]);
    }

    public function test_approval_still_succeeds_and_balance_is_still_correct_when_provider_sync_fails(): void
    {
        $player = User::factory()->create(['balance' => 0]);
        $game = Game::create(['name' => 'Orion Stars', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'username' => 'failplayer',
            'email' => 'fail@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        // Provider is unreachable for every call.
        Http::fake(['*' => Http::response(['code' => 1, 'message' => 'down'], 500)]);

        $txn = Transaction::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'type' => 'redeem', 'amount' => 15, 'status' => 'pending',
        ]);

        $admin = $this->adminToken();
        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'approved']);

        // The approval itself must still succeed and the balance must still be credited —
        // the provider mirror is best-effort only, never a gate on the real approval.
        $res->assertStatus(200);
        $this->assertStringContainsString('Note:', $res->json('message'));
        $this->assertDatabaseHas('transactions', ['id' => $txn->id, 'status' => 'approved']);
        $this->assertEquals(15, $player->fresh()->balance);
    }

    public function test_provider_sync_is_never_attempted_when_automation_is_off(): void
    {
        $player = User::factory()->create(['balance' => 0]);
        $game = Game::create(['name' => 'Juwa', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'username' => 'noautoplayer',
            'email' => 'noauto@example.com', 'status' => 'approved',
        ]);
        // automate_withdraw left false (default) — redeem should never touch the network.
        $this->setUpAssignedProvider($game);

        Http::fake();

        $txn = Transaction::create([
            'user_id' => $player->id, 'game_id' => $game->id, 'type' => 'redeem', 'amount' => 10, 'status' => 'pending',
        ]);

        $admin = $this->adminToken();
        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Http::assertNothingSent();
        $this->assertStringNotContainsString('Note:', $res->json('message'));
    }
}
