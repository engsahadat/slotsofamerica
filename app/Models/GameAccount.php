<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class GameAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'game_id',
        'username',
        'provider_account_id',
        'password_hash',
        'web_login_url',
        'status',
        'assigned_to',
    ];

    public function game()
    {
        return $this->belongsTo(Game::class);
    }

    public function assignedUser()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /** A fresh random alphanumeric password, generated whenever an account is (re-)assigned. */
    public static function generateRandomPassword(): string
    {
        return Str::random(10);
    }
}
