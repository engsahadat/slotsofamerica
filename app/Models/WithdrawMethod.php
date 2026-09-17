<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WithdrawMethod extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'logo_url',
        'minimum_amount',
        'maximum_amount',
        'fee_percentage',
        'fee_fixed',
        'processing_time',
        'instructions',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'minimum_amount' => 'decimal:2',
        'maximum_amount' => 'decimal:2',
        'fee_percentage' => 'decimal:2',
        'fee_fixed' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function fields()
    {
        return $this->hasMany(WithdrawMethodField::class, 'method_id');
    }
}
