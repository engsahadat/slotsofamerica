<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RewardsConfig extends Model
{
    use HasFactory;

    protected $table = 'rewards_config';

    protected $fillable = [
        'key',
        'value',
        'description',
        'is_active',
    ];

    protected $casts = [
        'value' => 'decimal:2',
        'is_active' => 'boolean',
    ];
}
