<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameApiLog extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'provider_id',
        'provider_name',
        'action',
        'endpoint',
        'provider_reference',
        'request_payload',
        'response_payload',
        'http_status',
        'success',
        'error_message',
        'duration_ms',
        'related_user_id',
        'related_transaction_id',
        'related_request_id',
        'created_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'success' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function provider()
    {
        return $this->belongsTo(GameApiProvider::class, 'provider_id');
    }
}
