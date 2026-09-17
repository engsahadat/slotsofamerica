<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\WithdrawMethod;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Client-reported gap: users had no way to cancel a withdrawal they'd already submitted while
 * it was still awaiting admin review — the only way out was to wait for an admin to reject it.
 * POST /user/withdraw/{id}/cancel lets the user do this themselves, but only while the
 * transaction is still 'pending' (once an admin has acted, self-service cancellation would race
 * that review).
 */
class UserWithdrawCancelTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    private function makeMethod(): WithdrawMethod
    {
        return WithdrawMethod::create([
            'name' => 'Cash App', 'code' => 'cashapp', 'minimum_amount' => 1, 'maximum_amount' => 10000,
            'fee_percentage' => 0, 'fee_fixed' => 0, 'is_active' => true,
        ]);
    }

    public function test_user_can_cancel_their_own_pending_withdrawal_and_gets_refunded(): void
    {
        $user = User::factory()->create(['balance' => 100]);
        $method = $this->makeMethod();
        $token = $this->tokenFor($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 40, 'account_details' => ['tag' => '$cashtag'],
            ])->assertStatus(201);

        $this->assertSame(60.0, (float) $user->fresh()->balance);
        $transaction = Transaction::where('user_id', $user->id)->where('type', 'withdraw')->firstOrFail();
        $this->assertSame('pending', $transaction->status);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/user/withdraw/{$transaction->id}/cancel");

        $res->assertStatus(200);
        $this->assertSame(100.0, (float) $res->json('new_balance'));
        $this->assertSame(100.0, (float) $user->fresh()->balance);

        $transaction->refresh();
        $this->assertSame('rejected', $transaction->status);
        $this->assertSame('Cancelled by user.', $transaction->failure_reason);
        $this->assertDatabaseHas('transaction_logs', [
            'transaction_id' => $transaction->id,
            'action' => 'user_cancelled_withdraw',
            'action_by' => $user->id,
        ]);
    }

    public function test_a_withdrawal_already_approved_by_admin_cannot_be_cancelled(): void
    {
        $user = User::factory()->create(['balance' => 100]);
        $method = $this->makeMethod();
        $token = $this->tokenFor($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 40, 'account_details' => ['tag' => '$cashtag'],
            ])->assertStatus(201);

        $transaction = Transaction::where('user_id', $user->id)->where('type', 'withdraw')->firstOrFail();
        $transaction->update(['status' => 'approved', 'reviewed_at' => now()]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/user/withdraw/{$transaction->id}/cancel");

        $res->assertStatus(422);
        // Balance untouched by the cancel attempt — still just the post-submit reserved amount.
        $this->assertSame(60.0, (float) $user->fresh()->balance);
        $this->assertSame('approved', $transaction->fresh()->status);
    }

    public function test_a_user_cannot_cancel_another_users_withdrawal(): void
    {
        $owner = User::factory()->create(['balance' => 100]);
        $other = User::factory()->create(['balance' => 100]);
        $method = $this->makeMethod();

        $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($owner))
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 40, 'account_details' => ['tag' => '$cashtag'],
            ])->assertStatus(201);

        $transaction = Transaction::where('user_id', $owner->id)->where('type', 'withdraw')->firstOrFail();

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($other))
            ->postJson("/api/user/withdraw/{$transaction->id}/cancel");

        $res->assertStatus(404);
        $this->assertSame('pending', $transaction->fresh()->status);
        $this->assertSame(60.0, (float) $owner->fresh()->balance);
    }

    public function test_cancelling_a_deposit_transaction_id_is_rejected_not_treated_as_a_withdrawal(): void
    {
        $user = User::factory()->create(['balance' => 100]);
        $deposit = Transaction::create([
            'user_id' => $user->id, 'type' => 'deposit', 'amount' => 25, 'status' => 'pending',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson("/api/user/withdraw/{$deposit->id}/cancel");

        $res->assertStatus(404);
    }
}
