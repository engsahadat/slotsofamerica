<?php

namespace Tests\Unit;

use App\Exceptions\FastApiException;
use App\Services\FastApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FastApiServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.fast_api.base_url', 'http://fastapi-test.com');
        Config::set('services.fast_api.appid', 'h63inikngg2qyoii');
        Config::set('services.fast_api.appsecret', 'secret123456');
        Config::set('services.fast_api.agent_account', 'agent_test');
        Config::set('services.fast_api.agent_password', 'Pass1234');

        Cache::forget('fast_api_app_id');
        Cache::forget('fast_api_app_secret');
    }

    public function test_signature_algorithm(): void
    {
        $data = [
            'appid' => 'h63inikngg2qyoii',
            'timestamp' => 1701401242061,
            'sign' => 'old_sign',
        ];
        $appSecret = 'mysecret';

        // Spec calculation:
        // params: appid=h63inikngg2qyoii, timestamp=1701401242061
        // ksort => appid=h63inikngg2qyoii, timestamp=1701401242061
        // str: "appid=h63inikngg2qyoii&timestamp=1701401242061mysecret"
        $expected = md5('appid=h63inikngg2qyoii&timestamp=1701401242061' . $appSecret);
        $actual = FastApiService::sign($data, $appSecret);

        $this::assertEquals($expected, $actual);
    }

    public function test_aes_decryption(): void
    {
        $agentPassword = 'PassWord123!';
        $secretToEncrypt = 'decrypted_app_secret_999';

        $key = md5(md5(strtolower($agentPassword)));
        $iv = random_bytes(16);
        $encryptedRaw = openssl_encrypt($secretToEncrypt, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        $encryptedBase64 = base64_encode($iv . $encryptedRaw);

        $decrypted = FastApiService::aesDecrypt($encryptedBase64, $agentPassword);

        $this::assertEquals($secretToEncrypt, $decrypted);
    }

    public function test_agent_login_success(): void
    {
        $agentPassword = 'PassWord123!';
        $secretToEncrypt = 'decrypted_app_secret_999';

        $key = md5(md5(strtolower($agentPassword)));
        $iv = random_bytes(16);
        $encryptedRaw = openssl_encrypt($secretToEncrypt, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        $encryptedBase64 = base64_encode($iv . $encryptedRaw);

        Http::fake([
            '*fast/agent/login*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'balance' => 10000,
                    'appid' => 'APP_ID_100',
                    'appsecret_encrypted' => $encryptedBase64,
                ],
            ], 200),
        ]);

        $data = FastApiService::agentLogin('agent_test', $agentPassword);

        $this::assertEquals(10000, $data['balance']);
        $this::assertEquals('APP_ID_100', $data['appid']);
        $this::assertEquals('decrypted_app_secret_999', $data['appsecret_decrypted']);
        $this::assertEquals('APP_ID_100', Cache::get('fast_api_app_id'));
        $this::assertEquals('decrypted_app_secret_999', Cache::get('fast_api_app_secret'));
    }

    public function test_create_user_success(): void
    {
        Http::fake([
            '*fast/user/create*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'full_account' => 'prefix_player123',
                ],
            ], 200),
        ]);

        $data = FastApiService::createUser('player123', 'Pass1234!');

        $this::assertEquals('prefix_player123', $data['full_account']);

        Http::assertSent(function ($request) {
            $d = $request->data();
            return $d['account'] === 'player123' && isset($d['sign']);
        });
    }

    /**
     * Regression: the spec requires requestid to be "up to 64 alphanumeric characters" —
     * Str::uuid() was being used, whose hyphens violate that format and could get every
     * call rejected as a Parameter Error by the real FastAPI server.
     */
    public function test_generated_requestid_is_alphanumeric_only(): void
    {
        Http::fake([
            '*fast/user/create*' => Http::response(['code' => 200, 'message' => 'Success', 'data' => ['full_account' => 'x']], 200),
        ]);

        FastApiService::createUser('player123', 'Pass1234!');

        Http::assertSent(function ($request) {
            $requestid = $request->data()['requestid'];
            return ctype_alnum($requestid) && strlen($requestid) <= 64;
        });
    }

    public function test_deposit_success(): void
    {
        Http::fake([
            '*fast/user/deposit*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'balance' => 1100.55,
                    'order_num' => 'ORD10001',
                    'requestid' => 'REQ123',
                    'time' => 1701401242061,
                ],
            ], 200),
        ]);

        $data = FastApiService::deposit('player123', '100.55');

        $this::assertEquals(1100.55, $data['balance']);
        $this::assertEquals('ORD10001', $data['order_num']);
    }

    public function test_withdrawal_success(): void
    {
        Http::fake([
            '*fast/user/withdrawal*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'balance' => 900.00,
                    'order_num' => 'ORD10002',
                ],
            ], 200),
        ]);

        $data = FastApiService::withdrawal('player123', '50.00');

        $this::assertEquals(900.00, $data['balance']);
        $this::assertEquals('ORD10002', $data['order_num']);
    }

    public function test_get_balance_success(): void
    {
        Http::fake([
            '*fast/user/balance*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'balance' => 900.00,
                ],
            ], 200),
        ]);

        $data = FastApiService::getBalance('player123');

        $this::assertEquals(900.00, $data['balance']);
    }

    public function test_get_balance_with_passwd_success(): void
    {
        Http::fake([
            '*fast/user/balanceWithPasswd*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'balance' => 900.00,
                ],
            ], 200),
        ]);

        $data = FastApiService::getBalanceWithPasswd('player123', 'Pass1234!');

        $this::assertEquals(900.00, $data['balance']);
    }

    public function test_update_passwd_success(): void
    {
        Http::fake([
            '*fast/user/updatePasswd*' => Http::response([
                'code' => 200,
                'message' => 'Success',
            ], 200),
        ]);

        $res = FastApiService::updatePasswd('player123', 'OldPass1', 'NewPass1');

        $this::assertEquals(200, $res['code']);
    }

    public function test_trade_list_success(): void
    {
        Http::fake([
            '*fast/user/tradeList*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'total' => 1,
                    'pages' => false,
                    'list' => [
                        [
                            'order_num' => 'ORD001',
                            'start_score' => 1000,
                            'score' => 100,
                            'time' => 1701401242061,
                        ],
                    ],
                ],
            ], 200),
        ]);

        $data = FastApiService::tradeList('player123', '2025-06-01', '2025-06-11');

        $this::assertEquals(1, $data['total']);
        $this::assertCount(1, $data['list']);
    }

    public function test_game_log_list_success(): void
    {
        Http::fake([
            '*fast/user/gameLogList*' => Http::response([
                'code' => 200,
                'message' => 'Success',
                'data' => [
                    'list' => [
                        [
                            'game_id' => 101,
                            'game_name' => 'Slots 777',
                            'start_score' => '100',
                            'end_score' => '120',
                            'pay' => '10',
                            'win' => '30',
                            'time' => 1701401242061,
                            'uniqleid' => 'LOG999',
                        ],
                    ],
                ],
            ], 200),
        ]);

        $data = FastApiService::gameLogList('player123');

        $this::assertCount(1, $data['list']);
        $this::assertEquals('Slots 777', $data['list'][0]['game_name']);
    }

    public function test_error_code_throws_fast_api_exception(): void
    {
        Http::fake([
            '*fast/user/create*' => Http::response([
                'code' => 12,
                'message' => 'User Already Exist',
            ], 200),
        ]);

        $this->expectException(FastApiException::class);
        $this->expectExceptionMessage('FastApi error [12]: User Already Exist');

        FastApiService::createUser('player123', 'Pass1234!');
    }
}
