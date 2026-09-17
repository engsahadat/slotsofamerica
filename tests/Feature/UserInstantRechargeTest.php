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
 * Game API: Recharge Integration — extends the existing (previously always-pending-for-admin)
 * /user/transfer endpoint so games with an assigned Game API provider that has automate_deposit
 * on get confirmed INSTANTLY, in the same request: wallet -> game account, with the wallet only
 * ever permanently debited once the provider actually confirms.
 */
class UserInstantRechargeTest extends TestCase
{
    use RefreshDatabase;

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . JwtAuthService::generateToken($user)];
    }

    private function setUpAssignedProvider(Game $game, array $overrides = []): GameApiProvider
    {
        $provider = GameApiProvider::create(array_merge([
            'name' => 'rechargeprovider', 'display_name' => 'Recharge Provider',
            'base_url' => 'https://agentserver.rechargeprovider.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ], $overrides));
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->withHeaders($this->authHeader($admin))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        return $provider->fresh();
    }

    public function test_instant_recharge_succeeds_and_debits_the_wallet_exactly_once(): void
    {
        $user = User::factory()->create(['balance' => 100, 'username' => 'recharger']);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'recharger',
            'email' => 'r@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_deposit' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'recharger', 'id' => 9]]]], 200),
            '*/api/player/playerRecharge' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 30]);

        $res->assertStatus(201)->assertJsonPath('instant', true);
        $this->assertSame(70.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'transfer', 'status' => 'approved', 'amount' => 30,
        ]);
        $txn = Transaction::where('user_id', $user->id)->first();
        $this->assertNotNull($txn->provider_reference);
        $this->assertDatabaseHas('transaction_logs', [
            'transaction_id' => $txn->id, 'action' => 'auto_recharge_confirmed',
        ]);
        $this->assertNull(TransactionLog::where('transaction_id', $txn->id)->where('action', 'auto_recharge_confirmed')->first()->action_by);
    }

    public function test_a_failed_provider_recharge_fully_refunds_the_wallet(): void
    {
        $user = User::factory()->create(['balance' => 100, 'username' => 'failuser']);
        $game = Game::create(['name' => 'Game Vault', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'failuser',
            'email' => 'f@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_deposit' => true]);

        Http::fake(['*' => Http::response(['code' => 1, 'message' => 'down'], 500)]);

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 25]);

        $res->assertStatus(422)->assertJsonPath('instant', true);
        // Balance must be back to exactly what it was — never permanently deducted on failure.
        $this->assertSame(100.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'transfer', 'status' => 'rejected', 'amount' => 25,
        ]);
    }

    public function test_a_game_with_no_provider_automation_falls_back_to_pending_admin_review_unchanged(): void
    {
        $user = User::factory()->create(['balance' => 100]);
        $game = Game::create(['name' => 'Manual Only Game', 'is_active' => true]);
        // No GameProviderAssignment at all — the original, unmodified behavior.

        Http::fake();

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 40]);

        $res->assertStatus(201)->assertJsonPath('instant', false);
        Http::assertNothingSent();
        $this->assertSame(60.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'type' => 'transfer', 'status' => 'pending', 'balance_reserved' => true,
        ]);
    }

    public function test_insufficient_balance_is_rejected_before_any_reservation_or_provider_call(): void
    {
        $user = User::factory()->create(['balance' => 10]);
        $game = Game::create(['name' => 'Orion Stars', 'is_active' => true]);
        $this->setUpAssignedProvider($game, ['automate_deposit' => true]);

        Http::fake();

        $res = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 50]);

        $res->assertStatus(400);
        Http::assertNothingSent();
        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 0);
    }

    /**
     * The core duplicate-submission guarantee: a double-click (or a retried request) carrying
     * the same idempotency_key must never reserve/debit the wallet twice.
     */
    public function test_a_duplicate_submission_with_the_same_idempotency_key_never_double_charges(): void
    {
        $user = User::factory()->create(['balance' => 100]);
        $game = Game::create(['name' => 'Manual Only Game', 'is_active' => true]);

        $key = 'client-generated-key-123';

        $first = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20, 'idempotency_key' => $key]);
        $first->assertStatus(201);

        $second = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20, 'idempotency_key' => $key]);
        $second->assertStatus(200);

        $this->assertSame($first->json('transaction.id'), $second->json('transaction.id'));
        // Only ONE deduction happened, not two.
        $this->assertSame(80.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 1);
    }

    /**
     * Testing Requirements: "Double-click" — distinct from the idempotency-key test above,
     * this simulates a genuine double-click where the frontend fires two requests with NO
     * shared key at all (each handleSubmit() call mints its own key normally, but a very fast
     * double-click could beat React's state update). The row lock on the user's balance is
     * what actually protects this case: two rapid submissions can never jointly overdraw a
     * balance they don't have, and the second one is cleanly rejected rather than silently
     * succeeding into a negative balance.
     */
    public function test_two_rapid_submissions_with_no_shared_idempotency_key_never_overdraw_the_wallet(): void
    {
        $user = User::factory()->create(['balance' => 30]);
        $game = Game::create(['name' => 'Manual Only Double Click Game', 'is_active' => true]);

        $first = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20]);
        $second = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20]);

        // Only enough balance for one of the two — exactly one succeeds, the other is cleanly
        // rejected, and the balance never goes negative.
        $statuses = [$first->status(), $second->status()];
        sort($statuses);
        $this->assertSame([201, 400], $statuses);
        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 1);
    }
}
