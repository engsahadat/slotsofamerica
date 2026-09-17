<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'type',
        'category',
        'is_read',
    ];

    protected $casts = [
        'is_read' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public static function notify(int $userId, string $title, string $message, string $type = 'info', string $category = 'general'): self
    {
        return self::create([
            'user_id' => $userId,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'category' => $category,
        ]);
    }

    /**
     * Notify every admin — same fan-out AdminExportRequestApiController::store() already used
     * for "New Export Request" before this helper existed. Used by the transaction-submission
     * endpoints so the admin notification bell has real "needs review" content.
     */
    public static function notifyAdmins(string $title, string $message, string $type = 'info', string $category = 'general'): void
    {
        User::where('role', 'admin')->pluck('id')->each(
            fn ($adminId) => self::notify($adminId, $title, $message, $type, $category)
        );
    }
}
