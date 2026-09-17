<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\FastPaymentService;
use App\Services\GoHighLevelService;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Failure & Recovery Handling: a transient network blip talking to an external API must never
 * be blindly retried for a financial (money-moving) operation — because we can't tell "the
 * request never arrived" apart from "it arrived, was applied, and only the response was lost".
 * Read-only/idempotent operations (a status query, a create-or-update contact sync) ARE safe
 * to retry a couple of times.
 */
class FailureRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return JwtAuthService::generateToken($admin);
    }

    public function test_a_recharge_call_that_hits_a_connection_blip_is_never_retried(): void
    {
        $user = User::factory()->create(['balance' => 100, 'username' => 'blipuser']);
        $game = Game::create(['name' => 'Blip Recharge Game', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'blipuser',
            'email' => 'b@example.com', 'status' => 'approved',
        ]);
        $provider = GameApiProvider::create([
            'name' => 'blipprovider', 'display_name' => 'Blip Provider',
            'base_url' => 'https://agentserver.blipprovider.com',
            'agent_username' => 'agent1', 'is_active' => true, 'automate_deposit' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $adminToken = $this->adminToken();
        $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        $rechargeCalls = 0;
        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'blipuser', 'id' => 1]]]], 200),
            '*/api/player/playerRecharge' => function () use (&$rechargeCalls) {
                $rechargeCalls++;
                throw new ConnectionException('Simulated network blip while reading the response');
            },
        ]);

        $userToken = JwtAuthService::generateToken($user);
        $res = $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 25]);

        // Fails safe — refunded, never silently retried against the provider.
        $res->assertStatus(422);
        $this->assertSame(100.0, (float) $user->fresh()->balance);
        $this->assertSame(1, $rechargeCalls, 'the recharge endpoint must be hit exactly once, never retried');
    }

    /** Same guarantee as the recharge test above, for the redeem (withdraw) direction. */
    public function test_a_redeem_call_that_hits_a_connection_blip_is_never_retried(): void
    {
        $user = User::factory()->create(['balance' => 5, 'username' => 'blipredeem']);
        $game = Game::create(['name' => 'Blip Redeem Game', 'is_active' => true]);
        GameUnlockRequest::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'username' => 'blipredeem',
            'email' => 'br@example.com', 'status' => 'approved',
        ]);
        $provider = GameApiProvider::create([
            'name' => 'blipredeemprovider', 'display_name' => 'Blip Redeem Provider',
            'base_url' => 'https://agentserver.blipredeemprovider.com',
            'agent_username' => 'agent1', 'is_active' => true, 'automate_withdraw' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);
        $adminToken = $this->adminToken();
        $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        $withdrawCalls = 0;
        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'tok']], 200),
            '*/api/player/playerList*' => Http::response(['code' => 0, 'data' => ['list' => [['Account' => 'blipredeem', 'id' => 1]]]], 200),
            '*/api/player/playerWithdraw' => function () use (&$withdrawCalls) {
                $withdrawCalls++;
                throw new ConnectionException('Simulated network blip while reading the response');
            },
        ]);

        $userToken = JwtAuthService::generateToken($user);
        $res = $this->withHeader('Authorization', 'Bearer ' . $userToken)
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 45]);

        // Fails safe — nothing was ever credited, and the provider is never hit twice.
        $res->assertStatus(422);
        $this->assertSame(5.0, (float) $user->fresh()->balance);
        $this->assertSame(1, $withdrawCalls, 'the withdraw endpoint must be hit exactly once, never retried');
    }

    public function test_fast_payment_query_retries_on_a_connection_blip_but_create_payment_does_not(): void
    {
        SiteSetting::create([
            'fast_payment_base_url' => 'https://mh.dollarpaywallet.com',
            'fast_payment_merchant_id' => '1092768610',
            'fast_payment_key' => 'f84019c271fa2020bba9141c7d8ee20e',
        ]);

        // query_payment: first call throws a connection blip, second call succeeds — retry
        // should recover automatically.
        $queryCalls = 0;
        Http::fake([
            '*/api/payment/query' => function () use (&$queryCalls) {
                $queryCalls++;
                if ($queryCalls === 1) {
                    throw new ConnectionException('Simulated blip');
                }

                return Http::response(['status' => '00000', 'msg' => 'ok', 'pay_status' => '1'], 200);
            },
        ]);

        $result = FastPaymentService::queryPayment('SOMEORDER1');
        $this->assertTrue($result['success']);
        $this->assertSame(2, $queryCalls, 'query_payment should retry once after the blip and then succeed');

        // create_payment: same blip, but this call must NEVER be retried.
        $payCalls = 0;
        Http::fake([
            '*/api/payment/pay' => function () use (&$payCalls) {
                $payCalls++;
                throw new ConnectionException('Simulated blip');
            },
        ]);

        $result = FastPaymentService::createPayment([
            'order_sn' => 'SOMEORDER2', 'user_name' => 'x', 'provider' => 'cashapp',
            'amount' => 4.99, 'notify_url' => 'https://example.com/webhook',
        ]);
        $this->assertFalse($result['success']);
        $this->assertSame(1, $payCalls, 'create_payment must never be retried after a connection blip');
    }

    public function test_ghl_sync_retries_on_a_connection_blip_and_still_self_heals_a_stale_contact_id(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-fake', 'ghl_location_id' => 'LOC1']);
        $user = User::factory()->create(['name' => 'Retry Test User']);
        $user->ghl_contact_id = 'stale_id';
        $user->save();

        $updateCalls = 0;
        Http::fake([
            '*/contacts/stale_id' => function () use (&$updateCalls) {
                $updateCalls++;
                if ($updateCalls === 1) {
                    throw new ConnectionException('Simulated blip');
                }

                return Http::response(['message' => 'not found'], 404);
            },
            '*/contacts/upsert' => Http::response(['contact' => ['id' => 'fresh_id']], 200),
        ]);

        $result = GoHighLevelService::syncUser($user);

        $this->assertTrue($result['success']);
        $this->assertSame('fresh_id', $result['contact_id']);
        // Confirms the update call really did retry past the blip (2 calls) rather than
        // silently failing straight to a generic error.
        $this->assertSame(2, $updateCalls);
    }
}
