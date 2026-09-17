<?php

namespace Tests\Unit;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\Protocols\OrionStarsAgentProtocol;
use App\Services\OrionStarsApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Regression: the Game API Providers module previously had no protocol that
 * spoke the real Orion Stars OS Terminal API v1.2 (agentLogin -> rotating
 * agentKey -> md5-signed calls) — only "external_signed" and "agent_login",
 * neither of which matches its spec, so any admin who put Orion Stars
 * credentials into a Game API Providers entry got "Invalid request
 * parameters" regardless of protocol chosen.
 */
class OrionStarsAgentProtocolTest extends TestCase
{
    use RefreshDatabase;

    private function provider(): GameApiProvider
    {
        return GameApiProvider::create([
            'name' => 'orionstars_main',
            'protocol' => 'orion_stars_signed',
            'display_name' => 'Orion Stars',
            'base_url' => 'https://orionstars.vip:8033',
            'agent_username' => 'Mcashier01',
            'is_active' => true,
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        OrionStarsApiService::clearAgentKey('Mcashier01');
    }

    public function test_test_connection_logs_in_and_reports_success(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY1', 'Balance' => 5000], 200),
        ]);

        $result = (new OrionStarsAgentProtocol())->testConnection($this->provider(), 'Fireron2026#$');

        $this->assertTrue($result['success']);
        $this->assertSame('KEY1', $result['data']['agent_key']);
        $this->assertSame(5000, $result['data']['balance']);
    }

    public function test_test_connection_surfaces_the_providers_own_error_message(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 201, 'msg' => 'Session timeout.'], 200),
        ]);

        $result = (new OrionStarsAgentProtocol())->testConnection($this->provider(), 'wrongpass');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('Session timeout.', $result['error']);
    }

    public function test_create_player_logs_in_then_registers_with_the_fresh_agent_key(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY1'], 200),
            '*ws/service.ashx?action=registerUser*' => Http::response(['code' => 200], 200),
        ]);

        $result = (new OrionStarsAgentProtocol())->createPlayer($this->provider(), 'Fireron2026#$', [
            'username' => 'player001', 'password' => 'PlayerPass1',
        ]);

        $this->assertTrue($result['success']);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'action=registerUser')
                && $request->data()['account'] === 'player001'
                && $request->data()['agentName'] === 'Mcashier01';
        });
    }

    public function test_find_player_id_by_username_is_a_local_pass_through_with_no_http_call(): void
    {
        Http::fake(); // any real call would be an unregistered fake and throw

        $result = (new OrionStarsAgentProtocol())->findPlayerIdByUsername($this->provider(), 'Fireron2026#$', 'player001');

        $this->assertTrue($result['success']);
        $this->assertSame('player001', $result['data']['id']);
        Http::assertNothingSent();
    }

    public function test_get_score_reports_the_real_api_limitation_instead_of_guessing(): void
    {
        $result = (new OrionStarsAgentProtocol())->getScore($this->provider(), 'Fireron2026#$', 'player001');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString("player's own password", $result['error']);
    }

    public function test_recharge_rounds_the_amount_and_signs_with_a_fresh_agent_key(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY1'], 200),
            '*ws/service.ashx?action=recharge*' => Http::response(['code' => 200], 200),
        ]);

        $result = (new OrionStarsAgentProtocol())->recharge($this->provider(), 'Fireron2026#$', [
            'id' => 'player001', 'balance' => 25.75, 'remark' => 'transfer:9',
        ]);

        $this->assertTrue($result['success']);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'action=recharge') && (int) $request->data()['amount'] === 26;
        });
    }

    public function test_withdraw_calls_redeem(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY1'], 200),
            '*ws/service.ashx?action=redeem*' => Http::response(['code' => 200], 200),
        ]);

        $result = (new OrionStarsAgentProtocol())->withdraw($this->provider(), 'Fireron2026#$', [
            'id' => 'player001', 'balance' => 10.0, 'remark' => 'redeem:9',
        ]);

        $this->assertTrue($result['success']);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'action=redeem'));
    }
}
