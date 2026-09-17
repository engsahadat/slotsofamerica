<?php

namespace Tests\Feature;

use App\Models\FastPaymentTransaction;
use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Services\FastPaymentService;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Financial Transaction Safety: every completed Recharge, Redeem, and FAST Deposit
 * transaction must carry a full ledger record — provider, balance_before, balance_after,
 * and (on failure) a structured failure_reason — not just a status flip.
 */
class FinancialLedgerFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function authHeader(User $user): array
    {
        return ['Authorization' => 'Bearer ' . JwtAuthService::generateToken($user)];
    }

    private function setUpAssignedProvider(Game $game, array $overrides = []): GameApiProvider
    {
        $provider = GameApiProvider::create(array_merge([
            'name' => 'ledgerprovider', 'display_name' => 'Ledger Test Provider',
            'base_url' => 'https://agentserver.ledgerprovider.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ], $overrides));
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $admin = User::factory()->create(['role' => 'admin']);
        $this->withHeaders($this->authHeader($admin))
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        return $provider->fresh();
    }

    public function test_a_completed_recharge_carries_a_full_ledger_record(): void
    {
        $user = User::factory()->create(['balance' => 100, 'username' => 'ledgerrecharge']);
        $game = Game::create(['name' => 'Ledger Recharge Game', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'ledgerrecharge',
            'email' => 'l@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_deposit' => true]);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'ledgerrecharge', 'id' => 1]]]], 200),
            '*/api/player/playerRecharge' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20])
            ->assertStatus(201);

        $txn = Transaction::where('user_id', $user->id)->where('type', 'transfer')->first();
        $this->assertSame('Ledger Test Provider', $txn->provider);
        $this->assertSame(100.0, (float) $txn->balance_before);
        $this->assertSame(80.0, (float) $txn->balance_after);
        $this->assertNotNull($txn->provider_reference);
        $this->assertNull($txn->failure_reason);
    }

    public function test_a_failed_redeem_carries_a_structured_failure_reason_and_unchanged_balances(): void
    {
        $user = User::factory()->create(['balance' => 5, 'username' => 'ledgerredeem']);
        $game = Game::create(['name' => 'Ledger Redeem Game', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'ledgerredeem',
            'email' => 'lr@example.com', 'status' => 'approved',
        ]);
        $this->setUpAssignedProvider($game, ['automate_withdraw' => true]);

        Http::fake(['*' => Http::response(['code' => 1, 'message' => 'down'], 500)]);

        $this->withHeaders($this->authHeader($user))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 45])
            ->assertStatus(422);

        $txn = Transaction::where('user_id', $user->id)->where('type', 'redeem')->first();
        $this->assertSame('rejected', $txn->status);
        $this->assertNotEmpty($txn->failure_reason);
        $this->assertSame((float) $txn->balance_before, (float) $txn->balance_after);
        $this->assertSame(5.0, (float) $txn->balance_before);
    }

    public function test_a_completed_fast_deposit_carries_a_full_ledger_record(): void
    {
        $key = 'f84019c271fa2020bba9141c7d8ee20e';
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1096978174',
            'fast_payment_key' => $key,
        ]);
        $user = User::factory()->create(['balance' => 10]);

        $transaction = Transaction::create(['user_id' => $user->id, 'type' => 'deposit', 'amount' => 4.99, 'status' => 'pending']);
        FastPaymentTransaction::create([
            'transaction_id' => $transaction->id, 'user_id' => $user->id, 'order_sn' => 'LEDGERORDER1',
            'provider' => 'cashapp', 'requested_amount' => 4.99, 'payment_status' => 'pending',
        ]);

        $payload = ['merchant_id' => '1096978174', 'transaction_id' => 'PLATFORM_TXN_LEDGER', 'outer_order_sn' => 'LEDGERORDER1', 'pay_status' => '1', 'amount' => '4.99'];
        $payload['sign'] = FastPaymentService::sign($payload, $key);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        $txn = $transaction->fresh();
        $this->assertSame('FAST Payment (cashapp)', $txn->provider);
        $this->assertSame('PLATFORM_TXN_LEDGER', $txn->provider_reference);
        $this->assertSame(10.0, (float) $txn->balance_before);
        $this->assertSame(14.99, (float) $txn->balance_after);
    }
}
