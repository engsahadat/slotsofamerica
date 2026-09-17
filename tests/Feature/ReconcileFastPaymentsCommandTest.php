<?php

namespace Tests\Feature;

use App\Models\FastPaymentTransaction;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Services\FastPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Recovery path for a FAST Payment webhook that never arrives — the deposit must eventually
 * resolve on its own via an active status query, without ever double-crediting if the webhook
 * shows up late, and without crediting anything at all until a verified, confirmed status
 * actually comes back.
 */
class ReconcileFastPaymentsCommandTest extends TestCase
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

    private function makeStalePendingDeposit(User $user, float $amount = 4.99, string $orderSn = 'RECON1'): FastPaymentTransaction
    {
        $transaction = Transaction::create(['user_id' => $user->id, 'type' => 'deposit', 'amount' => $amount, 'status' => 'pending']);

        $fp = FastPaymentTransaction::create([
            'transaction_id' => $transaction->id, 'user_id' => $user->id, 'order_sn' => $orderSn,
            'provider' => 'cashapp', 'requested_amount' => $amount, 'payment_status' => 'pending',
        ]);
        $fp->created_at = now()->subMinutes(20);
        $fp->save();

        return $fp;
    }

    private function signedQueryResponse(array $fields): array
    {
        $body = array_merge(['status' => '00000', 'msg' => 'ok'], $fields);
        $body['sign'] = FastPaymentService::sign($body, self::KEY);

        return $body;
    }

    public function test_it_credits_a_stale_pending_deposit_once_the_gateway_confirms_it(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON1');

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON1', 'transaction_id' => 'PLATFORM_RECON_1', 'pay_status' => '1', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(14.99, (float) $user->fresh()->balance);
        $this->assertSame('completed', $fp->fresh()->payment_status);
        $this->assertSame('approved', Transaction::find($fp->transaction_id)->status);
    }

    /**
     * Live debugging discovery: FAST Payment's test/sandbox environment reports pay_status=1 for
     * ANY order created under a "Test Merchant ID", regardless of whether a real payment ever
     * happened — this reconcile command must never trust that into a real balance credit either,
     * same as the webhook path.
     */
    public function test_a_query_response_reporting_a_known_test_merchant_id_is_never_credited(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON9');

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'merchant_id' => '1092768610', 'outer_order_sn' => 'RECON9', 'pay_status' => '1', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertSame('pending', $fp->fresh()->payment_status);
    }

    public function test_a_still_pending_gateway_status_leaves_the_deposit_untouched(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON2');

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON2', 'pay_status' => '0', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertSame('pending', $fp->fresh()->payment_status);
    }

    public function test_dry_run_never_applies_anything(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON3');

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON3', 'pay_status' => '1', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile --dry-run')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertSame('pending', $fp->fresh()->payment_status);
    }

    public function test_it_never_credits_a_query_response_with_an_invalid_signature(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON4');

        Http::fake(['*/api/payment/query' => Http::response([
            'status' => '00000', 'outer_order_sn' => 'RECON4', 'pay_status' => '1', 'amount' => '4.99', 'sign' => 'FORGED',
        ], 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertSame('pending', $fp->fresh()->payment_status);
    }

    /**
     * The real-world case this covers: a user is redirected to a FAST Payment checkout page but
     * never actually completes it (blocked/abandoned/tab closed) — no webhook will ever fire and
     * the gateway itself just keeps reporting "still processing" forever. Once a deposit has been
     * pending past --expire-after with nothing conclusive from FAST, it must auto-fail so the
     * user isn't shown "still processing" forever with no way to cleanly retry.
     */
    public function test_a_deposit_past_expire_after_is_auto_failed_when_the_gateway_still_reports_processing(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON6');
        $fp->created_at = now()->subMinutes(70); // past the default 60-minute expire-after
        $fp->save();

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON6', 'pay_status' => '0', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $fp->refresh();
        $this->assertSame('failed', $fp->payment_status);
        $this->assertSame('rejected', Transaction::find($fp->transaction_id)->status);
    }

    /** Same abandoned-checkout scenario, but the gateway can't even be reached at all — a dead
     * query must not block the auto-expiry from ever kicking in. */
    public function test_a_deposit_past_expire_after_is_auto_failed_even_when_the_query_itself_keeps_failing(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON7');
        $fp->created_at = now()->subMinutes(70);
        $fp->save();

        Http::fake(['*/api/payment/query' => Http::response('Service Unavailable', 503)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame('failed', $fp->fresh()->payment_status);
    }

    public function test_dry_run_never_expires_a_stale_deposit_either(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON8');
        $fp->created_at = now()->subMinutes(70);
        $fp->save();

        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON8', 'pay_status' => '0', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile --dry-run')->assertExitCode(0);

        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertSame('pending', $fp->fresh()->payment_status);
    }

    /** If the webhook actually arrives (or already arrived) before/during a reconcile run, the
     * command must never double-credit — same guarantee as two webhook deliveries. */
    public function test_it_never_double_credits_a_deposit_the_webhook_already_resolved(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);
        $fp = $this->makeStalePendingDeposit($user, 4.99, 'RECON5');

        // The webhook resolves it first.
        $webhookPayload = $this->signedQueryResponse([
            'outer_order_sn' => 'RECON5', 'transaction_id' => 'PLATFORM_RECON_5', 'pay_status' => '1', 'amount' => '4.99',
        ]);
        $this->postJson('/api/webhooks/fast-payment', $webhookPayload)->assertStatus(200);
        $this->assertSame(4.99, (float) $user->fresh()->balance);

        // Reconcile runs afterward and queries the gateway again — same confirmed status.
        Http::fake(['*/api/payment/query' => Http::response($this->signedQueryResponse([
            'outer_order_sn' => 'RECON5', 'transaction_id' => 'PLATFORM_RECON_5', 'pay_status' => '1', 'amount' => '4.99',
        ]), 200)]);

        $this->artisan('fast-payment:reconcile')->assertExitCode(0);

        $this->assertSame(4.99, (float) $user->fresh()->balance);
    }
}
