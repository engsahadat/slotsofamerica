<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Financial Transaction Safety audit: /api/external/recharge and /api/external/withdraw
 * (the legacy game-agent-panel callback API — a different integration from Recharge/Redeem/
 * FAST Deposit, but the exact same failure class applies) had no idempotency guard on
 * order_id, so a retried callback would credit/debit the wallet a second time.
 */
class ExternalApiIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private function configure(): void
    {
        SiteSetting::create([
            'game_agent_id' => '10045',
            'game_agent_secret_key' => 'secret_key_12345',
        ]);
    }

    private function signedParams(array $params): array
    {
        $agentId = '10045';
        $timestamp = (string) time();
        $token = strtoupper(md5("{$agentId}:{$timestamp}:secret_key_12345"));

        return array_merge($params, ['agent_id' => $agentId, 'timestamp' => $timestamp, 'token' => $token]);
    }

    public function test_a_retried_recharge_callback_with_the_same_order_id_never_credits_twice(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 0]);

        $params = $this->signedParams(['user_id' => (string) $user->id, 'amount' => '25', 'order_id' => 'ORDER1']);

        $this->postJson('/api/external/recharge', $params)->assertStatus(200)->assertJsonPath('code', 0);
        $this->postJson('/api/external/recharge', $params)->assertStatus(200)->assertJsonPath('code', 0);
        $this->postJson('/api/external/recharge', $params)->assertStatus(200)->assertJsonPath('code', 0);

        $this->assertSame(25.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_a_retried_withdraw_callback_with_the_same_order_id_never_debits_twice(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 100]);

        $params = $this->signedParams(['user_id' => (string) $user->id, 'amount' => '30', 'order_id' => 'ORDER2']);

        $this->postJson('/api/external/withdraw', $params)->assertStatus(200)->assertJsonPath('code', 0);
        $this->postJson('/api/external/withdraw', $params)->assertStatus(200)->assertJsonPath('code', 0);

        $this->assertSame(70.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_withdraw_never_takes_balance_negative(): void
    {
        $this->configure();
        $user = User::factory()->create(['balance' => 10]);

        $params = $this->signedParams(['user_id' => (string) $user->id, 'amount' => '50', 'order_id' => 'ORDER3']);

        $res = $this->postJson('/api/external/withdraw', $params);
        $res->assertStatus(200)->assertJsonPath('code', 7);
        $this->assertSame(10.0, (float) $user->fresh()->balance);
        $this->assertDatabaseCount('transactions', 0);
    }
}
