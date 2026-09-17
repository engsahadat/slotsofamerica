<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Backup extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'type',
        'format',
        'scope',
        'status',
        'size_bytes',
        'storage_path',
        'error',
        'meta',
        'created_by',
        'completed_at',
        'expires_at',
        'created_at',
    ];

    protected $casts = [
        'meta' => 'array',
        'completed_at' => 'datetime',
        'expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function downloads()
    {
        return $this->hasMany(BackupDownload::class);
    }
}
