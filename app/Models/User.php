<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'legacy_id',
        'name',
        'username',
        'email',
        'phone',
        'avatar_url',
        'balance',
        'role',
        'is_flagged',
        'flagged_reason',
        'flagged_at',
        'email_verified_by_admin',
        'phone_verified',
        'phone_verified_at',
        'country',
        'state',
        'gender',
        'date_of_birth',
        'email_notifications',
        'password',
        'email_verified_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'flagged_at' => 'datetime',
            'date_of_birth' => 'date',
            'balance' => 'decimal:2',
            'is_flagged' => 'boolean',
            'email_verified_by_admin' => 'boolean',
            'phone_verified' => 'boolean',
            'email_notifications' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isManager(): bool
    {
        return $this->role === 'manager' || $this->role === 'admin';
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }

    public function gameUnlockRequests()
    {
        return $this->hasMany(GameUnlockRequest::class);
    }

    public function passwordRequests()
    {
        return $this->hasMany(PasswordRequest::class);
    }

    public function withdrawRequests()
    {
        return $this->hasMany(WithdrawRequest::class);
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }
}
