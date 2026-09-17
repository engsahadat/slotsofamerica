<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FastPaymentDepositTest extends TestCase
{
    use RefreshDatabase;

    private function configure(): void
    {
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1092768610',
            'fast_payment_key' => 'f84019c271fa2020bba9141c7d8ee20e',
        ]);
    }

    public function test_a_supported_amount_creates_a_pending_deposit_and_returns_a_pay_url(): void
    {
        $this->configure();
        Http::fake(['*/api/payment/pay' => Http::response([
            'status' => '00000', 'msg' => 'ok', 'pay_url' => 'https://cash.app/$test',
            'amount' => '4.99', 'outer_order_sn' => 'x', 'merchant_id' => '1092768610',
        ], 200)]);

        $user = User::factory()->create(['balance' => 0]);
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit/fast-payment', ['provider' => 'cashapp', 'amount' => 4.99]);

        $res->assertStatus(201)->assertJsonPath('pay_url', 'https://cash.app/$test');

        $this->assertDatabaseHas('transactions', ['user_id' => $user->id, 'type' => 'deposit', 'status' => 'pending', 'amount' => 4.99]);
        $this->assertDatabaseHas('fast_payment_transactions', ['user_id' => $user->id, 'provider' => 'cashapp', 'payment_status' => 'pending']);
        // Balance must NOT move yet — only a verified webhook may credit it.
        $this->assertSame(0.0, (float) $user->fresh()->balance);
    }

    /**
     * Testing Requirements explicitly names all three providers — confirms each one is wired
     * correctly through to the gateway's own is_pay code, not just cashapp.
     */
    public function test_google_pay_creates_a_pending_deposit_and_returns_a_pay_url(): void
    {
        $this->assertProviderCreatesPendingDeposit('googlepay');
    }

    public function test_apple_pay_creates_a_pending_deposit_and_returns_a_pay_url(): void
    {
        $this->assertProviderCreatesPendingDeposit('applepay');
    }

    private function assertProviderCreatesPendingDeposit(string $provider): void
    {
        $this->configure();
        Http::fake(["*/api/payment/pay" => Http::response([
            'status' => '00000', 'msg' => 'ok', 'pay_url' => "https://pay.example.com/{$provider}",
            'amount' => '4.99', 'outer_order_sn' => 'x', 'merchant_id' => '1092768610',
        ], 200)]);

        $user = User::factory()->create(['balance' => 0]);
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit/fast-payment', ['provider' => $provider, 'amount' => 4.99]);

        $res->assertStatus(201)->assertJsonPath('pay_url', "https://pay.example.com/{$provider}");
        $this->assertDatabaseHas('fast_payment_transactions', ['user_id' => $user->id, 'provider' => $provider, 'payment_status' => 'pending']);
        $this->assertSame(0.0, (float) $user->fresh()->balance);
    }

    /**
     * Regression: the amount list is a fixed, documented set of values, not a continuous
     * $4.99-$499.99 range — the backend must reject anything not in that exact list
     * regardless of what the frontend sends, per "never trust an amount sent only from React".
     */
    public function test_an_unsupported_amount_is_rejected_before_any_gateway_call(): void
    {
        $this->configure();
        Http::fake();

        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit/fast-payment', ['provider' => 'cashapp', 'amount' => 50.00]);

        $res->assertStatus(422);
        Http::assertNothingSent();
        $this->assertDatabaseCount('transactions', 0);
    }

    /**
     * The user-facing message is deliberately a fixed, generic sentence — never the gateway's
     * own raw text ("Merchant suspended" here) — so a real customer is never shown provider
     * jargon or anything that hints at which third-party processor is behind Instant Deposit.
     * The real reason still reaches admins via fast_payment_api_logs (FastPaymentService::log()).
     */
    public function test_a_gateway_side_failure_creates_no_transaction_row_at_all(): void
    {
        $this->configure();
        Http::fake(['*/api/payment/pay' => Http::response(['status' => '10001', 'msg' => 'Merchant suspended'], 200)]);

        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit/fast-payment', ['provider' => 'applepay', 'amount' => 9.99]);

        $res->assertStatus(422)
            ->assertJsonPath('message', 'Instant Deposit could not be started right now. Please try Manual Deposit or try again shortly.');
        $this->assertDatabaseCount('transactions', 0);
        $this->assertDatabaseCount('fast_payment_transactions', 0);

        $log = \App\Models\FastPaymentApiLog::where('action', 'create_payment')->latest('id')->first();
        $this->assertSame('Merchant suspended', $log->error_message);
    }

    /**
     * The frontend now sends a stable per-browser X-Device-Id header on every request (see
     * services/api.ts) specifically so this optional-but-fraud-relevant field is actually
     * populated — live debugging turned up FAST Payment's risk engine flagging transactions as
     * "High Risk Client", and a consistently-empty device_id was one gap between what the doc
     * allows sending and what we actually sent.
     */
    public function test_the_x_device_id_header_is_forwarded_to_the_gateway_as_device_id(): void
    {
        $this->configure();
        Http::fake(['*/api/payment/pay' => Http::response([
            'status' => '00000', 'msg' => 'ok', 'pay_url' => 'https://cash.app/$test',
            'amount' => '4.99', 'outer_order_sn' => 'x', 'merchant_id' => '1092768610',
        ], 200)]);

        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->withHeader('X-Device-Id', 'dev-abc-123')
            ->postJson('/api/user/deposit/fast-payment', ['provider' => 'cashapp', 'amount' => 4.99])
            ->assertStatus(201);

        Http::assertSent(fn ($request) => $request['device_id'] === 'dev-abc-123');
    }

    public function test_an_invalid_provider_is_rejected(): void
    {
        $this->configure();
        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit/fast-payment', ['provider' => 'paypal', 'amount' => 4.99])
            ->assertStatus(422);
    }
}
