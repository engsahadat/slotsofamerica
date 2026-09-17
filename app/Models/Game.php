<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'username_suffix',
        'api_provider',
        'description',
        'image_url',
        'download_url',
        'web_url',
        'android_url',
        'ios_url',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function accounts()
    {
        return $this->hasMany(GameAccount::class);
    }

    public function unlockRequests()
    {
        return $this->hasMany(GameUnlockRequest::class);
    }
}
