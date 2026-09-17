<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailTemplate extends Model
{
    protected $fillable = [
        'name',
        'category',
        'transaction_type',
        'trigger_event',
        'subject',
        'body_html',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
