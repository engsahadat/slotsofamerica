<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\GameUnlockRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\WithdrawRequest;

class AdminOverviewApiController extends Controller
{
    public function index()
    {
        $totalUsers = User::count();
        $totalDeposits = Transaction::where('type', 'deposit')->where('status', 'approved')->sum('amount');
        $totalWithdrawals = Transaction::where('type', 'withdraw')->where('status', 'approved')->sum('amount');
        $pendingTransactions = Transaction::where('status', 'pending')->count();
        $pendingUnlocks = GameUnlockRequest::where('status', 'pending')->count();
        $pendingWithdrawals = WithdrawRequest::where('status', 'pending')->count();

        $recentTransactions = Transaction::with(['user', 'game'])
            ->latest()
            ->take(10)
            ->get();

        return response()->json([
            'stats' => [
                'total_users' => $totalUsers,
                'total_deposits' => (float)$totalDeposits,
                'total_withdrawals' => (float)$totalWithdrawals,
                'pending_transactions' => $pendingTransactions,
                'pending_unlocks' => $pendingUnlocks,
                'pending_withdrawals' => $pendingWithdrawals,
            ],
            'recent_transactions' => $recentTransactions,
        ]);
    }
}
