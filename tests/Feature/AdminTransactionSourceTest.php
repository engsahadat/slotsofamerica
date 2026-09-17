<?php

namespace Tests\Feature;

use App\Models\FastPaymentTransaction;
use App\Models\Game;
use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\PaymentGateway;
use App\Models\Transaction;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Admin Visibility: every transaction in the admin list must be identifiable as Manual, FAST
 * Payment, or Game API — from real recorded evidence (a linked FastPaymentTransaction, or an
 * actual game_api_logs row for it), never just "a provider happens to be assigned to this game".
 */
class AdminTransactionSourceTest extends TestCase
{
    use RefreshDatabase;

    private function adminHeader(): array
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return ['Authorization' => 'Bearer ' . JwtAuthService::generateToken($admin)];
    }

    private function fetchTransactions(string $type): array
    {
        $res = $this->withHeaders($this->adminHeader())->getJson("/api/admin/transactions?type={$type}");
        $res->assertStatus(200);

        return $res->json('transactions');
    }

    public function test_a_fast_payment_deposit_is_classified_as_fast_payment_even_while_pending(): void
    {
        $user = User::factory()->create();
        $transaction = Transaction::create(['user_id' => $user->id, 'type' => 'deposit', 'amount' => 4.99, 'status' => 'pending']);
        FastPaymentTransaction::create([
            'transaction_id' => $transaction->id, 'user_id' => $user->id, 'order_sn' => 'SRC1',
            'provider' => 'cashapp', 'requested_amount' => 4.99, 'payment_status' => 'pending',
        ]);

        $rows = $this->fetchTransactions('deposit');
        $row = collect($rows)->firstWhere('id', $transaction->id);

        $this->assertSame('fast_payment', $row['source']);
        $this->assertSame('FAST Payment (cashapp)', $row['source_provider']);
        $this->assertSame('SRC1', $row['source_reference']);
        $this->assertSame('pending', $row['source_status']);
    }

    public function test_a_manual_gateway_deposit_is_classified_as_manual(): void
    {
        $user = User::factory()->create();
        $gateway = PaymentGateway::create(['name' => 'USDT TRC20', 'address' => 'T123', 'minimum_amount' => 10]);
        Transaction::create(['user_id' => $user->id, 'gateway_id' => $gateway->id, 'type' => 'deposit', 'amount' => 50, 'status' => 'pending']);

        $rows = $this->fetchTransactions('deposit');
        $row = $rows[0];

        $this->assertSame('manual', $row['source']);
        $this->assertSame('USDT TRC20', $row['source_provider']);
    }

    public function test_a_recharge_that_actually_went_through_the_game_api_is_classified_as_game_api(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'API Game', 'is_active' => true]);
        $provider = GameApiProvider::create([
            'name' => 'srcprovider', 'display_name' => 'Src Provider', 'base_url' => 'https://x.example.com',
            'agent_username' => 'a', 'is_active' => true,
        ]);
        $transaction = Transaction::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'type' => 'transfer',
            'amount' => 20, 'status' => 'approved', 'provider' => 'Src Provider', 'provider_reference' => 'recharge:1',
        ]);
        GameApiLog::create([
            'provider_id' => $provider->id, 'provider_name' => $provider->name, 'action' => 'recharge',
            'success' => true, 'related_transaction_id' => $transaction->id, 'created_at' => now(),
        ]);

        $rows = $this->fetchTransactions('transfer');
        $row = collect($rows)->firstWhere('id', $transaction->id);

        $this->assertSame('game_api', $row['source']);
        $this->assertSame('Src Provider', $row['source_provider']);
        $this->assertSame('recharge:1', $row['source_reference']);
    }

    /**
     * The precise regression this classification exists to prevent: a game HAS a provider
     * assigned, but automation was off (or the admin just approved it manually before any
     * automated call could happen) — no game_api_logs row exists for this transaction, so it
     * must show as Manual, not Game API, even though a provider is configured for the game.
     */
    public function test_a_manually_approved_transfer_for_a_game_with_an_assigned_provider_but_no_actual_api_call_is_classified_as_manual(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'Assigned But Manual Game', 'is_active' => true]);
        $provider = GameApiProvider::create([
            'name' => 'unusedprovider', 'display_name' => 'Unused Provider', 'base_url' => 'https://x.example.com',
            'agent_username' => 'a', 'is_active' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $transaction = Transaction::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'type' => 'transfer',
            'amount' => 20, 'status' => 'approved',
        ]);
        // Deliberately no GameApiLog row — nothing was ever actually called.

        $rows = $this->fetchTransactions('transfer');
        $row = collect($rows)->firstWhere('id', $transaction->id);

        $this->assertSame('manual', $row['source']);
    }
}
