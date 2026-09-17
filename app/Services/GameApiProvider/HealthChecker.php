<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\Protocols\ProtocolResolver;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Bulk reachability probe used for the Providers-tab status badges.
 * Ported from supabase/functions/provider-health/index.ts — its own
 * minimal one-shot client (distinct from ProviderHttpClient's agentLogin
 * retry ladder), because it must honor the provider's configurable
 * request_method/content_type/custom_headers/proxy_url.
 *
 * Only the "agent_login" protocol supports that per-request configurability
 * (format probing, proxying, custom headers) — every other protocol
 * ("external_signed", "orion_stars_signed", "fast_api_signed",
 * "river_pay_simple", and any future addition) has a fixed, documented
 * request shape of its own, so those are all checked via a single
 * protocol-level testConnection() call instead (see checkOneViaProtocol).
 */
class HealthChecker
{
    public function __construct(
        private ProviderPasswordResolver $passwords,
        private ProviderHttpClient $http,
        private ApiLogger $logger,
        private ProtocolResolver $protocols,
    ) {
    }

    public function checkAllActive(?string $contentTypeOverride = null, bool $dryRun = false): array
    {
        return GameApiProvider::where('is_active', true)->get()
            ->map(fn (GameApiProvider $p) => $this->checkOne($p, $contentTypeOverride, $dryRun))
            ->values()->all();
    }

    public function checkOne(GameApiProvider $provider, ?string $contentTypeOverride = null, bool $dryRun = false): array
    {
        if (!$provider->is_active) {
            return $this->finish($provider, 'manual_mode',
                'Provider automation is off — all requests stay in manual processing.', null, null, $dryRun);
        }

        $password = $this->passwords->resolve($provider);
        if (!$password) {
            $message = 'Agent password is not set for this provider.' . ErrorClassifier::HELPER_HINT;
            if (!$dryRun) {
                $this->logger->log([
                    'provider_id' => $provider->id,
                    'provider_name' => $provider->name,
                    'action' => 'agent_login',
                    'endpoint' => null,
                    'request_payload' => ['agent_username' => $provider->agent_username],
                    'response_payload' => null,
                    'http_status' => null,
                    'success' => false,
                    'error_message' => $message,
                    'duration_ms' => null,
                ]);
            }

            return $this->finish($provider, 'missing_secret', $message, null, null, $dryRun);
        }

        if ($provider->protocol !== 'agent_login') {
            return $this->checkOneViaProtocol($provider, $password, $dryRun);
        }

        $contentType = $contentTypeOverride ?: $provider->request_content_type;
        $method = strtoupper($provider->request_method ?: 'POST');
        $path = $provider->health_check_path ?: '/api/agent/login';
        $url = $this->http->providerUrl($provider, $path);
        if (!empty($provider->proxy_url)) {
            $url = rtrim($provider->proxy_url, '/') . '/' . urlencode($url);
        }

        $headers = [];
        foreach ((array) ($provider->custom_headers ?? []) as $k => $v) {
            if (!in_array(strtolower($k), ['authorization', 'cookie'], true)) {
                $headers[$k] = $v;
            }
        }

        $fields = ['username' => $provider->agent_username, 'password' => $password];
        $start = microtime(true);
        $attempted = 0;
        $lastErr = null;
        $result = null;

        for ($attempt = 0; $attempt < 2; $attempt++) {
            $attempted++;
            if ($attempt > 0) {
                usleep(400_000);
            }
            try {
                $req = Http::withHeaders($headers)->timeout(15);
                if ($contentType === 'application/json') {
                    $response = $method === 'GET' ? $req->get($url, $fields) : $req->asJson()->post($url, $fields);
                } elseif ($contentType === 'multipart/form-data') {
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
                    $body = ['raw_text' => substr($response->body(), 0, 500)];
                }
                $result = ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $body];
                $lastErr = null;
                break;
            } catch (Throwable $e) {
                $lastErr = $e->getMessage();
                if (!$this->http->isTransient($lastErr)) {
                    break;
                }
            }
        }

        $latencyMs = (int) ((microtime(true) - $start) * 1000);

        $endpointLog = fn (string $status, string $message, ?int $httpStatus) =>
            $this->logger->log([
                'provider_id' => $provider->id,
                'provider_name' => $provider->name,
                'action' => 'agent_login',
                'endpoint' => $path,
                'request_payload' => ['username' => $provider->agent_username, 'retry_count' => $attempted - 1],
                'response_payload' => $result['body'] ?? null,
                'http_status' => $httpStatus,
                'success' => $status === 'connected',
                'error_message' => $status === 'connected' ? null : $message,
                'duration_ms' => $latencyMs,
            ]);

        if ($lastErr !== null) {
            $friendly = ErrorClassifier::friendly($lastErr) . ErrorClassifier::HELPER_HINT;
            $consecutive = ($provider->consecutive_failures ?? 0) + 1;
            $status = $consecutive >= 3 ? 'needs_attention' : 'unstable';
            $endpointLog($status, $friendly, null);
            return $this->finish($provider, $status, $friendly, $latencyMs, $consecutive, $dryRun, null, 'NETWORK', $lastErr);
        }

        $ok = $result['ok'] && $this->http->isSuccessEnvelope($result['body']);
        if (in_array($result['status'], [401, 403], true)) {
            $msg = ErrorClassifier::friendly((string) $result['status']) . ErrorClassifier::HELPER_HINT;
            $consecutive = ($provider->consecutive_failures ?? 0) + 1;
            $status = $consecutive >= 3 ? 'needs_attention' : 'unstable';
            $endpointLog($status, $msg, $result['status']);
            return $this->finish($provider, $status, $msg, $latencyMs, $consecutive, $dryRun, $result['status'], (string) $result['status'], $msg);
        }

        if (!$ok) {
            $raw = $this->http->envelopeMessage($result['body']);
            $friendly = ErrorClassifier::friendly((string) $result['status']) . ErrorClassifier::HELPER_HINT;
            $consecutive = ($provider->consecutive_failures ?? 0) + 1;
            $status = $consecutive >= 3 ? 'needs_attention' : 'unstable';
            $endpointLog($status, $friendly, $result['status']);
            return $this->finish($provider, $status, $friendly, $latencyMs, $consecutive, $dryRun, $result['status'], (string) $result['status'], $raw);
        }

        $message = empty($provider->health_check_path)
            ? 'Connected, but no health check path is configured.'
            : "Provider is responding normally ({$latencyMs}ms).";
        $endpointLog('connected', $message, $result['status']);
        return $this->finish($provider, 'connected', $message, $latencyMs, 0, $dryRun, $result['status']);
    }

    private function checkOneViaProtocol(GameApiProvider $provider, string $secret, bool $dryRun): array
    {
        $result = $this->protocols->resolve($provider)->testConnection($provider, $secret);

        $this->logger->log([
            'provider_id' => $provider->id,
            'provider_name' => $provider->name,
            'action' => 'agent_login',
            'endpoint' => null,
            'request_payload' => ['agent_username' => $provider->agent_username],
            'response_payload' => $result['raw'],
            'http_status' => $result['http_status'],
            'success' => $result['success'],
            'error_message' => $result['error'],
            'duration_ms' => $result['duration_ms'],
        ]);

        if ($result['success']) {
            $message = "Provider is responding normally ({$result['duration_ms']}ms).";
            return $this->finish($provider, 'connected', $message, $result['duration_ms'], 0, $dryRun, $result['http_status']);
        }

        $friendly = ErrorClassifier::friendly($result['error']) . ErrorClassifier::HELPER_HINT;
        $consecutive = ($provider->consecutive_failures ?? 0) + 1;
        $status = $consecutive >= 3 ? 'needs_attention' : 'unstable';

        return $this->finish(
            $provider, $status, $friendly, $result['duration_ms'], $consecutive, $dryRun,
            $result['http_status'], (string) $result['http_status'], $result['error']
        );
    }

    private function finish(
        GameApiProvider $provider,
        string $status,
        string $message,
        ?int $latencyMs,
        ?int $consecutiveFailures,
        bool $dryRun,
        ?int $httpStatus = null,
        ?string $errorCode = null,
        ?string $errorSummary = null,
    ): array {
        $now = now();

        if (!$dryRun) {
            $updates = [
                'last_health_status' => $status,
                'last_health_message' => $message,
                'last_health_latency_ms' => $latencyMs,
                'last_health_checked_at' => $now,
            ];
            if ($status === 'connected') {
                $updates['consecutive_failures'] = 0;
                $updates['last_success_at'] = $now;
            } elseif (in_array($status, ['unstable', 'needs_attention'], true)) {
                $updates['consecutive_failures'] = $consecutiveFailures ?? (($provider->consecutive_failures ?? 0) + 1);
                $updates['last_failure_at'] = $now;
                $updates['last_error_code'] = $errorCode;
                $updates['last_error_summary'] = $errorSummary;
            }
            $provider->update($updates);
        }

        return [
            'provider_id' => $provider->id,
            'provider_name' => $provider->name,
            'status' => $status,
            'message' => $message,
            'latency_ms' => $latencyMs,
            'checked_at' => $now->toIso8601String(),
            'consecutive_failures' => $consecutiveFailures,
            'success' => in_array($status, ['connected', 'manual_mode'], true),
            'dry_run' => $dryRun,
            'http_status' => $httpStatus,
        ];
    }
}
