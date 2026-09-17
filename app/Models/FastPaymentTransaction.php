<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FastPaymentTransaction extends Model
{
    protected $fillable = [
        'transaction_id',
        'user_id',
        'order_sn',
        'fast_transaction_id',
        'provider',
        'requested_amount',
        'confirmed_amount',
        'payment_status',
        'pay_url',
        'ip_address',
        'device_id',
        'raw_response',
        'confirmed_at',
    ];

    protected $casts = [
        'requested_amount' => 'decimal:2',
        'confirmed_amount' => 'decimal:2',
        'raw_response' => 'array',
        'confirmed_at' => 'datetime',
    ];

    public function transaction()
    {
        return $this->belongsTo(Transaction::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
