<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;

/**
 * A gaming-panel provider "protocol" — the shape of requests a given
 * provider expects. Different vendors use different auth/request styles
 * (see AgentLoginProtocol vs ExternalSignedProtocol); everything above this
 * abstraction (HealthChecker, E2eTester, Provisioner, the admin controller)
 * talks to providers only through this interface so they don't need to
 * know which style a given provider uses.
 *
 * Every method returns the same shape and never throws for "provider said
 * no" — only for truly exceptional PHP errors:
 *   ['success'=>bool, 'http_status'=>?int, 'data'=>?array, 'raw'=>mixed, 'error'=>?string, 'duration_ms'=>int]
 */
interface ProviderProtocolInterface
{
    /** Cheapest possible authenticated call — used by Test Connection / Health Check. */
    public function testConnection(GameApiProvider $provider, string $secret): array;

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array;

    public function findPlayerIdByUsername(GameApiProvider $provider, string $secret, string $username): array;

    public function getScore(GameApiProvider $provider, string $secret, $playerId): array;

    public function recharge(GameApiProvider $provider, string $secret, array $args): array;

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array;
}
