<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FastPaymentApiLog extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'fast_payment_transaction_id',
        'provider',
        'user_id',
        'provider_reference',
        'http_status',
        'action',
        'request_payload',
        'response_payload',
        'signature_valid',
        'success',
        'error_message',
        'duration_ms',
        'created_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'signature_valid' => 'boolean',
        'success' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function fastPaymentTransaction()
    {
        return $this->belongsTo(FastPaymentTransaction::class);
    }
}
