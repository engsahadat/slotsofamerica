<?php

namespace Tests\Unit;

use App\Exceptions\OrionStarsApiException;
use App\Services\OrionStarsApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OrionStarsApiServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.orion_stars.base_url', 'https://orionstars.vip:8033');
        Config::set('services.orion_stars.agent_name', 'agent01');
        Config::set('services.orion_stars.agent_password', 'e10adc3949ba59abbe56e057f20f883e');

        OrionStarsApiService::clearAgentKey('agent01');
    }

    public function test_agent_login_success(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response([
                'code' => 200,
                'agentKey' => 'KEY_ABC_123',
                'Balance' => 5000,
            ], 200),
        ]);

        $res = OrionStarsApiService::agentLogin('agent01', 'e10adc3949ba59abbe56e057f20f883e');

        $this::assertEquals(200, $res['code']);
        $this::assertEquals('KEY_ABC_123', $res['agentKey']);
        $this::assertEquals(5000, $res['Balance']);
        $this::assertEquals('KEY_ABC_123', Cache::get('orion_stars_agent_key_agent01'));
    }

    public function test_agent_login_failure_throws_exception(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response([
                'code' => 201,
                'msg' => 'Invalid password',
            ], 200),
        ]);

        $this->expectException(OrionStarsApiException::class);
        $this->expectExceptionMessage('Orion Stars API error [201]: Invalid password');

        OrionStarsApiService::agentLogin('agent01', 'wrongpassword');
    }

    public function test_register_user_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=registerUser*' => Http::response([
                'code' => 200,
            ], 200),
        ]);

        $res = OrionStarsApiService::registerUser('player01', 'password123', 'agent01');

        $this::assertEquals(200, $res['code']);

        Http::assertSent(function ($request) {
            $data = $request->data();
            return $data['account'] === 'player01'
                && $data['agentName'] === 'agent01'
                && isset($data['sign']);
        });
    }

    public function test_query_info_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=queryInfo*' => Http::response([
                'code' => 200,
                'agentBalance' => 5000,
                'gameId' => 1001,
                'userbalance' => 250,
                'webLoginUrl' => 'http://play.orionstars.vip/?token=xyz',
            ], 200),
        ]);

        $res = OrionStarsApiService::queryInfo('player01', 'password123', 'agent01');

        $this::assertEquals(200, $res['code']);
        $this::assertEquals(5000, $res['agentBalance']);
        $this::assertEquals(1001, $res['gameId']);
        $this::assertEquals(250, $res['userbalance']);
        $this::assertEquals('http://play.orionstars.vip/?token=xyz', $res['webLoginUrl']);
    }

    public function test_change_passwd_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=changePasswd*' => Http::response([
                'code' => 200,
            ], 200),
        ]);

        $res = OrionStarsApiService::changePasswd('player01', 'oldpass', 'newpass', 'agent01');

        $this::assertEquals(200, $res['code']);

        Http::assertSent(function ($request) {
            $data = $request->data();
            return $data['account'] === 'player01'
                && $data['passwd'] === md5('oldpass')
                && $data['passwdNew'] === md5('newpass');
        });
    }

    public function test_recharge_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=recharge*' => Http::response([
                'code' => 200,
            ], 200),
        ]);

        $res = OrionStarsApiService::recharge('player01', 100, 'agent01');

        $this::assertEquals(200, $res['code']);

        Http::assertSent(function ($request) {
            $data = $request->data();
            return $data['account'] === 'player01' && (int) $data['amount'] === 100;
        });
    }

    public function test_redeem_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=redeem*' => Http::response([
                'code' => 200,
            ], 200),
        ]);

        $res = OrionStarsApiService::redeem('player01', 50, 'agent01');

        $this::assertEquals(200, $res['code']);

        Http::assertSent(function ($request) {
            $data = $request->data();
            return $data['account'] === 'player01' && (int) $data['amount'] === 50;
        });
    }

    public function test_get_download_code_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=getDownloadCode*' => Http::response([
                'code' => 200,
                'downloadCode' => 'DL987654',
            ], 200),
        ]);

        $res = OrionStarsApiService::getDownloadCode('agent01');

        $this::assertEquals(200, $res['code']);
        $this::assertEquals('DL987654', $res['downloadCode']);
    }

    public function test_get_trade_record_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=getTradeRecord*' => Http::response([
                'code' => 200,
                'data' => [
                    [
                        'account' => 'player01',
                        'gameId' => 100131,
                        'balanceBefore' => 100.00,
                        'score' => 50.00,
                        'insertTime' => '2023/5/4 11:51:09',
                    ],
                ],
            ], 200),
        ]);

        $res = OrionStarsApiService::getTradeRecord('player01', '2023-04-01 00:00:00', '2023-05-01 00:00:00', 'agent01');

        $this::assertEquals(200, $res['code']);
        $this::assertCount(1, $res['data']);
        $this::assertEquals(50.00, $res['data'][0]['score']);
    }

    public function test_get_jp_record_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=getJpRecord*' => Http::response([
                'code' => 200,
                'data' => [
                    [
                        'account' => 'player01',
                        'gameId' => 100283,
                        'type' => 'Mini',
                        'score' => 26.13,
                        'insertTime' => '2023/5/4 9:31:02',
                    ],
                ],
            ], 200),
        ]);

        $res = OrionStarsApiService::getJpRecord('player01', '2023-04-01 00:00:00', '2023-05-01 00:00:00', 'agent01');

        $this::assertEquals(200, $res['code']);
        $this::assertEquals('Mini', $res['data'][0]['type']);
    }

    public function test_get_game_record_success(): void
    {
        OrionStarsApiService::cacheAgentKey('agent01', 'KEY_ABC_123');

        Http::fake([
            '*ws/service.ashx?action=getGameRecord*' => Http::response([
                'code' => 200,
                'data' => [
                    [
                        'account' => 'player01',
                        'gameId' => 100567,
                        'balanceBefore' => 100.00,
                        'totalPlayed' => 10.00,
                        'totalWin' => 25.00,
                        'balanceNow' => 115.00,
                        'reason' => 'Exit Game',
                        'insertTime' => '2023/5/4 12:21:58',
                    ],
                ],
            ], 200),
        ]);

        $res = OrionStarsApiService::getGameRecord('player01', 'agent01');

        $this::assertEquals(200, $res['code']);
        $this::assertEquals('Exit Game', $res['data'][0]['reason']);
    }

    public function test_sign_generation_formula(): void
    {
        $agentName = 'Agent01';
        $time = '1598452539';
        $agentKey = '7B35F60DB33DCFD237FDB48CB5DE97C5';

        $expectedSign = md5(strtolower($agentName) . $time . strtolower($agentKey));
        $generatedSign = OrionStarsApiService::generateSign($agentName, $time, $agentKey);

        $this::assertEquals($expectedSign, $generatedSign);
        $this::assertEquals(strtolower($expectedSign), $generatedSign);
    }

    public function test_password_formatting(): void
    {
        $rawPass = 'secret123';
        $md5Pass = md5('secret123');

        $this::assertEquals($md5Pass, OrionStarsApiService::formatPassword($rawPass));
        $this::assertEquals(strtolower($md5Pass), OrionStarsApiService::formatPassword($md5Pass));
        $this::assertEquals(strtolower($md5Pass), OrionStarsApiService::formatPassword(strtoupper($md5Pass)));
    }

    public function test_account_length_validation(): void
    {
        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Account length must be between 6 and 32 characters.');

        OrionStarsApiService::registerUser('usr', 'password123', 'agent01', 'KEY123');
    }
}
