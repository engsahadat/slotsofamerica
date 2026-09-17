<?php

namespace App\Services;

use App\Exceptions\GameAgentApiException;
use Exception;
use Illuminate\Support\Facades\Http;

/**
 * Client for the upstream game provider's "Agent API" (player accounts,
 * recharge/withdraw, balances). See the provider's Agent API doc
 * (API-Documentation.pdf) for the full spec — this mirrors it 1:1.
 *
 * Auth: every request is signed with
 *   token = md5("{agent_id}:{timestamp}:{secret_key}")
 * where timestamp is the current 10-digit second epoch (Global Parameters,
 * §1.1) and token is the resulting 32-character *lowercase* hex string —
 * PHP's md5() already returns lowercase, so no case conversion is needed.
 */
class GameAgentApiService
{
    public static function addUser(string $account, string $loginPwd): array
    {
        return self::request('addUser', [
            'account' => $account,
            'login_pwd' => $loginPwd,
        ]);
    }

    public static function recharge(string $userId, string $amount, string $orderId): array
    {
        return self::request('recharge', [
            'user_id' => $userId,
            'amount' => $amount,
            'order_id' => $orderId,
        ]);
    }

    public static function withdraw(string $userId, string $amount, string $orderId): array
    {
        return self::request('withdraw', [
            'user_id' => $userId,
            'amount' => $amount,
            'order_id' => $orderId,
        ]);
    }

    public static function getUserBalance(string $userId): array
    {
        return self::request('userBalance', [
            'user_id' => $userId,
        ]);
    }

    public static function getAgentBalance(): array
    {
        return self::request('agentBalance');
    }

    public static function getUserId(string $accountName): array
    {
        return self::request('getUserID', [
            'account_name' => $accountName,
        ]);
    }

    public static function getLowDepositUsers(string $queryDate, int $page = 1, int $pageSize = 20): array
    {
        // Doc's own URL has a doubled "external" segment — kept verbatim.
        return self::request('external/getLowDepositUsers', [
            'query_date' => $queryDate,
            'page' => $page,
            'page_size' => $pageSize,
        ]);
    }

    public static function resetPassword(string $userId, string $loginPwd): array
    {
        return self::request('resetPassword', [
            'user_id' => $userId,
            'login_pwd' => $loginPwd,
        ]);
    }

    public static function forcePlayerOffline(string $userId): array
    {
        return self::request('playerOffline', [
            'user_id' => $userId,
        ]);
    }

    /**
     * @throws GameAgentApiException on a non-zero provider status code
     * @throws Exception on missing config or a transport-level failure
     */
    private static function request(string $endpoint, array $params = []): array
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $baseUrl = $siteSetting?->game_agent_base_url ?: config('services.game_agent.base_url');
        $agentId = $siteSetting?->game_agent_id ?: config('services.game_agent.agent_id');
        $secretKey = $siteSetting?->game_agent_secret_key ?: config('services.game_agent.secret_key');

        if (!$baseUrl || !$agentId || !$secretKey) {
            throw new Exception('Game Agent API is not configured. Please enter Game Agent ID and Secret Key in Admin Site Settings.');
        }

        $timestamp = (string) time();
        $token = md5("{$agentId}:{$timestamp}:{$secretKey}");

        $response = Http::asMultipart()
            ->timeout(15)
            ->post(rtrim($baseUrl, '/') . '/api/external/' . ltrim($endpoint, '/'), array_merge([
                'agent_id' => $agentId,
                'timestamp' => $timestamp,
                'token' => $token,
            ], $params));

        if ($response->failed()) {
            throw new Exception("Game Agent API request to [{$endpoint}] failed: " . $response->status() . ' ' . $response->body());
        }

        $body = $response->json();

        if (!is_array($body) || !array_key_exists('code', $body)) {
            throw new Exception("Game Agent API returned an unexpected response for [{$endpoint}]: " . $response->body());
        }

        if ((int) $body['code'] !== 0) {
            throw new GameAgentApiException((int) $body['code'], $body['msg'] ?? null);
        }

        return $body['data'] ?? [];
    }
}
