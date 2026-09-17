<?php

namespace Tests\Unit;

use App\Models\SiteSetting;
use App\Services\FastPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FastPaymentServiceTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'f84019c271fa2020bba9141c7d8ee20e';

    private function configure(): void
    {
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1092768610',
            'fast_payment_key' => self::KEY,
        ]);
    }

    /** Reproduces the doc's own worked example exactly (§1.1.1). */
    public function test_sign_matches_the_documented_example(): void
    {
        $sign = FastPaymentService::sign([
            'merchant_id' => '102145266451',
            'notify_url' => 'http://www.baidu.com',
            'order_sn' => 'PH170913A197F8200016',
            'amount' => '11',
            'account_no' => '888888',
        ], '22222222223333333333444444444425');

        $this->assertSame(strtoupper(md5(
            'account_no=888888&amount=11&merchant_id=102145266451&notify_url=http://www.baidu.com&order_sn=PH170913A197F8200016&key=22222222223333333333444444444425'
        )), $sign);
    }

    public function test_sign_ignores_the_sign_field_itself(): void
    {
        $withoutSign = FastPaymentService::sign(['a' => '1', 'b' => '2'], 'key');
        $withSign = FastPaymentService::sign(['a' => '1', 'b' => '2', 'sign' => 'whatever'], 'key');

        $this->assertSame($withoutSign, $withSign);
    }

    public function test_verify_signature_accepts_a_correctly_signed_payload(): void
    {
        $this->configure();
        $payload = ['outer_order_sn' => 'FP123', 'pay_status' => '1', 'amount' => '4.99'];
        $payload['sign'] = FastPaymentService::sign($payload, self::KEY);

        $this->assertTrue(FastPaymentService::verifySignature($payload));
    }

    public function test_verify_signature_rejects_a_tampered_payload(): void
    {
        $this->configure();
        $payload = ['outer_order_sn' => 'FP123', 'pay_status' => '1', 'amount' => '4.99'];
        $payload['sign'] = FastPaymentService::sign($payload, self::KEY);

        // Attacker changes the amount after signing — this is exactly the attack the whole
        // signature check exists to stop.
        $payload['amount'] = '499.99';

        $this->assertFalse(FastPaymentService::verifySignature($payload));
    }

    public function test_verify_signature_rejects_a_payload_with_no_sign_at_all(): void
    {
        $this->configure();

        $this->assertFalse(FastPaymentService::verifySignature(['outer_order_sn' => 'FP123', 'pay_status' => '1']));
    }

    public function test_only_the_exact_documented_amounts_are_supported(): void
    {
        $this->assertTrue(FastPaymentService::isAmountSupported(4.99));
        $this->assertTrue(FastPaymentService::isAmountSupported(499.99));
        $this->assertTrue(FastPaymentService::isAmountSupported(99.99));
        $this->assertFalse(FastPaymentService::isAmountSupported(50.00));
        $this->assertFalse(FastPaymentService::isAmountSupported(1.00));
        $this->assertFalse(FastPaymentService::isAmountSupported(500.00));
    }

    public function test_create_payment_sends_a_correctly_signed_form_post_and_returns_the_pay_url(): void
    {
        $this->configure();
        Http::fake([
            '*/api/payment/pay' => Http::response([
                'status' => '00000', 'msg' => 'Submission successful',
                'pay_url' => 'https://cash.app/$88888888', 'amount' => '4.99',
                'outer_order_sn' => 'FP123', 'merchant_id' => '1092768610',
            ], 200),
        ]);

        $result = FastPaymentService::createPayment([
            'order_sn' => 'FP123', 'user_name' => 'testuser', 'provider' => 'cashapp',
            'amount' => 4.99, 'notify_url' => 'https://example.com/webhook',
        ]);

        $this->assertTrue($result['success']);
        $this->assertSame('https://cash.app/$88888888', $result['body']['pay_url']);

        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), '/api/payment/pay')
                && $data['merchant_id'] === '1092768610'
                && $data['order_sn'] === 'FP123'
                && $data['is_cash'] === '1'
                && $data['is_pay'] === '1' // cashapp
                && $data['amount'] === '4.99'
                && $data['sign'] === FastPaymentService::sign($data, self::KEY);
        });
    }

    public function test_create_payment_fails_cleanly_when_not_configured(): void
    {
        Http::fake();

        $result = FastPaymentService::createPayment([
            'order_sn' => 'FP1', 'user_name' => 'x', 'provider' => 'applepay',
            'amount' => 4.99, 'notify_url' => 'https://example.com/webhook',
        ]);

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('not configured', $result['error']);
        Http::assertNothingSent();
    }

    public function test_create_payment_surfaces_the_gateways_own_failure_message(): void
    {
        $this->configure();
        Http::fake(['*/api/payment/pay' => Http::response(['status' => '10001', 'msg' => 'Insufficient merchant balance'], 200)]);

        $result = FastPaymentService::createPayment([
            'order_sn' => 'FP1', 'user_name' => 'x', 'provider' => 'googlepay',
            'amount' => 4.99, 'notify_url' => 'https://example.com/webhook',
        ]);

        $this->assertFalse($result['success']);
        $this->assertSame('Insufficient merchant balance', $result['error']);
    }
}
