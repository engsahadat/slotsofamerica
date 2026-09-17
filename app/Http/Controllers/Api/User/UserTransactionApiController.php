<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use Illuminate\Http\Request;

class UserTransactionApiController extends Controller
{
    public function index(Request $request)
    {
        // 'gateway' is real for deposits (added when Payment Gateways were wired up); withdraw
        // has no direct FK to its WithdrawMethod on this table, so its method name still only
        // lives in the free-text `notes` column ("Withdrawal request via {name}") — the frontend
        // parses that one specifically for withdrawals.
        $query = Transaction::with(['game', 'gateway:id,name'])
            ->where('user_id', $request->user()->id)
            ->latest();

        if ($request->has('type')) {
            $query->where('type', $request->string('type'));
        }

        if ($request->has('status')) {
            $query->where('status', $request->string('status'));
        }

        $perPage = min(500, max(1, $request->integer('per_page', 20)));

        return response()->json($query->paginate($perPage));
    }
}
