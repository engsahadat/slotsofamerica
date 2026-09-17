<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiProvider;
use App\Services\GameApiProvider\Protocols\ProtocolResolver;
use Carbon\Carbon;

/**
 * "Run Safe Test" — full provisioning smoke test that never touches money.
 * Ported from supabase/functions/provider-e2e-test/index.ts.
 *
 * Talks to providers only through ProtocolResolver, so this runs the same
 * for "agent_login" providers (auth is an internal detail of createPlayer)
 * and "external_signed" providers (no separate login step at all) — that's
 * also why there's no standalone "Agent login" step here anymore: an auth
 * failure now surfaces as the "Create sample player" step failing, with
 * the real reason (wrong password / invalid token / etc) in its message.
 */
class E2eTester
{
    public function __construct(
        private ProviderPasswordResolver $passwords,
        private ProviderHttpClient $http,
        private ApiLogger $logger,
        private ProtocolResolver $protocols,
    ) {
    }

    public function run(GameApiProvider $provider): array
    {
        $steps = [];
        $log = fn (string $action, array $entry) => $this->logger->log(array_merge([
            'provider_id' => $provider->id,
            'provider_name' => $provider->name,
            'action' => "e2e_{$action}",
        ], $entry));

        if (!$provider->is_active) {
            return $this->result(false, 'skipped', 'Provider inactive.', null, null, null, null, [], $steps);
        }

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            $steps[] = $this->step('Agent password', false, 'Agent password is not set for this provider.');
            return $this->result(false, 'failed', 'Agent password is not set.', null, null, null, null, [], $steps);
        }

        $protocol = $this->protocols->resolve($provider);

        // Step 1 — create sample player (this is also where auth happens
        // for "agent_login" providers — an invalid password surfaces here).
        // Alphanumeric only, no separators, capped at 20 chars — several
        // real providers (e.g. gameroom777) reject usernames/nicknames
        // with underscores or over ~20 characters, so the generated test
        // identifier has to satisfy the strictest of them, not just be
        // "clearly a test account".
        $username = 'TEST' . substr(base_convert((string) (int) (microtime(true) * 1000), 10, 36) . strtolower(substr(bin2hex(random_bytes(4)), 0, 6)), 0, 16);
        $testPassword = $this->http->randomPassword(10);
        $create = $protocol->createPlayer($provider, $secret, [
            'username' => $username, 'nickname' => $username, 'password' => $testPassword, 'money' => 0,
        ]);
        $log('create_player', [
            'request_payload' => ['username' => $username, 'nickname' => $username],
            'response_payload' => $create['raw'],
            'http_status' => $create['http_status'],
            'success' => $create['success'],
            'error_message' => $create['error'],
            'duration_ms' => $create['duration_ms'],
        ]);

        if (!$create['success']) {
            $steps[] = $this->step('Create sample player', false, $create['error'] ?? 'Create failed', $create['duration_ms']);
            $steps[] = $this->step('Verify player listed', false, 'Skipped — account creation failed.');
            $steps[] = $this->step('Balance check', false, 'Skipped — account creation failed.');
            $steps[] = $this->step('Money automation', true, 'Skipped on purpose — money automation is disabled in safe mode.');
            $overall = ErrorClassifier::isNetworkError($create['error']) ? 'login_blocked' : 'failed';
            return $this->result(false, $overall, $create['error'] ?? 'Account creation failed', $username, null, null, null, [], $steps);
        }
        $steps[] = $this->step('Create sample player', true, "Player '{$username}' created.", $create['duration_ms']);

        // Step 2 — verify listed
        $find = $protocol->findPlayerIdByUsername($provider, $secret, $username);
        $log('player_list', [
            'request_payload' => ['username' => $username],
            'response_payload' => $find['raw'] ?? null,
            'http_status' => $find['http_status'],
            'success' => $find['success'],
            'error_message' => $find['error'],
            'duration_ms' => $find['duration_ms'],
        ]);
        $playerId = $find['data']['id'] ?? null;
        $step3Ok = $find['success'] && $playerId !== null;
        $steps[] = $this->step('Verify player listed', $step3Ok, $step3Ok ? "Found player id={$playerId}." : ($find['error'] ?? 'Player not found on provider.'), $find['duration_ms']);

        // Step 3 — balance check
        $balance = null;
        $step4Ok = false;
        if ($playerId !== null) {
            $score = $protocol->getScore($provider, $secret, $playerId);
            $log('get_score', [
                'request_payload' => ['id' => $playerId],
                'response_payload' => $score['raw'],
                'http_status' => $score['http_status'],
                'success' => $score['success'],
                'error_message' => $score['error'],
                'duration_ms' => $score['duration_ms'],
            ]);
            $step4Ok = $score['success'];
            $balance = $score['data']['balance'] ?? null;
            $steps[] = $this->step('Balance check', $step4Ok, $step4Ok ? "Balance: {$balance}." : ($score['error'] ?? 'Balance check failed.'), $score['duration_ms']);
        } else {
            $steps[] = $this->step('Balance check', false, 'Skipped — player id unknown.');
        }

        $steps[] = $this->step('Money automation', true, 'Skipped on purpose — money automation is disabled in safe mode.');

        $overall = ($step3Ok && $step4Ok) ? 'passed' : 'account_creation_working';
        $message = $overall === 'passed'
            ? 'End-to-end test passed.'
            : 'Account creation works — a follow-up read failed. Manual fallback remains active.';

        return $this->result($overall === 'passed', $overall, $message, $username, $testPassword, $playerId, $balance, [], $steps);
    }

    private function step(string $step, bool $success, string $message, ?int $latencyMs = null): array
    {
        return ['step' => $step, 'success' => $success, 'message' => $message, 'latency_ms' => $latencyMs];
    }

    private function result(bool $success, string $overallStatus, string $message, ?string $username, ?string $password, $playerId, $balance, array $extra, array $steps): array
    {
        return [
            'success' => $success,
            'overall_status' => $overallStatus,
            'message' => $message,
            'username' => $username,
            'password' => $password,
            'player_id' => $playerId,
            'balance' => $balance,
            'steps' => $steps,
            'ran_at' => Carbon::now()->toIso8601String(),
        ];
    }
}
