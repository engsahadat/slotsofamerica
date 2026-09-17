<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Game;
use App\Models\GameAccount;
use Illuminate\Http\Request;

class AdminGameApiController extends Controller
{
    public function index()
    {
        $games = Game::withCount('accounts')->get();

        return response()->json(['games' => $games]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'username_suffix' => ['nullable', 'string', 'max:10', 'regex:/^[a-zA-Z0-9]*$/'],
            'api_provider' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'image_url' => 'nullable|string',
            'download_url' => 'nullable|string',
            'web_url' => 'nullable|string',
            'android_url' => 'nullable|string',
            'ios_url' => 'nullable|string',
            'is_active' => 'boolean',
        ], [
            'username_suffix.regex' => 'Username suffix can only contain letters and numbers.',
        ]);

        $game = Game::create($validated);
        AuditLog::record($request, 'created_game', 'Game', $game->id, ['name' => $game->name]);

        return response()->json(['message' => 'Game created successfully.', 'game' => $game], 201);
    }

    public function update(Request $request, $id)
    {
        $game = Game::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'username_suffix' => ['nullable', 'string', 'max:10', 'regex:/^[a-zA-Z0-9]*$/'],
            'api_provider' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'image_url' => 'nullable|string',
            'download_url' => 'nullable|string',
            'web_url' => 'nullable|string',
            'android_url' => 'nullable|string',
            'ios_url' => 'nullable|string',
            'is_active' => 'boolean',
        ], [
            'username_suffix.regex' => 'Username suffix can only contain letters and numbers.',
        ]);

        $game->update($validated);
        AuditLog::record($request, 'updated_game', 'Game', $game->id, ['name' => $game->name]);

        return response()->json(['message' => 'Game updated successfully.', 'game' => $game]);
    }

    public function destroy(Request $request, $id)
    {
        $game = Game::findOrFail($id);
        AuditLog::record($request, 'deleted_game', 'Game', $game->id, ['name' => $game->name]);
        $game->delete();

        return response()->json(['message' => 'Game deleted successfully.']);
    }

    public function accounts($gameId)
    {
        $accounts = GameAccount::where('game_id', $gameId)->with('assignedUser')->get();

        return response()->json(['accounts' => $accounts]);
    }

    public function storeAccount(Request $request, $gameId)
    {
        $validated = $request->validate([
            'username' => 'required|string|max:255',
            'password_hash' => 'required|string',
            'status' => 'required|in:available,assigned,locked',
        ]);

        $account = GameAccount::create([
            'game_id' => $gameId,
            'username' => $validated['username'],
            'password_hash' => $validated['password_hash'],
            'status' => $validated['status'],
        ]);

        return response()->json(['message' => 'Game account created.', 'account' => $account], 201);
    }

    public function updateAccount(Request $request, $gameId, $accountId)
    {
        $account = GameAccount::where('game_id', $gameId)->where('id', $accountId)->firstOrFail();

        $validated = $request->validate([
            'username' => 'sometimes|string|max:255',
            'password_hash' => 'sometimes|string',
            'status' => 'sometimes|in:available,assigned,locked',
        ]);

        $account->update($validated);

        return response()->json(['message' => 'Game account updated.', 'account' => $account]);
    }

    public function destroyAccount($gameId, $accountId)
    {
        $account = GameAccount::where('game_id', $gameId)->where('id', $accountId)->firstOrFail();
        $account->delete();

        return response()->json(['message' => 'Game account deleted successfully.']);
    }
}
