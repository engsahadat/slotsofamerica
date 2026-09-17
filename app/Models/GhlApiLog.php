<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GhlApiLog extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'provider',
        'provider_reference',
        'action',
        'request_payload',
        'response_payload',
        'http_status',
        'success',
        'error_message',
        'duration_ms',
        'created_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'success' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
