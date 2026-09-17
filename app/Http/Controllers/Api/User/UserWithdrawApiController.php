<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use App\Models\WithdrawMethod;
use App\Models\WithdrawRequest;
use App\Services\EmailTemplateMailer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserWithdrawApiController extends Controller
{
    /** Admin -> Withdraw Methods "Daily Withdraw Limit" card overrides this; falls back to 100. */
    private function dailyLimit(): float
    {
        $settings = SiteSetting::first();

        return (float) ($settings?->withdraw_daily_limit ?? 100);
    }

    /** Sum of this user's pending+approved withdrawals in the trailing 24 hours (sliding window,
     * matching the admin UI's own "per user, 24hrs" copy — not a calendar-day reset). Note: the
     * real `transactions.status` enum is pending|approved|rejected — there is no "completed". */
    private function dailyUsed(int $userId): float
    {
        return (float) Transaction::where('user_id', $userId)
            ->where('type', 'withdraw')
            ->whereIn('status', ['pending', 'approved'])
            ->where('created_at', '>=', now()->subHours(24))
            ->sum('amount');
    }

    public function index(Request $request)
    {
        $methods = WithdrawMethod::with(['fields' => function ($q) {
            $q->orderBy('sort_order', 'asc');
        }])->where('is_active', true)->orderBy('sort_order', 'asc')->get();

        $dailyLimit = $this->dailyLimit();
        $dailyUsed = $this->dailyUsed($request->user()->id);

        return response()->json([
            'methods' => $methods,
            'daily_limit' => $dailyLimit,
            'daily_used' => $dailyUsed,
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'method_id' => 'required|exists:withdraw_methods,id',
            'amount' => 'required|numeric|min:1',
            'account_details' => 'required|array',
            'proof_url' => 'nullable|string',
        ]);

        $method = WithdrawMethod::findOrFail($validated['method_id']);
        $amount = (float)$validated['amount'];

        if ($amount < (float)$method->minimum_amount) {
            return response()->json(['message' => "Minimum withdrawal amount is {$method->minimum_amount}"], 422);
        }

        if ($amount > (float)$method->maximum_amount) {
            return response()->json(['message' => "Maximum withdrawal amount is {$method->maximum_amount}"], 422);
        }

        if ((float)$user->balance < $amount) {
            return response()->json(['message' => 'Insufficient account balance.'], 400);
        }

        $dailyLimit = $this->dailyLimit();
        $dailyUsed = $this->dailyUsed($user->id);
        if ($dailyUsed + $amount > $dailyLimit) {
            $remaining = max(0, $dailyLimit - $dailyUsed);
            return response()->json(['message' => "Exceeds your 24-hour withdrawal limit. You have \${$remaining} remaining."], 422);
        }

        $feeAmount = (float)$method->fee_fixed + ($amount * ((float)$method->fee_percentage / 100));
        $receiveAmount = max(0, $amount - $feeAmount);

        $withdrawReq = DB::transaction(function () use ($user, $method, $amount, $feeAmount, $receiveAmount, $validated) {
            // Locked for the balance read-modify-write, matching every other financial flow.
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $balanceBefore = (float) $locked->balance;
            $locked->balance = $balanceBefore - $amount;
            $locked->save();

            $withdrawReq = WithdrawRequest::create([
                'user_id' => $user->id,
                'method_id' => $method->id,
                'amount' => $amount,
                'fee_amount' => $feeAmount,
                'receive_amount' => $receiveAmount,
                'account_details' => $validated['account_details'],
                'proof_url' => $validated['proof_url'] ?? null,
                'status' => 'pending',
            ]);

            Transaction::create([
                'user_id' => $user->id,
                'type' => 'withdraw',
                'amount' => $amount,
                'status' => 'pending',
                'balance_reserved' => true,
                'balance_before' => $balanceBefore,
                'provider' => $method->name,
                'notes' => "Withdrawal request via {$method->name}",
            ]);

            return $withdrawReq;
        });

        EmailTemplateMailer::fireTrigger('transaction_pending_withdraw', $user, [
            'amount' => number_format($amount, 2), 'type' => 'withdraw', 'status' => 'Pending',
        ]);

        $submitter = $user->username ?? $user->name ?? 'A user';
        Notification::notifyAdmins(
            'New Withdrawal Request',
            "{$submitter} requested a withdrawal of \$" . number_format($amount, 2) . " via {$method->name}.",
            'info',
            'withdraw'
        );

        return response()->json([
            'message' => 'Withdrawal request submitted successfully.',
            'request' => $withdrawReq,
            'new_balance' => (float) $user->fresh()->balance,
        ], 201);
    }

    /**
     * Lets a user cancel their own withdrawal while it's still 'pending' — refunds the amount
     * reserved at submit time. Only 'pending' is cancellable: once an admin has acted on it
     * (approved/rejected via AdminTransactionApiController::review), self-service cancellation
     * would race the admin's own review — the user just has to wait for that outcome instead.
     *
     * Operates on Transaction directly, not WithdrawRequest — matching
     * AdminTransactionApiController's own review flow, which never touches WithdrawRequest
     * either; Transaction.status is the single source of truth for a withdrawal's lifecycle here.
     */
    public function cancel(Request $request, $id)
    {
        $user = $request->user();

        $transaction = Transaction::where('id', $id)
            ->where('user_id', $user->id)
            ->where('type', 'withdraw')
            ->first();

        if (!$transaction) {
            return response()->json(['message' => 'Withdrawal request not found.'], 404);
        }
        if ($transaction->status !== 'pending') {
            return response()->json(['message' => 'This withdrawal has already been reviewed and can no longer be cancelled.'], 422);
        }

        DB::transaction(function () use ($transaction, $user) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $balanceBefore = (float) $locked->balance;

            // Same guard AdminTransactionApiController's own reject path uses before refunding —
            // withdraw requests always reserve on submit (see store() above), but stay defensive
            // rather than assuming it.
            if ($transaction->balance_reserved) {
                $locked->balance = $balanceBefore + (float) $transaction->amount;
                $locked->save();
            }

            $transaction->status = 'rejected';
            $transaction->reviewed_at = now();
            $transaction->failure_reason = 'Cancelled by user.';
            $transaction->balance_before = $balanceBefore;
            $transaction->balance_after = (float) $locked->balance;
            $transaction->save();

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'user_cancelled_withdraw',
                'action_by' => $user->id,
                'old_status' => 'pending',
                'new_status' => 'rejected',
                'old_amount' => $transaction->amount,
                'new_amount' => $transaction->amount,
                'note' => 'Cancelled by the user before admin review.',
                'action_at' => now(),
            ]);
        });

        Notification::notifyAdmins(
            'Withdrawal Cancelled',
            ($user->username ?? $user->name ?? 'A user') . ' cancelled their own withdrawal request of $' . number_format((float) $transaction->amount, 2) . '.',
            'info',
            'withdraw'
        );

        return response()->json([
            'message' => 'Withdrawal request cancelled. Your balance has been refunded.',
            'new_balance' => (float) $user->fresh()->balance,
        ]);
    }
}
