<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentGateway extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'address',
        'minimum_amount',
        'logo_url',
        'qr_code_url',
        'deep_link',
        'instructions',
        'is_active',
    ];

    protected $casts = [
        'minimum_amount' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function accounts()
    {
        return $this->hasMany(PaymentGatewayAccount::class, 'gateway_id');
    }
}
