<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RecoveryConfig extends Model
{
    protected $fillable = [
        'site_url',
        'frontend_url',
        'support_email',
        'notes',
        'updated_by',
    ];

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
