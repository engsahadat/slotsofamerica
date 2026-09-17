<?php

namespace Tests\Unit;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\Protocols\RiverPaySimpleProtocol;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RiverPaySimpleProtocolTest extends TestCase
{
    use RefreshDatabase;

    private function provider(): GameApiProvider
    {
        return GameApiProvider::create([
            'name' => 'river_pay_test',
            'protocol' => 'river_pay_simple',
            'display_name' => 'River Pay',
            'base_url' => 'http://river-pay.example',
            'agent_username' => 'river_login',
            'is_active' => true,
        ]);
    }

    public function test_create_player_ignores_the_requested_username_and_returns_the_generated_code(): void
    {
        Http::fake([
            '*river-pay.example/api/create*' => Http::response(['STATUS' => 0, 'data' => ['code' => 'RP12345']], 200),
        ]);

        $result = (new RiverPaySimpleProtocol())->createPlayer($this->provider(), 'river_password', [
            'username' => 'ignoredname', 'password' => 'ignoredpass',
        ]);

        $this->assertTrue($result['success']);
        $this->assertSame('RP12345', $result['data']['code']);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'river-pay.example/api/create')
                && $request['login'] === 'river_login'
                && $request['password'] === 'river_password';
        });
    }

    public function test_find_player_id_by_username_is_a_local_pass_through_with_no_http_call(): void
    {
        Http::fake();

        $result = (new RiverPaySimpleProtocol())->findPlayerIdByUsername($this->provider(), 'river_password', 'RP12345');

        $this->assertTrue($result['success']);
        $this->assertSame('RP12345', $result['data']['id']);
        Http::assertNothingSent();
    }

    public function test_recharge_calls_deposit_with_the_provider_specific_base_url(): void
    {
        Http::fake([
            '*river-pay.example/api/deposit*' => Http::response(['STATUS' => 0, 'data' => ['balance' => 105]], 200),
        ]);

        $result = (new RiverPaySimpleProtocol())->recharge($this->provider(), 'river_password', [
            'id' => 'RP12345', 'balance' => 5.0, 'remark' => 'transfer:1',
        ]);

        $this->assertTrue($result['success']);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'river-pay.example/api/deposit'));
    }

    public function test_a_business_error_response_is_reported_as_a_labelled_failure(): void
    {
        Http::fake([
            '*river-pay.example/api/balance*' => Http::response(['STATUS' => 1, 'data' => ['message' => 'Invalid code']], 200),
        ]);

        $result = (new RiverPaySimpleProtocol())->testConnection($this->provider(), 'river_password');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('Invalid code', $result['error']);
        $this->assertStringContainsString('Run Safe Test', $result['error']);
    }
}
