<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GameApiProvider extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'protocol',
        'display_name',
        'base_url',
        'agent_username',
        'secret_name',
        'is_active',
        'automate_create_account',
        'automate_deposit',
        'automate_withdraw',
        'notes',
        'request_content_type',
        'request_method',
        'custom_headers',
        'proxy_url',
        'requires_ip_whitelist',
        'health_check_path',
        'whitelist_ip_note',
        'docs_url',
        'last_health_status',
        'last_health_message',
        'last_health_latency_ms',
        'last_health_checked_at',
        'consecutive_failures',
        'last_success_at',
        'last_failure_at',
        'last_error_code',
        'last_error_summary',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'automate_create_account' => 'boolean',
        'automate_deposit' => 'boolean',
        'automate_withdraw' => 'boolean',
        'custom_headers' => 'array',
        'requires_ip_whitelist' => 'boolean',
        'last_health_checked_at' => 'datetime',
        'last_success_at' => 'datetime',
        'last_failure_at' => 'datetime',
    ];

    public function secret()
    {
        return $this->hasOne(GameApiProviderSecret::class, 'provider_id');
    }

    public function assignments()
    {
        return $this->hasMany(GameProviderAssignment::class, 'provider_id');
    }

    public function hasPassword(): bool
    {
        return $this->secret()->exists();
    }
}
