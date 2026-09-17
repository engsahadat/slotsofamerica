<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GameProviderAssignment extends Model
{
    use HasFactory;

    protected $fillable = [
        'game_id',
        'provider_id',
    ];

    public function game()
    {
        return $this->belongsTo(Game::class);
    }

    public function provider()
    {
        return $this->belongsTo(GameApiProvider::class, 'provider_id');
    }
}
