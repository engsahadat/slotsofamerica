<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ManualVerificationRequest extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'type',
        'contact',
        'status',
        'admin_note',
        'reviewed_by',
        'reviewed_at',
        'created_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
