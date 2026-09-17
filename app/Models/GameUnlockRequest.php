<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GameUnlockRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'game_id',
        'game_account_id',
        'username',
        'email',
        'game_password',
        'web_login_url',
        'status',
        'admin_note',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function game()
    {
        return $this->belongsTo(Game::class);
    }

    public function gameAccount()
    {
        return $this->belongsTo(GameAccount::class);
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
