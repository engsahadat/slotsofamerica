<?php

namespace App\Services;

use App\Models\GhlApiLog;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\PayloadSanitizer;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Syncs local user profile data to a GoHighLevel (GHL) sub-account as a Contact — customer
 * profile fields only (name, email, phone, username, signup date), per the "GoHighLevel
 * Contact Integration" scope: transactions, game accounts, balances, and conversations are
 * deliberately never sent here.
 *
 * Every public method returns ['success'=>bool, 'contact_id'=>?string, 'error'=>?string] and
 * NEVER throws — callers (registration, profile updates) must never have a GHL outage break
 * their own flow. Every attempt is logged to ghl_api_logs regardless of outcome.
 *
 * Auth: a GHL "Private Integration Token" (starts with "pit-"), stored as
 * SiteSetting::ghl_api_key, used as a plain Bearer token — see
 * https://marketplace.gohighlevel.com/docs (Contacts / Authorization). Location-scoped API,
 * so SiteSetting::ghl_location_id must also be set (Admin > Site Settings > API Keys &
 * Secrets); found in the GHL dashboard's URL while viewing the sub-account
 * (.../location/{LOCATION_ID}/...) or under Settings > Business Profile.
 */
class GoHighLevelService
{
    private const BASE_URL = 'https://services.leadconnectorhq.com';
    private const API_VERSION = '2021-07-28';

    /**
     * Create-or-update this user's GHL contact. Prefers a direct update against the
     * previously-stored ghl_contact_id (cheapest, most precise); if that ID no longer exists
     * on GHL's side (404 — e.g. deleted there), self-heals by falling through to an
     * email/phone-matched upsert instead of ever giving up or duplicating.
     */
    public static function syncUser(User $user): array
    {
        [$apiKey, $locationId] = self::credentials();
        if (!$apiKey || !$locationId) {
            $error = 'GoHighLevel is not configured (missing API key or Location ID in Admin > Site Settings).';
            self::log($user, 'upsert_contact', ['success' => false, 'error' => $error], []);

            return ['success' => false, 'contact_id' => null, 'error' => $error];
        }

        $payload = self::buildPayload($user, $locationId);

        if (!empty($user->ghl_contact_id)) {
            // Confirmed against the live API: PUT /contacts/{id} rejects the request outright
            // ("property locationId should not exist") if locationId is present — unlike
            // POST /contacts/upsert, which requires it. The contact's location can't change
            // via this endpoint anyway, so it's simply dropped for the update call.
            $updatePayload = collect($payload)->except('locationId')->all();
            $updateResult = self::call('PUT', "/contacts/{$user->ghl_contact_id}", $updatePayload);
            self::log($user, 'update_contact', $updateResult, $updatePayload);

            if ($updateResult['success']) {
                return ['success' => true, 'contact_id' => $user->ghl_contact_id, 'error' => null];
            }
            if ($updateResult['http_status'] !== 404) {
                // A real failure (auth, validation, network) — don't mask it by silently
                // trying upsert too; report it as-is so it's visible in the logs/admin.
                return ['success' => false, 'contact_id' => null, 'error' => $updateResult['error']];
            }
            // 404 — the stored contact no longer exists on GHL's side. Clear it and fall
            // through to upsert-by-email/phone below, which will create a fresh one.
            $user->ghl_contact_id = null;
        }

        $upsertResult = self::call('POST', '/contacts/upsert', $payload);
        self::log($user, 'upsert_contact', $upsertResult, $payload);

        if (!$upsertResult['success']) {
            return ['success' => false, 'contact_id' => null, 'error' => $upsertResult['error']];
        }

        $contactId = $upsertResult['body']['contact']['id'] ?? null;
        if ($contactId) {
            $user->ghl_contact_id = $contactId;
            $user->save();
        }

        return ['success' => true, 'contact_id' => $contactId, 'error' => null];
    }

    /** @return array{0: ?string, 1: ?string} [api_key, location_id] */
    private static function credentials(): array
    {
        $settings = SiteSetting::first();

        return [$settings?->ghl_api_key ?: null, $settings?->ghl_location_id ?: null];
    }

    private static function buildPayload(User $user, string $locationId): array
    {
        [$firstName, $lastName] = self::splitName((string) ($user->name ?? ''));

        return array_filter([
            'locationId' => $locationId,
            'firstName' => $firstName ?: null,
            'lastName' => $lastName ?: null,
            'name' => $user->name ?: null,
            'email' => $user->email ?: null,
            'phone' => $user->phone ?: null,
            'source' => 'Horizon Players Room',
            'tags' => array_values(array_filter([
                'site-user-id:' . $user->id,
                $user->username ? 'site-username:' . $user->username : null,
                $user->created_at ? 'signup-date:' . $user->created_at->format('Y-m-d') : null,
            ])),
        ], fn ($v) => $v !== null && $v !== '');
    }

    /** @return array{0: string, 1: string} [firstName, lastName] */
    private static function splitName(string $fullName): array
    {
        $parts = preg_split('/\s+/', trim($fullName), 2);

        return [$parts[0] ?? '', $parts[1] ?? ''];
    }

    /**
     * Raw HTTP call — never throws, always returns a uniform result shape so callers don't
     * need their own try/catch around every request. Both the PUT update and the POST
     * upsert are idempotent (create-or-update by definition), so a couple of retries on a
     * genuine transient network failure — never on a clean HTTP error response — is safe: a
     * profile sync applied twice ends up in exactly the same GHL contact state as once.
     */
    private static function call(string $method, string $path, array $body): array
    {
        [$apiKey] = self::credentials();
        $start = microtime(true);

        try {
            // throw:false is required — retry()'s default (throw:true) would turn a normal,
            // already-handled non-2xx response (e.g. the 404 that syncUser() specifically
            // checks for and self-heals from) into a thrown exception instead of a plain
            // response, which would break that check.
            $response = Http::withToken($apiKey)
                ->withHeaders(['Version' => self::API_VERSION])
                ->timeout(15)
                ->retry(2, 500, throw: false)
                ->{strtolower($method)}(self::BASE_URL . $path, $body);

            $status = $response->status();
            $json = $response->json();
            $durationMs = (int) ((microtime(true) - $start) * 1000);

            if ($response->successful()) {
                return ['success' => true, 'http_status' => $status, 'body' => $json, 'error' => null, 'duration_ms' => $durationMs];
            }

            $error = $json['message'] ?? $json['error'] ?? "GoHighLevel API returned HTTP {$status}.";

            return ['success' => false, 'http_status' => $status, 'body' => $json, 'error' => is_string($error) ? $error : json_encode($error), 'duration_ms' => $durationMs];
        } catch (Throwable $e) {
            return [
                'success' => false, 'http_status' => null, 'body' => null,
                'error' => 'GoHighLevel request failed: ' . $e->getMessage(),
                'duration_ms' => (int) ((microtime(true) - $start) * 1000),
            ];
        }
    }

    private static function log(User $user, string $action, array $result, array $requestPayload): void
    {
        // The actual PIT token is sent only via Http::withToken() (an Authorization header),
        // never as part of a request body, so it can never end up in $requestPayload in the
        // first place — sanitized anyway for defense-in-depth and consistency with the other
        // two logging paths (FAST Payment, Game Provider APIs) sharing this same rule.
        $contactId = $result['body']['contact']['id'] ?? $user->ghl_contact_id ?? null;

        GhlApiLog::create([
            'user_id' => $user->id,
            'provider' => 'GoHighLevel',
            'provider_reference' => $contactId,
            'action' => $action,
            'request_payload' => PayloadSanitizer::sanitize($requestPayload),
            'response_payload' => PayloadSanitizer::sanitize($result['body'] ?? null),
            'http_status' => $result['http_status'] ?? null,
            'success' => $result['success'] ?? false,
            'error_message' => $result['error'] ?? null,
            'duration_ms' => $result['duration_ms'] ?? null,
            'created_at' => now(),
        ]);
    }

}
