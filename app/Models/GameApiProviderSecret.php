<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameApiProviderSecret extends Model
{
    protected $primaryKey = 'provider_id';
    public $incrementing = false;

    protected $fillable = [
        'provider_id',
        'agent_password',
        'updated_by',
    ];

    protected $casts = [
        // Encrypted at rest — a deliberate improvement over the reference
        // implementation's plaintext storage. No behavior/UX difference.
        'agent_password' => 'encrypted',
    ];

    public function provider()
    {
        return $this->belongsTo(GameApiProvider::class, 'provider_id');
    }
}
