<?php

namespace App\Services;

/**
 * Shared redaction used before ANY request/response payload is written to an API log table
 * (game_api_logs, ghl_api_logs, fast_payment_api_logs) — one place so all three logging paths
 * apply the same rule instead of each maintaining its own ad-hoc list. Recurses into nested
 * arrays; list arrays (numeric-indexed) are walked without treating their indexes as keys.
 *
 * Matches by exact key name (case-insensitive) for known field names, PLUS substring match on
 * "password"/"secret"/"token" so variants no one has thought to list explicitly — agent_key,
 * access_token, client_secret, refresh_token, whatever the next provider calls it — still get
 * caught rather than silently slipping through.
 */
class PayloadSanitizer
{
    private const SENSITIVE_SUBSTRINGS = ['password', 'secret', 'token'];

    private const SENSITIVE_EXACT = [
        'authorization', 'apikey', 'api_key', 'agentkey', 'agent_key', 'key',
        'merchant_key', 'private_key', 'signing_key', 'pin',
        // Full sensitive payment information — never belongs in a log even if a future
        // provider integration (e.g. a payout/bank-transfer interface) starts sending it.
        'card_number', 'cvv', 'cvc', 'account_number', 'routing_number', 'ssn',
    ];

    public static function sanitize(mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }
        if (is_array($value)) {
            $isList = array_is_list($value);
            $out = [];
            foreach ($value as $k => $v) {
                if (!$isList && is_string($k) && self::isSensitiveKey($k)) {
                    $out[$k] = '[REDACTED]';
                } else {
                    $out[$k] = self::sanitize($v);
                }
            }

            return $out;
        }

        return $value;
    }

    private static function isSensitiveKey(string $key): bool
    {
        $k = strtolower($key);
        if (in_array($k, self::SENSITIVE_EXACT, true)) {
            return true;
        }
        foreach (self::SENSITIVE_SUBSTRINGS as $needle) {
            if (str_contains($k, $needle)) {
                return true;
            }
        }

        return false;
    }
}
