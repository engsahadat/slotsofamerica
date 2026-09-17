<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentGatewayAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'gateway_id',
        'account_name',
        'account_number',
        'priority_order',
        'is_active',
        'qr_code_url',
        'deep_link',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function gateway()
    {
        return $this->belongsTo(PaymentGateway::class, 'gateway_id');
    }
}
