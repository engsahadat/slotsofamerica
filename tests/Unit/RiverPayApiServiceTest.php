<?php

namespace Tests\Unit;

use App\Exceptions\RiverPayApiException;
use App\Services\RiverPayApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RiverPayApiServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.river_pay.base_url', 'http://river-pay.com');
        Config::set('services.river_pay.login', 'agent_river');
        Config::set('services.river_pay.password', 'secret_river_123');
    }

    public function test_create_account_success(): void
    {
        Http::fake([
            '*api/create*' => Http::response([
                'STATUS' => 0,
                'data' => [
                    'code' => '00-00-00-00-00-01',
                ],
            ], 200),
        ]);

        $data = RiverPayApiService::createAccount('100.00', 1);

        $this::assertEquals('00-00-00-00-00-01', $data['code']);

        Http::assertSent(function ($request) {
            $data = $request->data();
            return $data['login'] === 'agent_river'
                && $data['password'] === 'secret_river_123'
                && $data['amount'] === '100.00'
                && (int) $data['bounceback'] === 1;
        });
    }

    public function test_deposit_success(): void
    {
        Http::fake([
            '*api/deposit*' => Http::response([
                'STATUS' => 0,
                'data' => [
                    'code' => '00-00-00-00-00-01',
                    'balance' => '105.00',
                ],
            ], 200),
        ]);

        $data = RiverPayApiService::deposit('00-00-00-00-00-01', '5.00', 0);

        $this::assertEquals('00-00-00-00-00-01', $data['code']);
        $this::assertEquals('105.00', $data['balance']);
    }

    public function test_withdrawal_success(): void
    {
        Http::fake([
            '*api/withdrawal*' => Http::response([
                'STATUS' => 0,
                'data' => [
                    'code' => '00-00-00-00-00-01',
                    'balance' => '5.00',
                ],
            ], 200),
        ]);

        $data = RiverPayApiService::withdrawal('00-00-00-00-00-01', '100.00');

        $this::assertEquals('00-00-00-00-00-01', $data['code']);
        $this::assertEquals('5.00', $data['balance']);
    }

    public function test_close_account_success(): void
    {
        Http::fake([
            '*api/close*' => Http::response([
                'STATUS' => 0,
                'data' => [
                    'code' => '00-00-00-00-00-01',
                ],
            ], 200),
        ]);

        $data = RiverPayApiService::closeAccount('00-00-00-00-00-01');

        $this::assertEquals('00-00-00-00-00-01', $data['code']);
    }

    public function test_get_balance_success(): void
    {
        Http::fake([
            '*api/balance*' => Http::response([
                'STATUS' => 0,
                'data' => [
                    'balance' => '100.00',
                ],
            ], 200),
        ]);

        $data = RiverPayApiService::getBalance('00-00-00-00-00-01');

        $this::assertEquals('100.00', $data['balance']);
    }

    public function test_error_status_throws_river_pay_api_exception(): void
    {
        Http::fake([
            '*api/balance*' => Http::response([
                'STATUS' => 1,
                'data' => [
                    'message' => 'Account 00-00-00-00-00-01 is already closed',
                ],
            ], 200),
        ]);

        $this->expectException(RiverPayApiException::class);
        $this->expectExceptionMessage('River Pay API error [STATUS: 1]: Account 00-00-00-00-00-01 is already closed');

        RiverPayApiService::getBalance('00-00-00-00-00-01');
    }
}
