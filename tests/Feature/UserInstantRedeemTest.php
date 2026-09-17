<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Game API: Redeem Integration — the reverse of Recharge. Extends the existing (previously
 * always-pending-for-admin) /user/redeem/request endpoint so games with an assigned Game API
 * provider that has automate_withdraw on get confirmed INSTANTLY: the provider deducts the
 * player's in-game balance first, and only a confirmed success ever credits the site wallet.
 */
class UserInstantRedeemTest extends TestCase
{
    use RefreshDatabase;

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . JwtAuthService::generateToken($user)];
    }

    private function setUpAssignedProvider(Game $game, array $overrides = []): GameApiProvider
    {
        $provider = GameApiProvider::create(array_merge([
            'name' => 'redeemprovider', 'display_name' => 'Redeem Provider',
            'base_url' => 'https://agentserver.redeemprovider.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ], $overrides));
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->withHeaders($this->authHeader($admin))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        return $provider->fresh();
    }

    public function test_instant_redeem_succeeds_and_credits_the_wallet_exactly_once(): void
    {
        $user = User::factory()->create(['balance' => 10, 'username' => 'redeemer']);
        $game = Game::create(['name' => 'River Sweeps', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'redeemer',
            'email' => 'r@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'redeemer', 'id' => 5]]]], 200),
            '*/api/player/playerWithdraw' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 40]);

        $res->assertStatus(201)->assertJsonPath('instant', true);
        $this->assertSame(50.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'redeem', 'status' => 'approved', 'amount' => 40,
        ]);
        $txn = Transaction::where('user_id', $user->id)->first();
        $this->assertNotNull($txn->provider_reference);
        $this->assertDatabaseHas('transaction_logs', [
            'transaction_id' => $txn->id, 'action' => 'auto_redeem_confirmed',
        ]);
        $this->assertNull(TransactionLog::where('transaction_id', $txn->id)->where('action', 'auto_redeem_confirmed')->first()->action_by);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/api/player/playerWithdraw'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/api/player/playerRecharge'));
    }

    public function test_a_failed_provider_redeem_never_adds_balance(): void
    {
        $user = User::factory()->create(['balance' => 5, 'username' => 'failredeem']);
        $game = Game::create(['name' => 'Juwa', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'failredeem',
            'email' => 'f@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        Http::fake(['*' => Http::response(['code' => 1, 'message' => 'down'], 500)]);

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 50]);

        $res->assertStatus(422)->assertJsonPath('instant', true);
        // Balance must be completely untouched — it was never added in the first place.
        $this->assertSame(5.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'redeem', 'status' => 'rejected', 'amount' => 50,
        ]);
    }

    public function test_a_game_with_no_provider_automation_falls_back_to_pending_admin_review_unchanged(): void
    {
        $user = User::factory()->create(['balance' => 0]);
        $game = Game::create(['name' => 'Manual Only Redeem Game', 'is_active' => true]);
        // No GameProviderAssignment at all — the original, unmodified behavior.

        Http::fake();

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 45]);

        $res->assertStatus(201)->assertJsonPath('instant', false);
        Http::assertNothingSent();
        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'redeem', 'status' => 'pending',
        ]);
    }

    /** The core duplicate-callback/double-submit guarantee: never credit the wallet twice. */
    public function test_a_duplicate_submission_with_the_same_idempotency_key_never_credits_twice(): void
    {
        $user = User::factory()->create(['balance' => 0, 'username' => 'dupredeem']);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'dupredeem',
            'email' => 'd@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'dupredeem', 'id' => 3]]]], 200),
            '*/api/player/playerWithdraw' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $key = 'redeem-key-abc';
        $first = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 45, 'idempotency_key' => $key]);
        $first->assertStatus(201);

        $second = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 45, 'idempotency_key' => $key]);
        $second->assertStatus(200);

        $this->assertSame($first->json('transaction.id'), $second->json('transaction.id'));
        $this->assertSame(45.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 1);
        // The provider's withdraw endpoint was only ever hit once, not twice, for this one
        // logical redeem — the second (duplicate) submission never reached the provider at all.
        $withdrawCalls = collect(Http::recorded())->filter(fn ($pair) => str_contains($pair[0]->url(), '/api/player/playerWithdraw'));
        $this->assertCount(1, $withdrawCalls);
    }
}
