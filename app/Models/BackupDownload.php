<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BackupDownload extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'backup_id',
        'admin_id',
        'ip',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function backup()
    {
        return $this->belongsTo(Backup::class);
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
