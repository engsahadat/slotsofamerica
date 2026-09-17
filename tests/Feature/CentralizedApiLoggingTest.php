<?php

namespace Tests\Feature;

use App\Models\FastPaymentTransaction;
use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\GhlApiLog;
use App\Models\Game;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\FastPaymentApiLog;
use App\Models\User;
use App\Services\FastPaymentService;
use App\Services\GoHighLevelService;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * API Logging: game_api_logs, ghl_api_logs, and fast_payment_api_logs must each carry
 * provider / operation / internal user id / internal transaction id / provider reference /
 * HTTP status / success / response time / timestamp — and must NEVER carry passwords, secrets,
 * access tokens, or (for FAST) sensitive payment fields, sanitized or not.
 */
class CentralizedApiLoggingTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return JwtAuthService::generateToken($admin);
    }

    /**
     * Regression: Orion Stars' own login response literally contains a field named "agentKey"
     * (a rotating session credential, functionally an access token) — found during this exact
     * audit. It must never reach game_api_logs unredacted.
     */
    public function test_game_provider_health_check_logs_full_context_and_redacts_the_rotating_agent_key(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'SUPER-SECRET-ROTATING-KEY', 'Balance' => 100], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'loggingorion', 'protocol' => 'orion_stars_signed', 'display_name' => 'Logging Orion Test',
            'base_url' => 'https://orionstars.vip:8033', 'agent_username' => 'agent1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'agentsecretpw']);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test")
            ->assertStatus(200);

        $log = GameApiLog::where('provider_id', $provider->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame($provider->name, $log->provider_name);
        $this->assertSame('agent_login', $log->action);
        $this->assertNotNull($log->http_status);
        $this->assertTrue($log->success);
        $this->assertNotNull($log->duration_ms);
        $this->assertNotNull($log->created_at);

        $raw = json_encode($log->response_payload);
        $this->assertStringNotContainsString('SUPER-SECRET-ROTATING-KEY', $raw);
        $this->assertSame('[REDACTED]', $log->response_payload['agentKey']);
    }

    public function test_game_provider_recharge_logs_the_provider_reference_user_and_transaction_and_redacts_the_agent_password(): void
    {
        $user = User::factory()->create(['balance' => 100, 'username' => 'loggeduser']);
        $game = Game::create(['name' => 'Logging Recharge Game', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'loggeduser',
            'email' => 'l@example.com', 'status' => 'approved',
        ]);

        $provider = GameApiProvider::create([
            'name' => 'loggingrecharge', 'display_name' => 'Logging Recharge Provider',
            'base_url' => 'https://agentserver.loggingrecharge.com',
            'agent_username' => 'agent1', 'is_active' => true, 'automate_deposit' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $token = $this->adminToken();
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'the-agent-password']);

        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'loggeduser', 'id' => 9]]]], 200),
            '*/api/player/playerRecharge' => Http::response(['code' => 0, 'data' => []], 200),
        ]);

        $userToken = JwtAuthService::generateToken($user);
        $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 20])
            ->assertStatus(201);

        $rechargeLog = GameApiLog::where('provider_id', $provider->id)->where('action', 'recharge')->first();
        $this->assertNotNull($rechargeLog);
        $this->assertSame($user->id, $rechargeLog->related_user_id);
        $this->assertNotNull($rechargeLog->related_transaction_id);
        // No separator (e.g. ":") — some real providers (gameroom777) reject a remark
        // containing anything but letters and numbers.
        $this->assertSame('recharge' . $rechargeLog->related_transaction_id, $rechargeLog->provider_reference);
        $this->assertTrue($rechargeLog->success);

        // The agent's own login password is never sent as part of these calls' payloads, but
        // confirm nothing across every logged call for this provider leaked it anyway.
        $allPayloads = GameApiLog::where('provider_id', $provider->id)->get()
            ->map(fn ($l) => json_encode([$l->request_payload, $l->response_payload]))
            ->implode(' ');
        $this->assertStringNotContainsString('the-agent-password', $allPayloads);
    }

    public function test_ghl_sync_logs_provider_user_and_contact_reference(): void
    {
        SiteSetting::create([
            'ghl_api_key' => 'pit-fake-token-value',
            'ghl_location_id' => 'LOC123',
        ]);

        Http::fake([
            '*/contacts/upsert' => Http::response(['contact' => ['id' => 'ghl-contact-999']], 200),
        ]);

        $user = User::factory()->create(['name' => 'Logging Ghl User', 'email' => 'ghl@example.com']);

        GoHighLevelService::syncUser($user);

        $log = GhlApiLog::where('user_id', $user->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('GoHighLevel', $log->provider);
        $this->assertSame('ghl-contact-999', $log->provider_reference);
        $this->assertTrue($log->success);
        $this->assertNotNull($log->http_status);
        $this->assertNotNull($log->duration_ms);

        // The actual PIT token is sent as an Authorization header, never as part of the request
        // body — confirm it never ends up in the logged payload regardless.
        $raw = json_encode([$log->request_payload, $log->response_payload]);
        $this->assertStringNotContainsString('pit-fake-token-value', $raw);
    }

    public function test_fast_payment_create_payment_logs_provider_user_reference_and_http_status_and_never_logs_the_merchant_key(): void
    {
        $key = 'f84019c271fa2020bba9141c7d8ee20e';
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1096978174',
            'fast_payment_key' => $key,
        ]);

        Http::fake(['*/api/payment/pay' => Http::response([
            'status' => '00000', 'msg' => 'ok', 'pay_url' => 'https://cash.app/$test',
            'amount' => '4.99', 'outer_order_sn' => 'LOGORDER1', 'merchant_id' => '1096978174',
        ], 200)]);

        $user = User::factory()->create();

        FastPaymentService::createPayment([
            'order_sn' => 'LOGORDER1', 'user_name' => $user->username ?? 'x', 'provider' => 'cashapp',
            'amount' => 4.99, 'notify_url' => 'https://example.com/webhook', 'user_id' => $user->id,
        ]);

        $log = FastPaymentApiLog::where('user_id', $user->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('FAST Payment', $log->provider);
        $this->assertSame('LOGORDER1', $log->provider_reference);
        $this->assertSame(200, $log->http_status);
        $this->assertTrue($log->success);
        $this->assertNotNull($log->duration_ms);

        $raw = json_encode([$log->request_payload, $log->response_payload]);
        $this->assertStringNotContainsString($key, $raw);
    }

    public function test_fast_payment_webhook_logs_provider_user_and_reference(): void
    {
        $key = 'f84019c271fa2020bba9141c7d8ee20e';
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1096978174',
            'fast_payment_key' => $key,
        ]);
        $user = User::factory()->create(['balance' => 0]);
        $transaction = Transaction::create(['user_id' => $user->id, 'type' => 'deposit', 'amount' => 4.99, 'status' => 'pending']);
        FastPaymentTransaction::create([
            'transaction_id' => $transaction->id, 'user_id' => $user->id, 'order_sn' => 'LOGWEBHOOK1',
            'provider' => 'cashapp', 'requested_amount' => 4.99, 'payment_status' => 'pending',
        ]);

        $payload = ['merchant_id' => '1096978174', 'transaction_id' => 'PLATFORM_LOG', 'outer_order_sn' => 'LOGWEBHOOK1', 'pay_status' => '1', 'amount' => '4.99'];
        $payload['sign'] = FastPaymentService::sign($payload, $key);

        $this->postJson('/api/webhooks/fast-payment', $payload)->assertStatus(200);

        $log = FastPaymentApiLog::where('user_id', $user->id)->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('FAST Payment', $log->provider);
        $this->assertSame('PLATFORM_LOG', $log->provider_reference);
        $this->assertTrue($log->success);
    }
}
