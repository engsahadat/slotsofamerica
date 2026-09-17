<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExportRequest extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'manager_id',
        'export_type',
        'filters',
        'reason',
        'status',
        'row_count',
        'reviewed_by',
        'reviewed_at',
        'admin_note',
        'approved_expires_at',
        'created_at',
    ];

    protected $casts = [
        'filters' => 'array',
        'reviewed_at' => 'datetime',
        'approved_expires_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isApprovedAndUnexpired(): bool
    {
        return $this->status === 'approved'
            && $this->approved_expires_at !== null
            && $this->approved_expires_at->isFuture();
    }
}
