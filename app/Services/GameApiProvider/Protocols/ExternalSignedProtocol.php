<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Exceptions\GameAgentApiException;
use App\Models\GameApiProvider;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * "external_signed" protocol — no login step. Every request is signed with
 *   token = md5("{agent_id}:{timestamp}:{secret_key}")
 * where `agent_id` is the provider's agent_username field, `secret_key` is
 * the stored provider secret, and timestamp is the current 10-digit second
 * epoch. Ported from the vendor's own API-Documentation.pdf (the same spec
 * app/Services/GameAgentApiService.php already implements for the single
 * global "Game Agent" site-settings provider) — this is the per-provider,
 * multi-tenant version of that same protocol for the Game API Providers
 * module (e.g. gamevault999).
 */
class ExternalSignedProtocol implements ProviderProtocolInterface
{
    public function testConnection(GameApiProvider $provider, string $secret): array
    {
        // agentBalance takes no extra parameters — the cheapest possible
        // authenticated call, and never mutates anything.
        return $this->request($provider, $secret, 'agentBalance');
    }

    public function createPlayer(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->request($provider, $secret, 'addUser', [
            'account' => $args['username'],
            'login_pwd' => $args['password'],
        ]);
    }

    public function findPlayerIdByUsername(GameApiProvider $provider, string $secret, string $username): array
    {
        $result = $this->request($provider, $secret, 'getUserID', ['account_name' => $username]);
        if ($result['success'] && isset($result['data']['user_id'])) {
            $result['data'] = ['id' => $result['data']['user_id']];
        }

        return $result;
    }

    public function getScore(GameApiProvider $provider, string $secret, $playerId): array
    {
        $result = $this->request($provider, $secret, 'userBalance', ['user_id' => $playerId]);
        if ($result['success'] && isset($result['data']['user_balance'])) {
            $result['data'] = ['balance' => $result['data']['user_balance']];
        }

        return $result;
    }

    public function recharge(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->request($provider, $secret, 'recharge', [
            'user_id' => $args['id'],
            'amount' => $args['balance'],
            'order_id' => $args['remark'] ?: $this->generateOrderId(),
        ]);
    }

    public function withdraw(GameApiProvider $provider, string $secret, array $args): array
    {
        return $this->request($provider, $secret, 'withdraw', [
            'user_id' => $args['id'],
            'amount' => $args['balance'],
            'order_id' => $args['remark'] ?: $this->generateOrderId(),
        ]);
    }

    private function generateOrderId(): string
    {
        return (string) time() . random_int(100, 999);
    }

    private function sign(string $agentId, string $timestamp, string $secretKey): string
    {
        return md5("{$agentId}:{$timestamp}:{$secretKey}");
    }

    private function request(GameApiProvider $provider, string $secretKey, string $endpoint, array $params = []): array
    {
        $start = microtime(true);
        $agentId = $provider->agent_username;
        $timestamp = (string) time();
        $token = $this->sign($agentId, $timestamp, $secretKey);

        try {
            $url = rtrim($provider->base_url, '/') . '/api/external/' . ltrim($endpoint, '/');
            $response = Http::asMultipart()->timeout(15)->post($url, array_merge([
                'agent_id' => $agentId,
                'timestamp' => $timestamp,
                'token' => $token,
            ], $params));

            $status = $response->status();
            $body = $response->json();
            $durationMs = (int) ((microtime(true) - $start) * 1000);

            if (!is_array($body) || !array_key_exists('code', $body)) {
                return [
                    'success' => false, 'http_status' => $status, 'data' => null,
                    'raw' => $body ?? ['raw_text' => substr($response->body(), 0, 500)],
                    'error' => "Unexpected response from provider (HTTP {$status}).",
                    'duration_ms' => $durationMs,
                ];
            }

            $code = (int) $body['code'];
            if ($code === 0) {
                return [
                    'success' => true, 'http_status' => $status, 'data' => $body['data'] ?? null,
                    'raw' => $body, 'error' => null, 'duration_ms' => $durationMs,
                ];
            }

            $meaning = GameAgentApiException::STATUS_MESSAGES[$code] ?? 'Unknown error';
            $msg = $body['msg'] ?? null;
            $error = $msg && $msg !== $meaning ? "{$meaning}: {$msg} (code {$code})" : "{$meaning} (code {$code})";

            return [
                'success' => false, 'http_status' => $status, 'data' => null,
                'raw' => $body, 'error' => $error, 'duration_ms' => $durationMs,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
                'error' => $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }
}
