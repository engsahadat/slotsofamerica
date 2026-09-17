<?php

namespace Tests\Feature;

use App\Models\FastPaymentTransaction;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Services\FastPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FastPaymentWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'f84019c271fa2020bba9141c7d8ee20e';

    private function configure(): void
    {
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1096978174',
            'fast_payment_key' => self::KEY,
        ]);
    }

    private function makePendingDeposit(User $user, float $amount = 4.99, string $orderSn = 'FPTEST1'): void
    {
        $transaction = Transaction::create([
            'user_id' => $user->id, 'type' => 'deposit', 'amount' => $amount, 'status' => 'pending',
        ]);
        FastPaymentTransaction::create([
            'transaction_id' => $transaction->id, 'user_id' => $user->id, 'order_sn' => $orderSn,
            'provider' => 'cashapp', 'requested_amount' => $amount, 'payment_status' => 'pending',
        ]);
    }

    private function signedPayload(array $payload): array
    {
        $payload['sign'] = FastPaymentService::sign($payload, self::KEY);

        return $payload;
    }

    public function test_a_correctly_signed_success_webhook_credits_balance_exactly_once(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1096978174', 'transaction_id' => 'PLATFORM_TXN_1',
            'outer_order_sn' => 'FPTEST1', 'pay_status' => '1',
            'amount' => '4.99', 'primary_amount' => '4.99', 'user_name' => $user->username,
            'status' => '00000', 'msg' => 'Success',
        ]);

        $res = $this->postJson('/api/webhooks/fast-payment', $payload);

        $res->assertStatus(200)->assertSee('SUCCESS');
        $this->assertSame(14.99, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'status' => 'approved']);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'FPTEST1', 'payment_status' => 'completed', 'fast_transaction_id' => 'PLATFORM_TXN_1']);
    }

    /**
     * The core idempotency guarantee: the same webhook (FAST retries until it gets back
     * "SUCCESS") delivered twice must never credit the user's balance twice.
     */
    public function test_a_duplicate_delivery_of_the_same_webhook_never_double_credits(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1096978174', 'transaction_id' => 'PLATFORM_TXN_1',
            'outer_order_sn' => 'FPTEST1', 'pay_status' => '1', 'amount' => '4.99',
        ]);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);
        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);
        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        $this->assertSame(4.99, (float) $user->fresh()->balance);
    }

    /**
     * The single most important security property of this whole feature: a forged webhook
     * (correct-looking fields, no valid signature) must never credit balance. This is what
     * "never credit balance based only on frontend redirect" ultimately rests on.
     */
    public function test_a_webhook_with_an_invalid_signature_never_credits_balance(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $forged = [
            'merchant_id' => '1096978174', 'outer_order_sn' => 'FPTEST1',
            'pay_status' => '1', 'amount' => '4.99', 'sign' => 'NOT_A_REAL_SIGNATURE',
        ];

        $res = $this->postJson('/api/webhooks/fast-payment', $forged);

        $res->assertStatus(400);
        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'status' => 'pending']);
    }

    public function test_a_failure_webhook_marks_the_deposit_rejected_without_crediting(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1096978174', 'outer_order_sn' => 'FPTEST1', 'pay_status' => '5', 'amount' => '4.99',
        ]);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'FPTEST1', 'payment_status' => 'failed']);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'status' => 'rejected']);
    }

    public function test_a_webhook_for_an_unknown_order_is_rejected_not_silently_dropped(): void
    {
        $this->configure();
        $payload = $this->signedPayload(['merchant_id' => '1096978174', 'outer_order_sn' => 'NEVER_EXISTED', 'pay_status' => '1', 'amount' => '4.99']);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(404);
    }

    /**
     * Testing Requirements: "Cancelled payment" — a pay_status this system doesn't recognize as
     * a confirmed success(1)/failure(5)/refund(4) (whatever code the gateway uses for "user
     * abandoned checkout", if any) must never credit balance and must leave the deposit
     * resolvable later (still 'pending') rather than getting stuck in some unrecognized state —
     * the reconcile command or an admin can still close it out.
     */
    public function test_an_unrecognized_pay_status_leaves_the_deposit_safely_pending(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1096978174', 'outer_order_sn' => 'FPTEST1', 'pay_status' => '2', 'amount' => '4.99',
        ]);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200)->assertSee('SUCCESS');

        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'FPTEST1', 'payment_status' => 'pending']);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'status' => 'pending']);
    }

    /**
     * Testing Requirements: "Modified frontend amount" applied to the webhook direction — even
     * if a forged-but-validly-signed-somehow payload (impossible in practice since the sign
     * covers amount, but this is the belt-and-suspenders check) reports a different amount than
     * what we originally created the session for, the credit must always be OUR stored
     * requested_amount, never whatever the payload claims.
     */
    public function test_the_credited_amount_is_always_the_servers_own_requested_amount_never_the_payloads(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1096978174', 'outer_order_sn' => 'FPTEST1', 'pay_status' => '1',
            'amount' => '499.99', // wildly different from the 4.99 this session was actually created for.
        ]);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        // Credited exactly the original requested_amount (4.99), never the payload's 499.99.
        $this->assertSame(4.99, (float) $user->fresh()->balance);
    }

    /**
     * Live debugging discovery: FAST Payment's test/sandbox environment auto-sends a validly
     * signed "payment successful" webhook shortly after ANY session is created under a "Test
     * Merchant ID" — even when no real payment was ever made. A webhook reporting one of the
     * vendor-documented test merchant IDs must therefore never credit real balance, no matter
     * how good its signature looks — this is what actually happened live and got reversed
     * manually; this test locks the fix in place.
     */
    public function test_a_webhook_reporting_a_known_test_merchant_id_never_credits_balance_even_with_a_valid_signature(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1092768610', 'transaction_id' => 'SANDBOX_AUTO_1',
            'outer_order_sn' => 'FPTEST1', 'pay_status' => '1', 'amount' => '4.99',
        ]);

        $res = $this->postJson('/api/webhooks/fast-payment', $payload);

        $res->assertStatus(200)->assertSee('SUCCESS'); // still ack "SUCCESS" so FAST stops retrying.
        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'FPTEST1', 'payment_status' => 'pending']);
        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'status' => 'pending']);
    }

    /** The second, separately-issued test merchant ID (from a different revision of the vendor's
     * API doc) must be blocked too — not just the one this test file's configure() happens to use. */
    public function test_a_webhook_reporting_the_other_known_test_merchant_id_is_also_blocked(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $this->makePendingDeposit($user, 4.99, 'FPTEST1');

        $payload = $this->signedPayload([
            'merchant_id' => '1092767102', 'outer_order_sn' => 'FPTEST1', 'pay_status' => '1', 'amount' => '4.99',
        ]);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        $this->assertSame(0.0, (float) $user->fresh()->balance);
        $this->assertDatabaseHas('fast_payment_transactions', ['order_sn' => 'FPTEST1', 'payment_status' => 'pending']);
    }
}
