<?php

namespace App\Services;

use App\Models\FastPaymentApiLog;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Client for the "FAST Payment" automated deposit gateway — DollarPayWallet / Kashuuu, see
 * API-Documentation(kashuuu).pdf. Deliberately named "FastPaymentService", not
 * "FastApiService" — that class already exists in this codebase for a completely unrelated
 * legacy Game API provider; do not confuse the two.
 *
 * Handles ONLY the Payin (deposit) and Payment Query interfaces (§1.1.2/§1.1.3 of the doc) —
 * the Cashapp/Chime Payout, payout-query/cancel/reissue, and balance-inquiry interfaces
 * (§1.1.4-1.1.9) are withdrawal/payout features, out of scope for this deposit integration.
 *
 * Signature rule (§1.1.1, confirmed against the live test API): take every param except
 * "sign", sort keys ascending, join as "k=v&k=v...", append "&key={merchant_key}", then
 * strtoupper(md5(...)). The exact same rule verifies an inbound response/webhook — confirmed
 * by reproducing a real API response's sign byte-for-byte during development.
 *
 * Base URL: two different vendor-issued docs exist for this same gateway, each naming a
 * different host (mh.dollarpaywallet.com vs merchant.kashuuu.com) with its own separate set of
 * test credentials — live debugging confirmed merchant.kashuuu.com is the one this account is
 * actually provisioned on (a /api/pay/balance call there returns a real balance for that
 * account's test credentials; the other host returns "the merchant ID does not exist" for
 * every credential tried). Always admin-configurable via Site Settings regardless — this
 * constant is only the fallback when that field is left empty.
 */
class FastPaymentService
{
    private const DEFAULT_BASE_URL = 'https://merchant.kashuuu.com';

    /** is_pay values per §1.1.2 — 1:Cashpay, 2:Applepay, 3:Googlepay. */
    public const PROVIDER_CODES = [
        'cashapp' => '1',
        'applepay' => '2',
        'googlepay' => '3',
    ];

    /**
     * The exact, fixed set of amounts the gateway's "Institutional Account" accepts (§1.1.2)
     * — not a $4.99-$499.99 *range*, a specific list. The backend must reject anything not in
     * this list regardless of what the frontend sends.
     */
    public const SUPPORTED_AMOUNTS = [
        4.99, 5.99, 6.99, 7.99, 8.99, 9.99, 10.99, 11.99, 12.99, 13.99, 14.99,
        17.99, 19.99, 24.99, 29.99, 30.99, 39.99, 49.99, 59.99, 99.99,
        124.99, 129.99, 149.99, 199.99, 249.99, 299.99, 399.99, 499.99,
    ];

    public static function isAmountSupported(float $amount): bool
    {
        foreach (self::SUPPORTED_AMOUNTS as $allowed) {
            if (abs($allowed - $amount) < 0.001) {
                return true;
            }
        }

        return false;
    }

    /**
     * §1.1.2 Payin — creates a payment session and returns a pay_url to redirect the user to.
     * Never throws; check ['success'] before trusting the rest.
     */
    public static function createPayment(array $args): array
    {
        // $args: order_sn, user_name, provider (cashapp|applepay|googlepay), amount,
        // notify_url, ip (optional), device_id (optional), user_id (optional — internal id,
        // for logging only; never sent to the gateway, never part of the signed payload)
        $params = array_filter([
            'order_sn' => $args['order_sn'],
            'user_name' => $args['user_name'],
            'is_cash' => '1', // "Institutional accounts" — the only documented value.
            'is_pay' => self::PROVIDER_CODES[$args['provider']] ?? null,
            'amount' => number_format((float) $args['amount'], 2, '.', ''),
            'notify_url' => $args['notify_url'],
            'ip' => $args['ip'] ?? null,
            'device_id' => $args['device_id'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');

        // No automatic retry here — this creates a new payment session on the gateway's side
        // and there is no documented guarantee that resubmitting the same order_sn is a no-op
        // rather than a second attempt. A failure here is surfaced as-is; the caller (never
        // this service) decides whether the user gets to try again with a fresh order_sn.
        return self::call('create_payment', '/api/payment/pay', $params, ['user_id' => $args['user_id'] ?? null]);
    }

    /**
     * §1.1.3 Payment Order Query — read-only status check, used both as a fallback when a
     * webhook may have been missed and by the reconciliation command. Safe to retry: querying
     * twice has no side effect on the gateway, so a couple of retries on a transient network
     * failure (not a clean HTTP error response) only costs time, never correctness.
     */
    public static function queryPayment(string $outerOrderSn, ?int $userId = null): array
    {
        return self::call('query_payment', '/api/payment/query', ['outer_order_sn' => $outerOrderSn], ['user_id' => $userId], retries: 2);
    }

    /**
     * Verifies an inbound response/webhook's own "sign" field against what we'd compute
     * ourselves — the ONLY thing that makes a "payment succeeded" notification trustworthy.
     * A payload with no "sign" field, or one that doesn't match, is never valid.
     */
    public static function verifySignature(array $payload): bool
    {
        if (empty($payload['sign'])) {
            return false;
        }
        $key = self::credentials()[1] ?? null;
        if (!$key) {
            return false;
        }

        $expected = self::sign($payload, $key);

        return hash_equals($expected, strtoupper((string) $payload['sign']));
    }

    public static function sign(array $params, string $key): string
    {
        unset($params['sign']);
        ksort($params);

        $parts = [];
        foreach ($params as $k => $v) {
            $parts[] = "{$k}={$v}";
        }
        $parts[] = "key={$key}";

        return strtoupper(md5(implode('&', $parts)));
    }

    /** @return array{0: ?string, 1: ?string, 2: ?string} [base_url, key, merchant_id] */
    public static function credentials(): array
    {
        $settings = SiteSetting::first();

        return [
            $settings?->fast_payment_base_url ?: self::DEFAULT_BASE_URL,
            $settings?->fast_payment_key ?: null,
            $settings?->fast_payment_merchant_id ?: null,
        ];
    }

    private static function call(string $action, string $path, array $params, array $context = [], int $retries = 0): array
    {
        [$baseUrl, $key, $merchantId] = self::credentials();
        $start = microtime(true);

        if (!$key || !$merchantId) {
            $result = ['success' => false, 'error' => 'FAST Payment is not configured (missing Merchant ID or Key in Admin > Site Settings).'];
            self::log($action, $params, $result, $context);

            return $result;
        }

        // Every field in the doc's own tables (§1.1.2/§1.1.3) is typed "String" — merchant_id is
        // already a plain string end to end here (SiteSetting::fast_payment_merchant_id is a
        // varchar column, never cast to int in the model), and Http::asForm() serializes
        // everything as form-urlencoded text regardless either way — but cast explicitly so
        // there's no ambiguity if that ever changes.
        $params['merchant_id'] = (string) $merchantId;
        $params['sign'] = self::sign($params, $key);

        try {
            $request = Http::asForm()->timeout(20);
            if ($retries > 0) {
                // Laravel's retry() only RETRIES on a genuine connection-level failure (timeout,
                // DNS, refused) by default — never on a clean non-2xx HTTP response — so this
                // only helps with the exact "transient network blip" case it's meant for.
                // throw:false is required so a final non-2xx response still comes back as a
                // normal $response the code below can inspect, instead of a thrown exception.
                $request = $request->retry($retries, 500, throw: false);
            }
            $response = $request->post(rtrim($baseUrl, '/') . $path, $params);
            $durationMs = (int) ((microtime(true) - $start) * 1000);
            $body = $response->json();
            $httpStatus = $response->status();

            if (!is_array($body) || !isset($body['status'])) {
                $result = ['success' => false, 'error' => "FAST Payment returned an unexpected response (HTTP {$httpStatus}).", 'raw' => $body, 'duration_ms' => $durationMs, 'http_status' => $httpStatus];
                self::log($action, $params, $result, $context);

                return $result;
            }

            $success = $body['status'] === '00000';
            $result = [
                'success' => $success,
                'error' => $success ? null : ($body['msg'] ?? 'FAST Payment request failed.'),
                'body' => $body,
                'duration_ms' => $durationMs,
                'http_status' => $httpStatus,
                'signature_valid' => self::verifySignature($body),
            ];
            self::log($action, $params, $result, $context);

            return $result;
        } catch (Throwable $e) {
            $result = ['success' => false, 'error' => 'FAST Payment request failed: ' . $e->getMessage(), 'duration_ms' => (int) ((microtime(true) - $start) * 1000)];
            self::log($action, $params, $result, $context);

            return $result;
        }
    }

    private static function log(string $action, array $requestPayload, array $result, array $context = []): void
    {
        // Never persist the merchant key/sign in the audit log (sign is a computed hash, not a
        // secret, but stripping it keeps the logged payload exactly what was signed over).
        unset($requestPayload['sign']);

        $body = $result['body'] ?? $result['raw'] ?? null;
        $providerReference = $body['transaction_id'] ?? $requestPayload['order_sn'] ?? null;

        FastPaymentApiLog::create([
            'provider' => 'FAST Payment',
            'user_id' => $context['user_id'] ?? null,
            'provider_reference' => $providerReference,
            'http_status' => $result['http_status'] ?? null,
            'action' => $action,
            'request_payload' => PayloadSanitizer::sanitize($requestPayload),
            'response_payload' => PayloadSanitizer::sanitize($body),
            'signature_valid' => $result['signature_valid'] ?? null,
            'success' => $result['success'] ?? false,
            'error_message' => $result['error'] ?? null,
            'duration_ms' => $result['duration_ms'] ?? null,
            'created_at' => now(),
        ]);
    }
}
