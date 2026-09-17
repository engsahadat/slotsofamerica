<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;
use App\Services\RiverPayApiService;
use Throwable;

/**
 * "river_pay_simple" protocol — River Pay has no signing at all (plain
 * login+password sent as query params, see RiverPayApiService) and no
 * concept of a chosen player username: createAccount() returns a
 * provider-generated opaque "code" that becomes the account's identifier
 * for every later deposit/withdrawal/balance call. So createPlayer ignores
 * the requested username and returns the generated code as the id, and
 * findPlayerIdByUsername is a pass-through (the "username" callers already
 * hold for a River Pay account IS that code, there's no separate lookup).
 *
 * River Pay also has no side-effect-free endpoint at all — every call either
 * creates/deposits/withdraws/closes or reads the balance of a real existing
 * code. testConnection therefore probes getBalance() with a throwaway code:
 * a clean "invalid code"-style business error still proves the login/base
 * URL/credentials are being accepted at the transport level, so that's
 * reported as a (labelled) success rather than a false failure.
 */
class RiverPaySimpleProtocol implements ProviderProtocolInterface
{
    private const PROBE_CODE = '__connection_probe__';

    public function testConnection(GameApiProvider $provider, string $secret): array
    {
        $start = microtime(true);
        try {
            $result = RiverPayApiService::getBalance(self::PROBE_CODE, $provider->agent_username, $secret, $provider->base_url);

            return [
                'success' => true, 'http_status' => 200, 'data' => $result,
                'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start),
            ];
        } catch (Throwable $e) {
            // River Pay has no side-effect-free endpoint (see class docblock) — a probe
            // against a code that doesn't exist is EXPECTED to come back as a business
            // error even when login/credentials are perfectly correct, so a failure here
            // isn't conclusive on its own. Use "Run Safe Test" for a real end-to-end check.
            return $this->failure($e, $start, ' (a business error here can be normal for River Pay — use "Run Safe Test" to confirm)');
        }
    }

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            // River Pay ignores any requested username/password — it mints its own
            // opaque "code" as the account identifier.
            $result = RiverPayApiService::createAccount('0.00', 0, $provider->agent_username, $secret, $provider->base_url);
            $code = $result['code'] ?? null;

            if (empty($code)) {
                return $this->failure(new \RuntimeException('River Pay createAccount did not return a code.'), $start);
            }

            return ['success' => true, 'http_status' => 200, 'data' => ['code' => $code], 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function findPlayerIdByUsername(GameApiProvider $provider, string $secret, string $username): array
    {
        // The "username" a River Pay account is tracked under here already IS the
        // provider-generated code from createPlayer — no separate lookup exists or is needed.
        return [
            'success' => true, 'http_status' => null, 'data' => ['id' => $username],
            'raw' => null, 'error' => null, 'duration_ms' => 0,
        ];
    }

    public function getScore(GameApiProvider $provider, string $secret, $playerId): array
    {
        $start = microtime(true);
        try {
            $result = RiverPayApiService::getBalance((string) $playerId, $provider->agent_username, $secret, $provider->base_url);

            return [
                'success' => true, 'http_status' => 200, 'data' => ['balance' => $result['balance'] ?? null],
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
            $result = RiverPayApiService::deposit((string) $args['id'], (string) $args['balance'], 0, $provider->agent_username, $secret, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array
    {
        $start = microtime(true);
        try {
            $result = RiverPayApiService::withdrawal((string) $args['id'], (string) $args['balance'], $provider->agent_username, $secret, $provider->base_url);

            return ['success' => true, 'http_status' => 200, 'data' => null, 'raw' => $result, 'error' => null, 'duration_ms' => $this->ms($start)];
        } catch (Throwable $e) {
            return $this->failure($e, $start);
        }
    }

    private function failure(Throwable $e, float $start, string $suffix = ''): array
    {
        return [
            'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
            'error' => $e->getMessage() . $suffix, 'duration_ms' => $this->ms($start),
        ];
    }

    private function ms(float $start): int
    {
        return (int) ((microtime(true) - $start) * 1000);
    }
}
