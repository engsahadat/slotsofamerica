<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\GameAccount;
use App\Models\GameUnlockRequest;
use App\Models\Transaction;
use Illuminate\Http\Request;

class UserDashboardApiController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $recentTransactions = Transaction::with('game')
            ->where('user_id', $user->id)
            ->latest()
            ->take(5)
            ->get();

        $activeAccounts = GameAccount::with('game')
            ->where('assigned_to', $user->id)
            ->get();

        $unlockRequests = GameUnlockRequest::with('game')
            ->where('user_id', $user->id)
            ->latest()
            ->get();

        $featuredGames = Game::where('is_active', true)->get();

        return response()->json([
            'user' => $user,
            'balance' => (float)$user->balance,
            'recent_transactions' => $recentTransactions,
            'active_accounts' => $activeAccounts,
            'unlock_requests' => $unlockRequests,
            'featured_games' => $featuredGames,
        ]);
    }
}
