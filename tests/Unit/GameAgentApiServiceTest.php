<?php

namespace Tests\Unit;

use App\Exceptions\GameAgentApiException;
use App\Services\GameAgentApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GameAgentApiServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.game_agent.base_url', 'http://example-game-agent.com');
        Config::set('services.game_agent.agent_id', '11');
        Config::set('services.game_agent.secret_key', 'secret123key');
    }

    public function test_add_user_success(): void
    {
        Http::fake([
            '*api/external/addUser*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'account_name' => 'Test_user',
                    'user_id' => '88886468',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::addUser('Test_user', '123123');

        $this::assertEquals('Test_user', $data['account_name']);
        $this::assertEquals('88886468', $data['user_id']);

        Http::assertSent(function ($request) {
            return $request->url() === 'http://example-game-agent.com/api/external/addUser';
        });
    }

    public function test_recharge_success(): void
    {
        Http::fake([
            '*api/external/recharge*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'agent_balance' => '36390057',
                    'amount' => '5',
                    'pay_order_id' => 'pay:11:100001',
                    'transaction_id' => 'pay:11:100001',
                    'transaction_time' => '1709798588',
                    'user_balance' => '150000',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::recharge('88880188', '5', '100001');

        $this::assertEquals('36390057', $data['agent_balance']);
        $this::assertEquals('150000', $data['user_balance']);
    }

    public function test_withdraw_success(): void
    {
        Http::fake([
            '*api/external/withdraw*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'agent_balance' => '36440057',
                    'amount' => '5',
                    'transaction_id' => 'wdw:11:100002',
                    'transaction_time' => '1709798910',
                    'user_balance' => '100000',
                    'wdw_order_id' => 'wdw:11:100002',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::withdraw('88880188', '5', '100002');

        $this::assertEquals('36440057', $data['agent_balance']);
        $this::assertEquals('wdw:11:100002', $data['wdw_order_id']);
    }

    public function test_get_user_balance_success(): void
    {
        Http::fake([
            '*api/external/userBalance*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'user_balance' => '60',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::getUserBalance('88880212');

        $this::assertEquals('60', $data['user_balance']);
    }

    public function test_get_agent_balance_success(): void
    {
        Http::fake([
            '*api/external/agentBalance*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'agent_balance' => '3649.0057',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::getAgentBalance();

        $this::assertEquals('3649.0057', $data['agent_balance']);
    }

    public function test_get_user_id_success(): void
    {
        Http::fake([
            '*api/external/getUserID*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'user_id' => '88880212',
                ],
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::getUserId('user020301');

        $this::assertEquals('88880212', $data['user_id']);
    }

    public function test_get_low_deposit_users_success(): void
    {
        Http::fake([
            '*api/external/external/getLowDepositUsers*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    [
                        'account_name' => 'user011110',
                        'agent_id' => 11,
                        'day_recharge' => 10,
                        'user_balance' => 10,
                        'user_id' => 88880188,
                    ],
                ],
                'count' => 1,
            ], 200),
        ]);

        $data = GameAgentApiService::getLowDepositUsers('2024-03-07', 1, 20);

        $this::assertCount(1, $data);
        $this::assertEquals('user011110', $data[0]['account_name']);
    }

    public function test_reset_password_success(): void
    {
        Http::fake([
            '*api/external/resetPassword*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => null,
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::resetPassword('88880212', '123123');

        $this::assertIsArray($data);
    }

    public function test_force_player_offline_success(): void
    {
        Http::fake([
            '*api/external/playerOffline*' => Http::response([
                'code' => 0,
                'msg' => 'Success',
                'data' => null,
                'count' => 0,
            ], 200),
        ]);

        $data = GameAgentApiService::forcePlayerOffline('88880212');

        $this::assertIsArray($data);
    }

    public function test_signs_requests_per_the_real_api_docs(): void
    {
        // Global Parameters (§1.1): timestamp is a 10-digit second epoch,
        // token is a 32-character *lowercase* MD5 hex string. Getting
        // either wrong makes the provider reject every request as an
        // "Invalid token" (status code 3) even with the correct secret.
        Http::fake([
            '*api/external/addUser*' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        GameAgentApiService::addUser('Test_user', '123123');

        Http::assertSent(function ($request) {
            // Multipart bodies aren't array-accessible on the Request
            // object — pull the field values out of the raw body instead.
            // (Each part has a "Content-Length" header line before the
            // blank-line/value, so skip past it non-greedily.)
            $body = $request->body();
            preg_match('/name="timestamp".*?\r?\n\r?\n(\d+)/s', $body, $tsMatch);
            preg_match('/name="token".*?\r?\n\r?\n([a-f0-9A-F]+)/s', $body, $tokenMatch);
            $timestamp = $tsMatch[1] ?? null;
            $token = $tokenMatch[1] ?? null;

            $this->assertNotNull($timestamp, 'timestamp field must be present in the request body');
            $this->assertNotNull($token, 'token field must be present in the request body');
            $this->assertMatchesRegularExpression('/^\d{10}$/', $timestamp, 'timestamp must be a 10-digit second epoch');
            $this->assertSame(strtolower($token), $token, 'token must be lowercase');
            $this->assertMatchesRegularExpression('/^[a-f0-9]{32}$/', $token, 'token must be a 32-char lowercase hex MD5');
            $this->assertSame(md5("11:{$timestamp}:secret123key"), $token, 'token must be md5(agent_id:timestamp:secret_key)');

            return true;
        });
    }

    public function test_error_code_throws_game_agent_api_exception(): void
    {
        Http::fake([
            '*api/external/addUser*' => Http::response([
                'code' => 20,
                'msg' => 'Account name already exists',
            ], 200),
        ]);

        $this->expectException(GameAgentApiException::class);
        $this->expectExceptionMessage('Game Agent API error [20]: Account name already exists');

        GameAgentApiService::addUser('Test_user', '123123');
    }
}
