<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AdminUserApiController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(500, max(1, $request->integer('per_page', 20)));

        $query = User::latest();
        if ($request->filled('search')) {
            $term = '%' . $request->string('search') . '%';
            $query->where(function ($q) use ($term) {
                $q->where('name', 'like', $term)
                    ->orWhere('username', 'like', $term)
                    ->orWhere('email', 'like', $term);
            });
        }

        $users = $query->paginate($perPage);

        return response()->json($users);
    }

    public function show($id)
    {
        $user = User::with(['transactions', 'gameUnlockRequests'])->findOrFail($id);

        return response()->json(['user' => $user]);
    }

    public function adjustBalance(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'amount' => 'required|numeric',
            'type' => 'required|in:add,subtract,set',
            'reason' => 'required|string',
        ]);

        $oldBalance = (float)$user->balance;
        $amount = (float)$validated['amount'];

        if ($validated['type'] === 'add') {
            $user->balance = $oldBalance + $amount;
        } elseif ($validated['type'] === 'subtract') {
            $user->balance = max(0, $oldBalance - $amount);
        } else {
            $user->balance = max(0, $amount);
        }

        $user->save();

        AuditLog::record($request, 'balance_adjustment', 'User', $user->id, [
            'old_balance' => $oldBalance,
            'new_balance' => (float)$user->balance,
            'reason' => $validated['reason'],
        ]);

        return response()->json([
            'message' => 'User balance updated successfully.',
            'user' => $user,
        ]);
    }

    public function toggleFlag(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $user->is_flagged = !$user->is_flagged;
        $user->flagged_reason = $request->input('reason', 'Flagged by admin');
        $user->flagged_at = $user->is_flagged ? now() : null;
        $user->save();

        AuditLog::record($request, $user->is_flagged ? 'flagged_user' : 'unflagged_user', 'User', $user->id, [
            'reason' => $user->flagged_reason,
        ]);

        return response()->json([
            'message' => $user->is_flagged ? 'User has been flagged/suspended.' : 'User flag removed.',
            'user' => $user,
        ]);
    }

    public function updateRole(Request $request, $id)
    {
        $validated = $request->validate([
            'role' => 'required|in:user,manager,admin',
        ]);

        $user = User::findOrFail($id);
        $oldRole = $user->role;
        $user->role = $validated['role'];
        $user->save();

        AuditLog::record($request, 'updated_user_role', 'User', $user->id, [
            'old_role' => $oldRole,
            'new_role' => $user->role,
        ]);

        return response()->json([
            'message' => "User role updated to {$user->role}.",
            'user' => $user,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'username' => 'required|string|max:50|unique:users,username',
            'name' => 'required|string|max:100',
            // Note: `users.email` is a NOT NULL unique column at the DB level, so this must be
            // required — leaving it nullable let a blank email through validation only to crash
            // with a raw SQL constraint error on User::create().
            'email' => 'required|email|max:150|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => 'nullable|in:user,manager,admin',
            'balance' => 'nullable|numeric|min:0',
            'phone' => 'nullable|string|max:30',
        ]);

        $user = User::create([
            'username' => $validated['username'],
            'name' => $validated['name'],
            'email' => $validated['email'] ?? null,
            'password' => bcrypt($validated['password']),
            'role' => $validated['role'] ?? 'user',
            'balance' => $validated['balance'] ?? 0,
            'phone' => $validated['phone'] ?? null,
        ]);

        AuditLog::record($request, 'created_user', 'User', $user->id, [
            'username' => $user->username,
            'role' => $user->role,
        ]);

        return response()->json([
            'message' => 'User created successfully.',
            'user' => $user,
        ], 201);
    }

    public function destroy(Request $request, $id)
    {
        $user = User::findOrFail($id);

        // Prevent deleting primary admin if needed
        if ($user->role === 'admin') {
            $adminCount = User::where('role', 'admin')->count();
            if ($adminCount <= 1) {
                return response()->json(['message' => 'Cannot delete the only admin user.'], 422);
            }
        }

        $deletedInfo = ['username' => $user->username, 'name' => $user->name, 'role' => $user->role];
        $user->delete();

        AuditLog::record($request, 'deleted_user', 'User', $id, $deletedInfo);

        return response()->json([
            'message' => 'User deleted successfully.',
        ]);
    }
}
