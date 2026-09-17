<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiLog;
use App\Services\PayloadSanitizer;
use Throwable;

class ApiLogger
{
    /** @deprecated kept only so any external caller of ->sanitize() keeps working; delegates
     * to the shared PayloadSanitizer used by every API log table now (GHL, FAST, Game Provider). */
    public function sanitize($value)
    {
        return PayloadSanitizer::sanitize($value);
    }

    public function log(array $entry): void
    {
        try {
            GameApiLog::create([
                'provider_id' => $entry['provider_id'] ?? null,
                'provider_name' => $entry['provider_name'] ?? null,
                'action' => $entry['action'],
                'endpoint' => $entry['endpoint'] ?? null,
                'provider_reference' => $entry['provider_reference'] ?? null,
                'request_payload' => PayloadSanitizer::sanitize($entry['request_payload'] ?? null),
                'response_payload' => PayloadSanitizer::sanitize($entry['response_payload'] ?? null),
                'http_status' => $entry['http_status'] ?? null,
                'success' => $entry['success'] ?? false,
                'error_message' => $entry['error_message'] ?? null,
                'duration_ms' => $entry['duration_ms'] ?? null,
                'related_user_id' => $entry['related_user_id'] ?? null,
                'related_transaction_id' => $entry['related_transaction_id'] ?? null,
                'related_request_id' => $entry['related_request_id'] ?? null,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
