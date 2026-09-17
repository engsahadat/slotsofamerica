<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;

class AdminNotificationApiController extends Controller
{
    public function index(Request $request)
    {
        $notifications = Notification::with('user')->latest()->paginate(50);

        return response()->json($notifications);
    }

    public function broadcast(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:150',
            'message' => 'required|string',
            'type' => 'required|in:info,warning,success',
            'category' => 'nullable|string|max:50',
            'user_id' => 'nullable|exists:users,id', // null means send to all users
        ]);

        if (!empty($validated['user_id'])) {
            $notification = Notification::create([
                'user_id' => $validated['user_id'],
                'title' => $validated['title'],
                'message' => $validated['message'],
                'type' => $validated['type'],
                'category' => $validated['category'] ?? 'system',
                'is_read' => false,
            ]);

            return response()->json([
                'message' => 'Notification sent to user successfully.',
                'notification' => $notification,
            ], 201);
        }

        // Send broadcast to all non-admin users or all users
        $userIds = User::pluck('id');
        $createdCount = 0;
        foreach ($userIds as $uid) {
            Notification::create([
                'user_id' => $uid,
                'title' => $validated['title'],
                'message' => $validated['message'],
                'type' => $validated['type'],
                'category' => $validated['category'] ?? 'system',
                'is_read' => false,
            ]);
            $createdCount++;
        }

        return response()->json([
            'message' => "Broadcast notification sent to {$createdCount} users.",
        ], 201);
    }

    public function destroy($id)
    {
        $notification = Notification::findOrFail($id);
        $notification->delete();

        return response()->json(['message' => 'Notification deleted successfully.']);
    }
}
