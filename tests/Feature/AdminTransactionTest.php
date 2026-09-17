<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameUnlockRequest;
use App\Models\PaymentGateway;
use App\Models\Transaction;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: the entire Transactions admin page (list/approve/reject/bulk/undo/edit-amount/
 * logs) was dead Supabase code except Create/Delete. Locks in the real Laravel endpoints this
 * turn built/rewired it to, including the "completed" (UI label) -> "approved" (real DB enum)
 * mapping bug class found repeatedly this session.
 */
class AdminTransactionTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_index_maps_completed_tab_to_approved_status(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 20, 'status' => 'approved']);
        Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 30, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/transactions?type=deposit&status=completed');
        $res->assertStatus(200);
        $this->assertCount(1, $res->json('transactions'));
        $this->assertSame('approved', $res->json('transactions.0.status'));
    }

    public function test_index_includes_gateway_info_for_deposits(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $gateway = PaymentGateway::create(['name' => 'Cash App', 'address' => '$Pay', 'minimum_amount' => 10, 'is_active' => true]);
        Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 20, 'status' => 'pending', 'gateway_id' => $gateway->id]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/transactions?type=deposit&status=pending');
        $res->assertStatus(200);
        $this->assertSame('Cash App', $res->json('transactions.0.gateway.name'));
    }

    public function test_pending_counts_grouped_by_type(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 20, 'status' => 'pending']);
        Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 20, 'status' => 'pending']);
        Transaction::create(['user_id' => $player->id, 'type' => 'withdraw', 'amount' => 20, 'status' => 'pending']);
        Transaction::create(['user_id' => $player->id, 'type' => 'withdraw', 'amount' => 20, 'status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/transactions/pending-counts');
        $res->assertStatus(200);
        $this->assertEquals(2, $res->json('counts.deposit'));
        $this->assertEquals(1, $res->json('counts.withdraw'));
    }

    public function test_undo_reverses_a_credited_deposit_back_to_pending(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100]);
        $txn = Transaction::create([
            'user_id' => $player->id, 'type' => 'deposit', 'amount' => 40, 'status' => 'approved',
            'reviewed_by' => $admin->id, 'reviewed_at' => now(),
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/undo", ['reason' => 'Mistaken approval']);
        $res->assertStatus(200);

        $this->assertDatabaseHas('transactions', ['id' => $txn->id, 'status' => 'pending', 'reviewed_by' => null]);
        $this->assertEquals(60, $player->fresh()->balance);
    }

    public function test_undo_blocks_when_balance_already_spent(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 10]); // already spent the credited $40
        $txn = Transaction::create([
            'user_id' => $player->id, 'type' => 'deposit', 'amount' => 40, 'status' => 'approved',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/undo");
        $res->assertStatus(422);
        $this->assertDatabaseHas('transactions', ['id' => $txn->id, 'status' => 'approved']);
        $this->assertEquals(10, $player->fresh()->balance);
    }

    public function test_undo_reverses_a_refunded_rejected_withdraw(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100]); // 50 was refunded back already
        $txn = Transaction::create([
            'user_id' => $player->id, 'type' => 'withdraw', 'amount' => 50, 'status' => 'rejected', 'balance_reserved' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/undo");
        $res->assertStatus(200);
        $this->assertEquals(50, $player->fresh()->balance);
        $this->assertDatabaseHas('transactions', ['id' => $txn->id, 'status' => 'pending']);
    }

    public function test_edit_amount_adjusts_balance_for_an_approved_deposit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100]); // already credited $40
        $txn = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 40, 'status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/edit-amount", ['amount' => 60, 'reason' => 'Typo fix']);
        $res->assertStatus(200);

        $this->assertEquals(120, $player->fresh()->balance); // +20 delta
        $this->assertDatabaseHas('transactions', ['id' => $txn->id, 'amount' => 60]);
        $this->assertDatabaseHas('transaction_logs', ['transaction_id' => $txn->id, 'action' => 'edit_amount', 'old_amount' => 40, 'new_amount' => 60]);
    }

    public function test_edit_amount_does_not_touch_balance_for_a_pending_deposit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100]);
        $txn = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 40, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/edit-amount", ['amount' => 60]);
        $res->assertStatus(200);
        $this->assertEquals(100, $player->fresh()->balance);
    }

    public function test_edit_amount_blocks_negative_balance(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 5]);
        $txn = Transaction::create(['user_id' => $player->id, 'type' => 'withdraw', 'amount' => 20, 'status' => 'pending', 'balance_reserved' => true]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/edit-amount", ['amount' => 100]);
        $res->assertStatus(422);
        $this->assertEquals(5, $player->fresh()->balance);
    }

    public function test_logs_endpoint_returns_review_history(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $txn = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 20, 'status' => 'pending']);

        $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson("/api/admin/transactions/{$txn->id}/logs");
        $res->assertStatus(200);
        $this->assertCount(1, $res->json('logs'));
        $this->assertSame('review_approved', $res->json('logs.0.action'));
    }

    /**
     * Testing Requirements: "Cancelled payment" — an admin closing out a FAST Payment deposit
     * that's still pending on the gateway side (user abandoned checkout, or it's just stale)
     * marks the linked FastPaymentTransaction 'cancelled', distinct from 'failed' (which means
     * the gateway itself reported a failure). No balance was ever credited, so there's nothing
     * to undo — and once cancelled, a stray late webhook for the same order can never act on it
     * again (markCompleted/markFailed both require the core Transaction to still be 'pending').
     */
    public function test_rejecting_a_pending_fast_payment_deposit_marks_it_cancelled(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 0]);
        $txn = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 4.99, 'status' => 'pending']);
        \App\Models\FastPaymentTransaction::create([
            'transaction_id' => $txn->id, 'user_id' => $player->id, 'order_sn' => 'CANCELTEST1',
            'provider' => 'cashapp', 'requested_amount' => 4.99, 'payment_status' => 'pending',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$txn->id}/review", ['status' => 'rejected', 'note' => 'Abandoned checkout']);
        $res->assertStatus(200);

        $this->assertSame('rejected', $txn->fresh()->status);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'CANCELTEST1', 'payment_status' => 'cancelled']);
        $this->assertSame(0.0, (float) $player->fresh()->balance);
    }

    public function test_index_attaches_game_username_for_redeem_transactions(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $game = Game::create(['name' => 'Slots Master', 'is_active' => true]);
        GameUnlockRequest::create(['user_id' => $player->id, 'game_id' => $game->id, 'username' => 'player_ingame', 'email' => 'player@example.com', 'status' => 'approved']);
        Transaction::create(['user_id' => $player->id, 'game_id' => $game->id, 'type' => 'redeem', 'amount' => 15, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/transactions?type=redeem&status=pending');
        $res->assertStatus(200);
        $this->assertSame('player_ingame', $res->json('transactions.0.game_username'));
    }
}
