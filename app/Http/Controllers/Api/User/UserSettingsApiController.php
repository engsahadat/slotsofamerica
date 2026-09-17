<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Services\GoHighLevelService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserSettingsApiController extends Controller
{
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'phone' => 'nullable|string|max:50',
            'country' => 'nullable|string|max:100',
            'state' => 'nullable|string|max:100',
            'gender' => 'nullable|string|max:20',
            'date_of_birth' => 'nullable|date',
            'email_notifications' => 'sometimes|boolean',
            'avatar_url' => 'nullable|string',
        ]);

        $user->update($validated);

        // Only re-sync to GHL when a field it actually cares about changed — avoids a wasted
        // API call (and log row) on every toggle of e.g. email_notifications/avatar_url.
        if (array_intersect(['name', 'phone'], array_keys($validated))) {
            try {
                GoHighLevelService::syncUser($user);
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $user->fresh(),
        ]);
    }

    public function updatePassword(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:6|confirmed',
        ]);

        if (!Hash::check($validated['current_password'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->password = Hash::make($validated['new_password']);
        $user->save();

        return response()->json(['message' => 'Password updated successfully.']);
    }
}
