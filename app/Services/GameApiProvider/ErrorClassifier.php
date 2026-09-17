<?php

namespace App\Services\GameApiProvider;

/**
 * Converts raw network/HTTP error text into admin-friendly sentences.
 * Ported from AdminGameApi.tsx's friendlyErrorMessage()/isNetworkError() —
 * kept here too so server-persisted health messages match what the UI
 * would have shown if it classified the same raw string.
 *
 * Beyond the original's network/TLS/HTTP-status classification, this also
 * recognizes common gaming-panel *business* error text (wrong credentials,
 * provider-side rate limiting, unknown account, etc) — real providers like
 * gameroom777 answer with HTTP 200 and the real reason inside the JSON
 * body, so a plain 401/403/5xx check alone leaves admins with a useless
 * "temporarily unavailable" message when the actual problem is a typo'd
 * password or a rate limit that will lift on its own.
 */
class ErrorClassifier
{
    public const HELPER_HINT = ' If this continues failing, confirm the provider API URL, request format, and whitelist the server IP.';

    public static function friendly(?string $raw): string
    {
        if (!$raw) {
            return 'Connection test failed. The provider may be temporarily unavailable.';
        }
        $msg = strtolower($raw);

        // --- Network / transport failures ---
        if (str_contains($msg, 'rustls') || str_contains($msg, 'close_notify') || str_contains($msg, 'unexpected eof')
            || str_contains($msg, 'peer closed') || str_contains($msg, 'connection closed')) {
            return 'Provider did not respond — the connection was closed before completion.';
        }
        if (str_contains($msg, 'timeout') || str_contains($msg, 'timed out')) {
            return 'Provider did not respond in time.';
        }
        if (str_contains($msg, 'enotfound') || str_contains($msg, 'getaddrinfo') || str_contains($msg, 'dns')
            || str_contains($msg, 'could not resolve')) {
            return 'Provider host could not be resolved. Double-check the base URL.';
        }
        if (str_contains($msg, 'econnrefused') || str_contains($msg, 'connection refused')) {
            return 'Provider refused the connection.';
        }
        if (str_contains($msg, 'econnreset')) {
            return 'Provider reset the connection.';
        }
        if (str_contains($msg, 'tls') || str_contains($msg, 'ssl') || str_contains($msg, 'handshake') || str_contains($msg, 'certificate')) {
            return 'Secure connection to the provider could not be established.';
        }

        // --- Credential / configuration problems ---
        if (str_contains($msg, 'agent password not set') || str_contains($msg, 'not set. add it')) {
            return 'Agent password is not set for this provider.';
        }
        if (str_contains($msg, 'username or password error') || str_contains($msg, 'account or password')
            || (str_contains($msg, 'password') && str_contains($msg, 'error')) || str_contains($msg, 'invalid credentials')
            || str_contains($msg, 'incorrect password')) {
            return 'Provider rejected the agent username or password. Update the password on this provider (Providers tab → Update password) and try again.';
        }
        if (str_contains($msg, 'account not exist') || str_contains($msg, 'account does not exist')
            || str_contains($msg, 'no such account') || str_contains($msg, 'user not found') || str_contains($msg, 'agent not found')) {
            return 'Provider does not recognize this agent username. Confirm it with the provider.';
        }

        // --- Provider-side rate limiting / lockout ---
        if (str_contains($msg, 'too many login errors') || str_contains($msg, 'too many attempts')
            || str_contains($msg, 'try again in') || str_contains($msg, 'temporarily locked') || str_contains($msg, 'account locked')
            || str_contains($msg, 'rate limit')) {
            return 'Provider is temporarily rate-limiting login attempts after repeated failures. Wait before retrying — retrying immediately will not help.';
        }

        // --- Player/account business errors (createPlayer, recharge, withdraw, etc) ---
        if (str_contains($msg, 'already exist') || str_contains($msg, 'duplicate')) {
            return 'Provider reports this player/account already exists.';
        }
        if (str_contains($msg, 'insufficient')
            || (str_contains($msg, 'greater than') && str_contains($msg, 'balance'))
            || (str_contains($msg, 'exceed') && str_contains($msg, 'balance'))) {
            return 'The requested amount is more than the player\'s actual balance on the provider\'s side. Ask the player to confirm their real in-game balance and try a smaller amount.';
        }

        // --- Specific "agent777"-style provider codes seen in practice (found via live
        // debugging this integration) — the generic "(code N)" fallback further below still
        // strips these to a bare, unhelpful phrase; naming the two most common ones explicitly
        // saves an admin a support ticket / database dig every time they recur. ---
        if (str_contains($msg, 'invalid request parameters') && str_contains($msg, 'code 2')) {
            return 'Provider rejected the request as malformed (code 2) — almost always a wrong Agent Username (typo, or a copy-pasted extra space) or the wrong Base URL for this provider. Re-check both against the provider\'s own agent panel.';
        }
        if (str_contains($msg, 'invalid token') && str_contains($msg, 'code 3')) {
            return 'Provider rejected the login token immediately after issuing it (code 3). This is usually a temporary provider-side issue and can be retried; if it keeps happening, confirm this server\'s IP is whitelisted with the provider.';
        }

        // --- HTTP-status-driven failures ---
        if (str_contains($msg, '401') || str_contains($msg, 'unauthorized')) {
            return 'Provider rejected the credentials.';
        }
        if (str_contains($msg, '403') || str_contains($msg, 'forbidden')) {
            return 'Provider blocked the request. If the provider requires IP whitelisting, confirm the server IP is approved.';
        }
        if (str_contains($msg, '500') || str_contains($msg, '502') || str_contains($msg, '503') || str_contains($msg, '504')) {
            return 'Provider is reporting an internal error.';
        }

        // --- Fallback: surface the provider's own message text instead of a dead-end sentence ---
        // ExternalSignedProtocol formats errors as "<curated meaning> (code
        // <N>)" straight from the provider's own status code dictionary —
        // that text is already admin-friendly, so use it directly.
        if (preg_match('/^(.+?)\s\(code\s\d+\)$/i', trim($raw), $m1)) {
            return trim($m1[1]);
        }
        // Our own agentLogin()/HealthChecker wrap failures as
        // "... HTTP <status> <message> ..." — pull that inner message out
        // when nothing more specific matched, rather than a generic
        // "temporarily unavailable" that leaves the admin no wiser.
        if (preg_match('/HTTP\s+\d+\s+([^.()]+)/i', $raw, $m2)) {
            $inner = trim($m2[1]);
            if ($inner !== '' && strlen($inner) < 120) {
                return "Provider says: \"{$inner}\"";
            }
        }

        return 'Connection test failed. The provider may be temporarily unavailable or blocking requests.';
    }

    public static function isNetworkError(?string $raw): bool
    {
        if (!$raw) {
            return false;
        }
        $m = strtolower($raw);
        foreach ([
            'rustls', 'tls', 'ssl', 'close_notify', 'unexpected eof', 'peer closed', 'connection closed',
            'econnreset', 'timeout', 'timed out', 'enotfound', 'getaddrinfo', 'dns', 'econnrefused',
            'connection refused', 'network', 'fetch failed',
        ] as $needle) {
            if (str_contains($m, $needle)) {
                return true;
            }
        }
        return false;
    }
}
