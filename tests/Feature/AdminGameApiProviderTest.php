<?php

namespace Tests\Feature;

use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminGameApiProviderTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return JwtAuthService::generateToken($admin);
    }

    public function test_admin_can_create_provider_set_password_and_toggle_active(): void
    {
        $token = $this->adminToken();

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/game-api-providers', [
                'name' => 'testprovider777',
                'display_name' => 'Test Provider 777',
                'base_url' => 'https://agentserver.testprovider777.com',
                'agent_username' => 'agent1',
            ]);
        $createRes->assertStatus(201);
        $providerId = $createRes->json('provider.id');

        $pwRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$providerId}/password", ['password' => 'secret123']);
        $pwRes->assertStatus(200);

        $this->assertDatabaseHas('game_api_provider_secrets', ['provider_id' => $providerId]);

        $indexRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/admin/game-api-providers');
        $indexRes->assertStatus(200);
        $provider = collect($indexRes->json('providers'))->firstWhere('id', $providerId);
        $this->assertTrue($provider['has_password']);

        $toggleRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$providerId}/toggle", [
                'field' => 'is_active', 'value' => true,
            ]);
        $toggleRes->assertStatus(200);
        $this->assertDatabaseHas('game_api_providers', ['id' => $providerId, 'is_active' => true]);
    }

    public function test_test_connection_logs_a_successful_agent_login(): void
    {
        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'fake-token']], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'fakegateway', 'display_name' => 'Fake Gateway',
            'base_url' => 'https://agentserver.fakegateway.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test");

        $res->assertStatus(200)->assertJsonPath('success', true);

        $this->assertDatabaseHas('game_api_logs', [
            'provider_name' => 'fakegateway',
            'action' => 'agent_login',
            'success' => true,
        ]);
    }

    /**
     * Regression: "Test Connection" used to duplicate a subset of HealthChecker's logic (call
     * the protocol, write a log row) but never updated the provider's own last_health_status /
     * last_health_checked_at columns — only HealthChecker (used by other entry points) did
     * that. Since the health badge's "connected vs checking" state is derived from a 24h-
     * windowed log query, a provider the admin had just verified as working would silently
     * revert to "Checking" / "Never checked" once that window passed with no OTHER check
     * having run in between. Delegating to HealthChecker fixes that at the source.
     */
    public function test_test_connection_persists_last_health_status_on_the_provider_row(): void
    {
        Http::fake([
            '*/api/agent/login' => Http::response(['code' => 0, 'data' => ['token' => 'fake-token']], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'persistgateway', 'display_name' => 'Persist Gateway',
            'base_url' => 'https://agentserver.persistgateway.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secret123']);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test")
            ->assertStatus(200)->assertJsonPath('success', true);

        $provider->refresh();
        $this->assertSame('connected', $provider->last_health_status);
        $this->assertNotNull($provider->last_health_checked_at);
        $this->assertNotNull($provider->last_success_at);
    }

    /** Same persistence fix, exercised for a non-agent_login protocol (external_signed). */
    public function test_test_connection_persists_last_health_status_for_external_signed_protocol(): void
    {
        Http::fake([
            '*/api/external/agentBalance' => Http::response(['code' => 0, 'msg' => 'Success', 'data' => ['agent_balance' => '100'], 'count' => 0], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'persistsignedgateway', 'protocol' => 'external_signed', 'display_name' => 'Persist Signed Gateway',
            'base_url' => 'https://apius.persistsignedgateway.com',
            'agent_username' => '1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'mysecretkey']);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test")
            ->assertStatus(200)->assertJsonPath('success', true);

        $provider->refresh();
        $this->assertSame('connected', $provider->last_health_status);
        $this->assertNotNull($provider->last_health_checked_at);
    }

    public function test_test_connection_works_for_external_signed_protocol_provider(): void
    {
        Http::fake([
            '*/api/external/agentBalance' => Http::response(['code' => 0, 'msg' => 'Success', 'data' => ['agent_balance' => '100'], 'count' => 0], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'signedgateway', 'protocol' => 'external_signed', 'display_name' => 'Signed Gateway',
            'base_url' => 'https://apius.signedgateway.com',
            'agent_username' => '1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'mysecretkey']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test");

        $res->assertStatus(200)->assertJsonPath('success', true);

        Http::assertSent(function ($request) {
            $body = $request->body();
            preg_match('/name="timestamp".*?\r?\n\r?\n(\d+)/s', $body, $ts);
            preg_match('/name="token".*?\r?\n\r?\n([a-f0-9]+)/s', $body, $tok);

            return isset($ts[1], $tok[1])
                && preg_match('/^\d{10}$/', $ts[1])
                && $tok[1] === md5("1:{$ts[1]}:mysecretkey");
        });

        $this->assertDatabaseHas('game_api_logs', [
            'provider_name' => 'signedgateway', 'action' => 'agent_login', 'success' => true,
        ]);
    }

    /**
     * Regression: HealthChecker only special-cased 'external_signed' — every other non-
     * agent_login protocol (orion_stars_signed, fast_api_signed, river_pay_simple) fell
     * through to the generic agent_login-style raw HTTP prober, which posts to the wrong
     * endpoint with the wrong fields entirely for these protocols. Confirmed here by faking
     * ONLY Orion Stars' real endpoint (ws/service.ashx) — if the routing were still wrong,
     * this fake wouldn't be hit and the request would error out instead of succeeding.
     */
    public function test_test_connection_routes_orion_stars_signed_through_its_own_protocol(): void
    {
        Http::fake([
            '*ws/service.ashx?action=agentLogin*' => Http::response(['code' => 200, 'agentKey' => 'KEY1', 'Balance' => 100], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'orionroutingtest', 'protocol' => 'orion_stars_signed', 'display_name' => 'Orion Routing Test',
            'base_url' => 'https://orionstars.vip:8033', 'agent_username' => 'agent1', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'secretkey']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test");

        $res->assertStatus(200)->assertJsonPath('success', true);
        $this->assertSame('connected', $provider->fresh()->last_health_status);
    }

    public function test_test_connection_reports_friendly_message_for_external_signed_provider_error(): void
    {
        Http::fake([
            '*/api/external/agentBalance' => Http::response(['code' => 2, 'msg' => 'Invalid request parameters', 'data' => [], 'count' => 0], 200),
        ]);

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'badsignedgateway', 'protocol' => 'external_signed', 'display_name' => 'Bad Signed Gateway',
            'base_url' => 'https://apius.badsignedgateway.com',
            'agent_username' => 'not-a-number', 'is_active' => true,
        ]);
        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => 'mysecretkey']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test");

        $res->assertStatus(200)->assertJsonPath('success', false);
        // Smart validation: "Invalid request parameters (code 2)" is one of the two specific
        // agent777-style codes ErrorClassifier now recognizes explicitly (found via live
        // debugging this exact integration) — an admin gets actionable guidance (check the
        // Agent Username for typos/stray whitespace, or the Base URL) instead of the bare
        // provider code.
        $this->assertStringContainsString('wrong Agent Username', $res->json('message'));
    }

    public function test_test_connection_reports_missing_password_without_calling_provider(): void
    {
        Http::fake();

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'nopassprovider', 'display_name' => 'No Password Provider',
            'base_url' => 'https://agentserver.example.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test");

        $res->assertStatus(200)->assertJsonPath('success', false);
        Http::assertNothingSent();
    }

    /**
     * Regression: the missing-password early return skipped writing a game_api_logs row, so
     * the frontend's computeHealth() (which derives everything from that log table, not the
     * provider's own DB columns) never saw enough evidence to show "Needs Attention" — the
     * card was stuck on "Checking" forever for an active provider with no password set.
     */
    public function test_test_connection_with_missing_password_writes_a_log_row(): void
    {
        Http::fake();

        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'nopassprovider2', 'display_name' => 'No Password Provider 2',
            'base_url' => 'https://agentserver.example.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ]);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/test")
            ->assertStatus(200);

        $this->assertDatabaseHas('game_api_logs', [
            'provider_id' => $provider->id,
            'success' => false,
        ]);
        $this->assertStringContainsString(
            'Agent password is not set for this provider.',
            \App\Models\GameApiLog::where('provider_id', $provider->id)->value('error_message')
        );
    }

    /**
     * Regression: index() used to cap logs at a flat top-100-across-all-providers, so a busy
     * provider's log volume could push a quieter provider's genuinely-recent successful check
     * out of the fetched window (the frontend's health badge only looks at the last 24h).
     * Now it's time-bounded to 24h instead, so an old log outside that window is correctly
     * excluded but nothing recent gets starved out regardless of row count.
     */
    public function test_index_only_returns_logs_from_the_last_24_hours(): void
    {
        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'quietprovider', 'display_name' => 'Quiet Provider',
            'base_url' => 'https://agentserver.example.com',
            'agent_username' => 'agent1', 'is_active' => true,
        ]);

        $recent = GameApiLog::create([
            'provider_id' => $provider->id, 'provider_name' => $provider->name, 'action' => 'test',
            'success' => true, 'created_at' => now()->subHours(2),
        ]);
        $stale = GameApiLog::create([
            'provider_id' => $provider->id, 'provider_name' => $provider->name, 'action' => 'test',
            'success' => true, 'created_at' => now()->subDays(3),
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/admin/game-api-providers');
        $res->assertStatus(200);
        $ids = collect($res->json('logs'))->pluck('id');
        $this->assertTrue($ids->contains($recent->id));
        $this->assertFalse($ids->contains($stale->id));
    }

    public function test_non_admin_cannot_access_game_api_providers(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/admin/game-api-providers');

        $res->assertStatus(403);
    }

    public function test_create_provider_rejects_malformed_base_url(): void
    {
        $token = $this->adminToken();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/game-api-providers', [
                'name' => 'badurlprovider',
                'display_name' => 'Bad URL Provider',
                'base_url' => 'not-a-url',
                'agent_username' => 'agent1',
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('base_url');
    }

    public function test_create_provider_rejects_name_with_spaces(): void
    {
        $token = $this->adminToken();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/game-api-providers', [
                'name' => 'bad name',
                'display_name' => 'Bad Name Provider',
                'base_url' => 'https://agentserver.example.com',
                'agent_username' => 'agent1',
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('name');
    }

    public function test_set_password_rejects_whitespace_only_password(): void
    {
        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'wsprovider', 'display_name' => 'Whitespace Provider',
            'base_url' => 'https://agentserver.example.com', 'agent_username' => 'agent1',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => '   ']);

        $res->assertStatus(422);
        $this->assertDatabaseMissing('game_api_provider_secrets', ['provider_id' => $provider->id]);
    }

    public function test_set_password_trims_surrounding_whitespace(): void
    {
        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'trimprovider', 'display_name' => 'Trim Provider',
            'base_url' => 'https://agentserver.example.com', 'agent_username' => 'agent1',
        ]);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/game-api-providers/{$provider->id}/password", ['password' => "  secret123  \n"]);

        $secret = \App\Models\GameApiProviderSecret::where('provider_id', $provider->id)->first();
        $this->assertSame('secret123', $secret->agent_password);
    }

    /**
     * Smart validation: a copy-pasted Agent Username/Base URL with a stray leading/trailing
     * space (or a trailing slash on the URL) is indistinguishable from "wrong value" once sent
     * to the provider — exactly the kind of thing found during a real live debugging session
     * for this integration. Both now get silently cleaned up on save instead of either failing
     * validation (base_url) or quietly breaking every live API call (agent_username).
     */
    public function test_creating_a_provider_trims_agent_username_and_strips_a_trailing_slash_from_base_url(): void
    {
        $token = $this->adminToken();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/game-api-providers', [
                'name' => 'normalizeprovider', 'display_name' => 'Normalize Provider',
                'base_url' => 'https://agentserver.example.com/',
                'agent_username' => '  agent1  ',
            ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('game_api_providers', [
            'name' => 'normalizeprovider', 'agent_username' => 'agent1', 'base_url' => 'https://agentserver.example.com',
        ]);
    }

    public function test_updating_a_provider_also_trims_agent_username_and_base_url(): void
    {
        $token = $this->adminToken();
        $provider = GameApiProvider::create([
            'name' => 'updatenormalize', 'display_name' => 'Update Normalize',
            'base_url' => 'https://agentserver.example.com', 'agent_username' => 'agent1',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson("/api/admin/game-api-providers/{$provider->id}", [
                'agent_username' => "agent2\n", 'base_url' => 'https://newhost.example.com//',
            ]);

        $res->assertStatus(200);
        $this->assertSame('agent2', $provider->fresh()->agent_username);
        $this->assertSame('https://newhost.example.com', $provider->fresh()->base_url);
    }
}
