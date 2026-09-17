<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\ProviderHttpClient;

/**
 * "agent_login" protocol — username+password login → bearer token, then
 * bearer-authenticated calls (e.g. gameroom777, and the reference
 * skyreach-atlas project's agent777.ts). Every interface method logs in
 * fresh each call — simple and stateless, matching ProviderHttpClient's
 * existing design; not worth caching tokens for admin-triggered actions.
 */
class AgentLoginProtocol implements ProviderProtocolInterface
{
    public function __construct(private ProviderHttpClient $http)
    {
    }

    public function testConnection(GameApiProvider $provider, string $secret): array
    {
        return $this->http->agentLogin($provider, $secret);
    }

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->withToken($provider, $secret, fn (string $token) => $this->http->createPlayer($provider, $token, $args));
    }

    public function findPlayerIdByUsername(GameApiProvider $provider, string $secret, string $username): array
    {
        return $this->withToken($provider, $secret, fn (string $token) => $this->http->findPlayerIdByUsername($provider, $token, $username));
    }

    public function getScore(GameApiProvider $provider, string $secret, $playerId): array
    {
        return $this->withToken($provider, $secret, fn (string $token) => $this->http->getScore($provider, $token, $playerId));
    }

    public function recharge(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->withToken($provider, $secret, fn (string $token) => $this->http->playerRecharge($provider, $token, $args));
    }

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->withToken($provider, $secret, fn (string $token) => $this->http->playerWithdraw($provider, $token, $args));
    }

    private function withToken(GameApiProvider $provider, string $secret, callable $action): array
    {
        $login = $this->http->agentLogin($provider, $secret);
        if (!$login['success']) {
            return $login;
        }

        return $action($login['data']['token']);
    }
}
