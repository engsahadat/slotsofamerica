<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'game_id',
        'gateway_id',
        'gateway_account_id',
        'type',
        'amount',
        'status',
        'deposit_proof_url',
        'notes',
        'balance_reserved',
        'idempotency_key',
        'provider_reference',
        'provider',
        'balance_before',
        'balance_after',
        'failure_reason',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'balance_reserved' => 'boolean',
        'balance_before' => 'decimal:2',
        'balance_after' => 'decimal:2',
        'reviewed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function game()
    {
        return $this->belongsTo(Game::class);
    }

    public function gateway()
    {
        return $this->belongsTo(PaymentGateway::class, 'gateway_id');
    }

    public function gatewayAccount()
    {
        return $this->belongsTo(PaymentGatewayAccount::class, 'gateway_account_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function logs()
    {
        return $this->hasMany(TransactionLog::class);
    }
}
