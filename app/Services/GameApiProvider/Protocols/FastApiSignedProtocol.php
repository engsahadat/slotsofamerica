<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;
use App\Services\FastApiService;
use RuntimeException;
use Throwable;

/**
 * "fast_api_signed" protocol — FastAPI's two-tier credential model: the
 * stored agent account+password (provider->agent_username / $secret) logs in
 * to get a per-session appid + AES-encrypted appsecret, which
 * FastApiService::agentLogin() already decrypts for us; every subsequent
 * call is then md5-signed with that appid/appsecret pair (see
 * FastApiService::sign()). Every call here logs in fresh — simple and
 * stateless, matching AgentLoginProtocol's own reasoning for why caching
 * isn't worth it for admin-triggered actions.
 *
 * FastAPI has no separate numeric "player ID" or ID-lookup endpoint — the
 * account name itself is what deposit/withdrawal/balance calls take — so
 * findPlayerIdByUsername is a local pass-through, same reasoning as Orion
 * Stars.
 */
class FastApiSignedProtocol implements ProviderProtocolInterface
{
    public function testConnection(GameApiProvider $provider, string $secret): array
    {
        $start = microtime(true);
        try {
            [$appid] = $this->login($provider, $secret);

            return [
                'success' => true, 'http_status' => 200, 'data' => ['appid' => $appid],
                'raw' => null, 'error' => null, 'duration_ms' => $this->ms($start),
            ];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            [$appid, $appSecret] = $this->login($provider, $secret);
            $result = FastApiService::createUser($args['username'], $args['password'], $appid, $appSecret, null, $provider->base_url);

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
        $start = microtime(true);
        try {
            [$appid, $appSecret] = $this->login($provider, $secret);
            $result = FastApiService::getBalance($playerId, $appid, $appSecret, null, $provider->base_url);

            return [
                'success' => true, 'http_status' => 200,
                'data' => ['balance' => $result['balance'] ?? $result['money'] ?? null],
                'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start),
            ];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function recharge(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            [$appid, $appSecret] = $this->login($provider, $secret);
            $result = FastApiService::deposit($args['id'], (string) $args['balance'], $appid, $appSecret, null, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            [$appid, $appSecret] = $this->login($provider, $secret);
            $result = FastApiService::withdrawal($args['id'], (string) $args['balance'], $appid, $appSecret, null, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    /** @return array{0: string, 1: string} [appid, decrypted appsecret] */
    private function login(GameApiProvider $provider, string $secret): array
    {
        $result = FastApiService::agentLogin($provider->agent_username, $secret, null, $provider->base_url);
        $appid = $result['appid'] ?? null;
        $appSecret = $result['appsecret_decrypted'] ?? null;

        if (empty($appid) || empty($appSecret)) {
            throw new RuntimeException('FastAPI agentLogin did not return a usable appid/appsecret.');
        }

        return [$appid, $appSecret];
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
