<?php

namespace Tests\Unit;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\Protocols\FastApiSignedProtocol;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FastApiSignedProtocolTest extends TestCase
{
    use RefreshDatabase;

    private function provider(): GameApiProvider
    {
        return GameApiProvider::create([
            'name' => 'fast_api_test',
            'protocol' => 'fast_api_signed',
            'display_name' => 'Fast API',
            'base_url' => 'https://api.fastprovider.example',
            'agent_username' => 'agent_account',
            'is_active' => true,
        ]);
    }

    /** Builds a valid appsecret_encrypted blob the way FastApiService::aesDecrypt() expects. */
    private function encryptedAppSecret(string $plainSecret, string $agentPassword): string
    {
        $key = md5(md5(strtolower($agentPassword)));
        $iv = str_repeat("\x01", 16);
        $encrypted = openssl_encrypt($plainSecret, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);

        return base64_encode($iv . $encrypted);
    }

    public function test_test_connection_logs_in_and_reports_the_appid(): void
    {
        $encrypted = $this->encryptedAppSecret('decryptedAppSecret1', 'agentpass123');
        Http::fake([
            '*/fast/agent/login*' => Http::response(['code' => 0, 'data' => ['appid' => 'APP1', 'appsecret_encrypted' => $encrypted]], 200),
        ]);

        $result = (new FastApiSignedProtocol())->testConnection($this->provider(), 'agentpass123');

        $this->assertTrue($result['success']);
        $this->assertSame('APP1', $result['data']['appid']);
    }

    public function test_create_player_logs_in_then_creates_the_user_with_the_decrypted_appsecret(): void
    {
        $encrypted = $this->encryptedAppSecret('decryptedAppSecret1', 'agentpass123');
        Http::fake([
            '*/fast/agent/login*' => Http::response(['code' => 0, 'data' => ['appid' => 'APP1', 'appsecret_encrypted' => $encrypted]], 200),
            '*/fast/user/create*' => Http::response(['code' => 0, 'data' => ['account' => 'player001']], 200),
        ]);

        $result = (new FastApiSignedProtocol())->createPlayer($this->provider(), 'agentpass123', [
            'username' => 'player001', 'password' => 'PlayerPass1',
        ]);

        $this->assertTrue($result['success']);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/fast/user/create')
                && $request->data()['appid'] === 'APP1'
                && $request->data()['account'] === 'player001';
        });
    }

    public function test_find_player_id_by_username_is_a_local_pass_through_with_no_http_call(): void
    {
        Http::fake();

        $result = (new FastApiSignedProtocol())->findPlayerIdByUsername($this->provider(), 'agentpass123', 'player001');

        $this->assertTrue($result['success']);
        $this->assertSame('player001', $result['data']['id']);
        Http::assertNothingSent();
    }

    public function test_login_failure_is_reported_as_a_clean_error(): void
    {
        Http::fake([
            '*/fast/agent/login*' => Http::response(['code' => 21, 'message' => 'Agent Name Or Password error'], 200),
        ]);

        $result = (new FastApiSignedProtocol())->testConnection($this->provider(), 'wrongpass');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('Agent Name Or Password error', $result['error']);
    }
}
