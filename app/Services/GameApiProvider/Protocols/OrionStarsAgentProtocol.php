<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;
use App\Services\OrionStarsApiService;
use RuntimeException;
use Throwable;

/**
 * "orion_stars_signed" protocol — the real Orion Stars OS Terminal API v1.2
 * flow (agentLogin -> rotating agentKey -> md5(agentName+time+agentKey) sign
 * on every subsequent call). Reuses the already-implemented, spec-matching
 * OrionStarsApiService rather than re-deriving the wire format — every call
 * here explicitly passes the freshly-logged-in agentKey through, so it never
 * touches that service's own SiteSetting-backed config/cache; this protocol
 * is fully self-contained per GameApiProvider row (provider->agent_username
 * is the agentName, $secret is the raw agent password).
 *
 * Orion Stars has no separate numeric "player ID" concept — the account name
 * itself is what every player-specific call (recharge/redeem) takes — and
 * its queryInfo/changePasswd endpoints require the PLAYER's own password
 * (not the agent's), which this generic interface is never given. So
 * findPlayerIdByUsername is a local pass-through (account name as "id", no
 * such password-free lookup endpoint exists) and getScore honestly reports
 * that Orion Stars balance sync isn't available through this generic path.
 */
class OrionStarsAgentProtocol implements ProviderProtocolInterface
{
    public function testConnection(GameApiProvider $provider, string $secret): array
    {
        $start = microtime(true);
        try {
            $result = OrionStarsApiService::agentLogin($provider->agent_username, $secret, $provider->base_url);

            return [
                'success' => true, 'http_status' => 200,
                'data' => ['agent_key' => $result['agentKey'] ?? null, 'balance' => $result['Balance'] ?? null],
                'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start),
            ];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            $agentKey = $this->login($provider, $secret);
            $result = OrionStarsApiService::registerUser($args['username'], $args['password'], $provider->agent_username, $agentKey, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function findPlayerIdByUsername(GameApiProvider $provider, string $secret, string $username): array
    {
        return [
            'success' => true, 'http_status' => null, 'data' => ['id' => $username],
            'raw' => null, 'error' => null, 'duration_ms' => 0,
        ];
    }

    public function getScore(GameApiProvider $provider, string $secret, $playerId): array
    {
        return [
            'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
            'error' => "Orion Stars balance lookup (queryInfo) requires the player's own password, which isn't available here — not supported via automatic sync.",
            'duration_ms' => 0,
        ];
    }

    public function recharge(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            $agentKey = $this->login($provider, $secret);
            // The provider's API only accepts whole-number amounts.
            $result = OrionStarsApiService::recharge($args['id'], (int) round((float) $args['balance']), $provider->agent_username, $agentKey, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            $agentKey = $this->login($provider, $secret);
            $result = OrionStarsApiService::redeem($args['id'], (int) round((float) $args['balance']), $provider->agent_username, $agentKey, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    private function login(GameApiProvider $provider, string $secret): string
    {
        $result = OrionStarsApiService::agentLogin($provider->agent_username, $secret, $provider->base_url);

        return $result['agentKey'] ?? throw new RuntimeException('Orion Stars agentLogin did not return an agentKey.');
    }

    private function failure(Throwable $e, float $start): array
    {
        return [
            'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
            'error' => $e->getMessage(), 'duration_ms' => $this->ms($start),
        ];
    }

    private function ms(float $start): int
    {
        return (int) ((microtime(true) - $start) * 1000);
    }
}
