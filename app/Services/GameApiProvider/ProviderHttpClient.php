<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiProvider;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * HTTP adapter for the "agent777"-shaped gaming panel APIs (cashmachine777,
 * gameroom777, etc). Ported 1:1 from the reference Lovable project's
 * supabase/functions/_shared/providers/agent777.ts — same retry ladders,
 * same alternating multipart/urlencoded encoding, same success-envelope
 * rules — using Laravel's HTTP client instead of Deno + undici.
 */
class ProviderHttpClient
{
    private const HEADERS = [
        'Accept' => 'application/json',
        'Accept-Encoding' => 'identity',
        'Cache-Control' => 'no-cache',
        'Connection' => 'close',
        'Pragma' => 'no-cache',
        'User-Agent' => 'HorizonPlayersRoom/1.0',
    ];

    private const LOGIN_ATTEMPTS = [
        ['mode' => 'multipart', 'delayMs' => 0],
        ['mode' => 'urlencoded', 'delayMs' => 200],
        ['mode' => 'multipart', 'delayMs' => 500],
        ['mode' => 'urlencoded', 'delayMs' => 1000],
        ['mode' => 'multipart', 'delayMs' => 1500],
        ['mode' => 'urlencoded', 'delayMs' => 2000],
        ['mode' => 'multipart', 'delayMs' => 2500],
        ['mode' => 'urlencoded', 'delayMs' => 3000],
    ];

    private const BEARER_BACKOFF_MS = [0, 250, 600, 1200, 2000, 3000];
    private const BEARER_ATTEMPTS = 6;

    public function providerOrigin(string $baseUrl): string
    {
        $raw = rtrim(trim($baseUrl), '/');
        if ($raw === '') {
            return $raw;
        }
        $parts = parse_url($raw);
        if (!empty($parts['scheme']) && !empty($parts['host'])) {
            $origin = $parts['scheme'] . '://' . $parts['host'];
            if (!empty($parts['port'])) {
                $origin .= ':' . $parts['port'];
            }
            return $origin;
        }
        return preg_replace('#/(admin|login|api)(/.*)?$#i', '', $raw);
    }

    public function providerUrl(GameApiProvider $provider, string $path): string
    {
        return $this->providerOrigin($provider->base_url) . $path;
    }

    public function randomPassword(int $len = 10): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        $out = '';
        $max = strlen($chars) - 1;
        for ($i = 0; $i < $len; $i++) {
            $out .= $chars[random_int(0, $max)];
        }
        return $out;
    }

    private function isTransientNetworkError(string $message): bool
    {
        $m = strtolower($message);
        foreach ([
            'close_notify', 'unexpected eof', 'connection reset', 'connection closed',
            'socket hang up', 'econnreset', 'epipe', 'etimedout', 'timeout', 'timed out',
            'network', 'error reading', 'could not resolve', 'couldn\'t connect',
            'connection refused', 'ssl', 'tls', 'certificate',
        ] as $needle) {
            if (str_contains($m, $needle)) {
                return true;
            }
        }
        return false;
    }

    public function isSuccessEnvelope($body): bool
    {
        if (!is_array($body)) {
            return false;
        }
        if (array_key_exists('code', $body)) {
            return $body['code'] === 0 || $body['code'] === '0';
        }
        if (array_key_exists('status_code', $body)) {
            return in_array($body['status_code'], [0, '0', 200, '200'], true);
        }
        return false;
    }

    public function envelopeMessage($body): string
    {
        if (!is_array($body)) {
            return 'Unknown provider response';
        }
        return $body['msg'] ?? $body['message'] ?? substr(json_encode($body) ?: '', 0, 200);
    }

    public function isTransient(string $message): bool
    {
        return $this->isTransientNetworkError($message);
    }

    /**
     * One HTTP call. Returns ['ok'=>bool,'status'=>?int,'body'=>mixed] or throws on transport failure.
     */
    private function httpRequest(string $url, string $method, string $mode, array $fields = [], ?string $bearer = null): array
    {
        $req = Http::withHeaders(self::HEADERS)->timeout(20)->connectTimeout(15);
        if ($bearer) {
            $req = $req->withToken($bearer);
        }

        if ($mode === 'multipart') {
            $parts = [];
            foreach ($fields as $k => $v) {
                $parts[] = ['name' => $k, 'contents' => (string) $v];
            }
            $req = $req->asMultipart();
            $response = $method === 'GET' ? $req->get($url) : $req->post($url, $parts);
        } else {
            $req = $req->asForm();
            $response = $method === 'GET' ? $req->get($url, $fields) : $req->post($url, $fields);
        }

        $status = $response->status();
        $body = $response->json();
        if ($body === null) {
            $body = ['raw_text' => $response->body()];
        }

        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $body];
    }

    private function retryRequest(string $url, callable $initFactory, int $attempts = self::BEARER_ATTEMPTS): array
    {
        $lastErr = null;
        for ($i = 0; $i < $attempts; $i++) {
            $delay = self::BEARER_BACKOFF_MS[min($i, count(self::BEARER_BACKOFF_MS) - 1)];
            if ($delay > 0) {
                usleep($delay * 1000);
            }
            try {
                [$method, $mode, $fields, $bearer] = $initFactory($i);
                return $this->httpRequest($url, $method, $mode, $fields, $bearer);
            } catch (Throwable $e) {
                $lastErr = $e;
                if (!$this->isTransientNetworkError($e->getMessage())) {
                    throw $e;
                }
            }
        }
        throw $lastErr;
    }

    /**
     * @return array{success:bool,http_status:?int,data:?array,raw:mixed,error:?string,duration_ms:int}
     */
    public function agentLogin(GameApiProvider $provider, string $password): array
    {
        $start = microtime(true);
        $url = $this->providerUrl($provider, '/api/agent/login');
        $errors = [];
        $lastResult = null;

        foreach (self::LOGIN_ATTEMPTS as $attempt) {
            if ($attempt['delayMs'] > 0) {
                usleep($attempt['delayMs'] * 1000);
            }
            $fields = ['username' => $provider->agent_username, 'password' => $password];

            try {
                $res = $this->httpRequest($url, 'POST', $attempt['mode'], $fields);
                $lastResult = $res;
                $ok = $res['ok'] && $this->isSuccessEnvelope($res['body']);
                $data = $ok ? ($res['body']['data'] ?? null) : null;

                if ($ok && !empty($data['token'])) {
                    return [
                        'success' => true,
                        'http_status' => $res['status'],
                        'data' => $data,
                        'raw' => $res['body'],
                        'error' => null,
                        'duration_ms' => (int) ((microtime(true) - $start) * 1000),
                    ];
                }

                if (in_array($res['status'], [401, 403], true)) {
                    return [
                        'success' => false,
                        'http_status' => $res['status'],
                        'data' => null,
                        'raw' => $res['body'],
                        'error' => $this->envelopeMessage($res['body']),
                        'duration_ms' => (int) ((microtime(true) - $start) * 1000),
                    ];
                }

                $errors[] = "{$attempt['mode']}: HTTP {$res['status']} " . $this->envelopeMessage($res['body']);
            } catch (Throwable $e) {
                $errors[] = "{$attempt['mode']}: {$e->getMessage()}";
                if (!$this->isTransientNetworkError($e->getMessage())) {
                    return [
                        'success' => false,
                        'http_status' => null,
                        'data' => null,
                        'raw' => null,
                        'error' => $e->getMessage(),
                        'duration_ms' => (int) ((microtime(true) - $start) * 1000),
                    ];
                }
            }
        }

        $lastError = end($errors) ?: 'no readable response';

        return [
            'success' => false,
            'http_status' => $lastResult['status'] ?? null,
            'data' => null,
            'raw' => $lastResult['body'] ?? null,
            'error' => sprintf(
                'Upstream connection issue (%s). Retried %d times with multipart and urlencoded encodings.',
                $lastError,
                count(self::LOGIN_ATTEMPTS)
            ),
            'duration_ms' => (int) ((microtime(true) - $start) * 1000),
        ];
    }

    public function findPlayerIdByUsername(GameApiProvider $provider, string $token, string $username): array
    {
        $start = microtime(true);
        try {
            $limit = 200;
            for ($page = 1; $page <= 5; $page++) {
                $url = $this->providerUrl($provider, "/api/player/playerList?limit={$limit}&page={$page}");
                $res = $this->retryRequest($url, fn () => ['GET', 'multipart', [], $token]);

                if (!$res['ok'] || !$this->isSuccessEnvelope($res['body'])) {
                    return [
                        'success' => false, 'http_status' => $res['status'], 'data' => null,
                        'raw' => $res['body'], 'error' => $this->envelopeMessage($res['body']),
                        'duration_ms' => (int) ((microtime(true) - $start) * 1000),
                    ];
                }

                $list = $res['body']['data']['list'] ?? $res['body']['data'] ?? [];
                if (!is_array($list)) {
                    $list = [];
                }
                foreach ($list as $p) {
                    $account = $p['Account'] ?? $p['account'] ?? $p['username'] ?? '';
                    if (strtolower((string) $account) === strtolower($username)) {
                        $id = $p['id'] ?? $p['ID'] ?? $p['player_id'] ?? null;
                        return [
                            'success' => true, 'http_status' => $res['status'], 'data' => ['id' => $id],
                            'raw' => $res['body'], 'error' => null,
                            'duration_ms' => (int) ((microtime(true) - $start) * 1000),
                        ];
                    }
                }
                if (count($list) < $limit) {
                    break;
                }
            }
            return [
                'success' => true, 'http_status' => 200, 'data' => null, 'raw' => null, 'error' => null,
                'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
                'error' => $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    public function createPlayer(GameApiProvider $provider, string $token, array $args): array
    {
        $start = microtime(true);
        try {
            $url = $this->providerUrl($provider, '/api/player/insertPlayer');
            $fields = [
                'username' => $args['username'],
                'nickname' => $args['nickname'],
                'password' => $args['password'],
                'money' => $args['money'] ?? 0,
            ];
            // Single attempt only — a network blip on the READ of the response can't be told
            // apart from one on the request, and this call isn't provably idempotent on the
            // provider's side (no dedup key). Retrying blindly risks creating two accounts;
            // safer to surface one clean failure than silently double-apply a mutation.
            $res = $this->retryRequest($url, fn ($attempt) => [
                'POST', $attempt % 2 === 0 ? 'multipart' : 'urlencoded', $fields, $token,
            ], attempts: 1);
            return $this->wrapMutationResult($res, $start);
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
                'error' => $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    public function getScore(GameApiProvider $provider, string $token, $id): array
    {
        $start = microtime(true);
        try {
            $url = $this->providerUrl($provider, '/api/player/getScore?id=' . urlencode((string) $id));
            $res = $this->retryRequest($url, fn () => ['GET', 'multipart', [], $token]);
            return $this->wrapMutationResult($res, $start);
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
                'error' => $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    public function playerRecharge(GameApiProvider $provider, string $token, array $args): array
    {
        return $this->rechargeOrWithdraw($provider, $token, '/api/player/playerRecharge', $args);
    }

    public function playerWithdraw(GameApiProvider $provider, string $token, array $args): array
    {
        return $this->rechargeOrWithdraw($provider, $token, '/api/player/playerWithdraw', $args);
    }

    private function rechargeOrWithdraw(GameApiProvider $provider, string $token, string $path, array $args): array
    {
        $start = microtime(true);
        try {
            $url = $this->providerUrl($provider, $path);
            $fields = [
                'id' => (string) $args['id'],
                'balance' => (string) $args['balance'],
                'remark' => $args['remark'] ?? '',
            ];
            // Single attempt only — this moves real money on the provider's side and there is
            // no documented dedup guarantee keyed on "remark". A network blip while READING the
            // response looks identical to one on the request itself; retrying could silently
            // double-apply the recharge/withdraw. Treat any failure here as "unconfirmed" and
            // let the caller's own refund-on-failure (recharge) / never-credit-on-failure
            // (redeem) logic handle it safely instead.
            $res = $this->retryRequest($url, fn ($attempt) => [
                'POST', $attempt % 2 === 0 ? 'multipart' : 'urlencoded', $fields, $token,
            ], attempts: 1);
            return $this->wrapMutationResult($res, $start);
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'data' => null, 'raw' => null,
                'error' => $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    private function wrapMutationResult(array $res, float $start): array
    {
        $ok = $res['ok'] && $this->isSuccessEnvelope($res['body']);
        return [
            'success' => $ok,
            'http_status' => $res['status'],
            'data' => $ok ? ($res['body']['data'] ?? null) : null,
            'raw' => $res['body'],
            'error' => $ok ? null : $this->envelopeMessage($res['body']),
            'duration_ms' => (int) ((microtime(true) - $start) * 1000),
        ];
    }
}
