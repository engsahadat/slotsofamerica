<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Notification;
use App\Models\RewardHistory;
use App\Models\RewardsConfig;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use App\Services\EmailTemplateMailer;
use App\Services\GameApiProvider\Provisioner;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class UserRedeemApiController extends Controller
{
    public function __construct(private Provisioner $provisioner)
    {
    }

    /**
     * Admin -> Redeem Settings overrides these via SiteSetting; falls back to the
     * env-backed config/redeem.php defaults when the admin hasn't saved anything yet.
     */
    private function redeemLimits(): array
    {
        $settings = SiteSetting::first();

        return [
            (float) ($settings?->redeem_min_amount ?? config('redeem.min_amount')),
            (float) ($settings?->redeem_max_amount ?? config('redeem.max_amount')),
        ];
    }

    public function index(Request $request)
    {
        $rewards = RewardsConfig::where('is_active', true)->get();

        $user = $request->user();
        $startOfDay = now()->startOfDay();
        $todayTotal = Transaction::where('user_id', $user->id)
            ->where('type', 'redeem')
            ->whereIn('status', ['pending', 'approved']) // real transactions.status enum is pending|approved|rejected — there is no "completed"
            ->where('created_at', '>=', $startOfDay)
            ->sum('amount');

        [$minAmount, $maxAmount] = $this->redeemLimits();

        return response()->json([
            'rewards' => $rewards,
            'limits' => [
                'min_amount' => $minAmount,
                'max_amount' => $maxAmount,
            ],
            'today_total' => (float) $todayTotal,
        ]);
    }

    /** Own reward history — powers RewardHistorySection on the user Settings page. */
    public function history(Request $request)
    {
        $history = RewardHistory::where('user_id', $request->user()->id)
            ->latest('created_at')
            ->limit(20)
            ->get();

        return response()->json(['history' => $history]);
    }

    public function redeem(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'reward_key' => 'required|string',
        ]);

        $reward = RewardsConfig::where('key', $validated['reward_key'])
            ->where('is_active', true)
            ->first();

        if (!$reward) {
            return response()->json(['message' => 'Invalid or inactive reward key.'], 404);
        }

        $alreadyClaimed = RewardHistory::where('user_id', $user->id)
            ->where('reward_key', $reward->key)
            ->exists();

        if ($alreadyClaimed) {
            return response()->json(['message' => 'You have already claimed this reward.'], 400);
        }

        $amount = (float)$reward->value;

        DB::transaction(function () use ($user, $reward, $amount) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $balanceBefore = (float) $locked->balance;
            $locked->balance = $balanceBefore + $amount;
            $locked->save();

            RewardHistory::create([
                'user_id' => $user->id,
                'reward_key' => $reward->key,
                'amount' => $amount,
            ]);

            Transaction::create([
                'user_id' => $user->id,
                'type' => 'reward',
                'amount' => $amount,
                'status' => 'approved',
                'balance_before' => $balanceBefore,
                'balance_after' => $locked->balance,
                'reviewed_at' => now(),
                'notes' => "Redeemed reward: {$reward->description}",
            ]);
        });

        return response()->json([
            'message' => "Successfully redeemed \${$amount} reward!",
            'new_balance' => (float)$user->fresh()->balance,
        ]);
    }

    /**
     * Submit a "cash out in-game earnings" request. Unlike redeem() above (instant claim of a
     * fixed rewards_config reward), this creates a pending Transaction that starts with NO
     * balance effect at all — redeem only ever ADDS to the wallet, and that only ever happens
     * after a confirmed success, either from an admin approving it (unchanged, see
     * AdminTransactionApiController@review) or — when the game's assigned provider has
     * automate_withdraw on — instantly, in this same request: the provider deducts the game
     * account first, and only once that's confirmed does the wallet get credited.
     */
    public function submitCashout(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'game_id' => 'required|exists:games,id',
            'amount' => 'required|numeric|min:0.01|max:100000',
            'notes' => 'nullable|string',
            'idempotency_key' => 'nullable|string|max:100',
        ]);

        $game = Game::where('id', $validated['game_id'])->where('is_active', true)->first();
        if (!$game) {
            return response()->json(['message' => 'Game not found or inactive.'], 404);
        }

        $amount = (float)$validated['amount'];
        $idempotencyKey = $validated['idempotency_key'] ?? null;

        // Idempotent replay: a duplicate submission (double-click, or a retried request) with
        // the same key returns the original outcome instead of calling the provider again.
        if ($idempotencyKey) {
            $existing = Transaction::where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return response()->json([
                    'message' => 'This redeem was already submitted.',
                    'transaction' => $existing,
                    'instant' => $existing->status !== 'pending',
                ], 200);
            }
        }

        [$minAmount, $maxAmount] = $this->redeemLimits();

        if ($amount < $minAmount) {
            return response()->json(['message' => "Minimum redeem amount is \${$minAmount}"], 422);
        }

        $startOfDay = now()->startOfDay();
        $todayTotal = (float) Transaction::where('user_id', $user->id)
            ->where('type', 'redeem')
            ->whereIn('status', ['pending', 'approved']) // real transactions.status enum is pending|approved|rejected — there is no "completed"
            ->where('created_at', '>=', $startOfDay)
            ->sum('amount');

        if ($todayTotal + $amount > $maxAmount) {
            return response()->json(['message' => "Daily redeem limit exceeded. Your maximum redeem limit is \${$maxAmount} per day."], 422);
        }

        try {
            $transaction = Transaction::create([
                'user_id' => $user->id,
                'game_id' => $game->id,
                'type' => 'redeem',
                'amount' => $amount,
                'status' => 'pending',
                'idempotency_key' => $idempotencyKey,
                'notes' => $validated['notes'] ?? null,
            ]);
        } catch (QueryException $e) {
            // A genuinely simultaneous duplicate request won this race — hand back its result.
            if ($idempotencyKey && str_contains($e->getMessage(), 'idempotency_key')) {
                $existing = Transaction::where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->first();

                return response()->json([
                    'message' => 'This redeem was already submitted.',
                    'transaction' => $existing,
                    'instant' => $existing && $existing->status !== 'pending',
                ], 200);
            }
            throw $e;
        }

        // Only attempt the instant path when this game is actually configured for it —
        // otherwise skip straight to the unchanged pending-admin-review flow below.
        if ($this->provisioner->withdrawAutomationEnabled($game->id)) {
            try {
                $sync = $this->provisioner->instantRedeem($user->id, $game->id, $amount, $transaction->id);
            } catch (Throwable $e) {
                report($e);
                $sync = ['success' => false, 'message' => 'Unexpected error while contacting the game provider.'];
            }

            return $sync['success']
                ? $this->finalizeInstantRedeem($user, $game, $amount, $transaction, $sync)
                : $this->rejectFailedInstantRedeem($user, $game, $transaction, $sync);
        }

        EmailTemplateMailer::fireTrigger('transaction_pending_redeem', $user, [
            'amount' => number_format($amount, 2), 'type' => 'redeem', 'status' => 'Pending', 'game_name' => $game->name,
        ]);

        $submitter = $user->username ?? $user->name ?? 'A user';
        Notification::notifyAdmins(
            'New Redeem Request',
            "{$submitter} requested to cash out \$" . number_format($amount, 2) . " from {$game->name}.",
            'info',
            'redeem'
        );

        return response()->json([
            'message' => 'Redeem request submitted successfully. Waiting for admin approval.',
            'transaction' => $transaction,
            'instant' => false,
        ], 201);
    }

    private function finalizeInstantRedeem(User $user, Game $game, float $amount, Transaction $transaction, array $sync)
    {
        // Credit the wallet only now, locked — never before a confirmed provider success, and
        // never twice: this method only ever runs once per transaction (idempotency_key guards
        // the request itself from ever reaching here a second time for the same submission).
        [$balanceBefore, $balanceAfter] = DB::transaction(function () use ($user, $amount) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $before = (float) $locked->balance;
            $locked->balance = $before + $amount;
            $locked->save();

            return [$before, $locked->balance];
        });

        $transaction->status = 'approved';
        $transaction->reviewed_at = now();
        $transaction->provider_reference = $sync['provider_reference'] ?? null;
        $transaction->provider = $sync['provider_name'] ?? null;
        $transaction->balance_before = $balanceBefore;
        $transaction->balance_after = $balanceAfter;
        $transaction->save();

        TransactionLog::create([
            'transaction_id' => $transaction->id,
            'action' => 'auto_redeem_confirmed',
            'action_by' => null, // system/automated — no human admin involved.
            'old_status' => 'pending',
            'new_status' => 'approved',
            'note' => 'Instant redeem confirmed via Game API.',
            'action_at' => now(),
        ]);

        Notification::notify(
            $user->id,
            'Redeem Completed',
            "Your redeem of \$" . number_format($amount, 2) . " from {$game->name} was completed instantly.",
            'success',
            'redeem'
        );

        EmailTemplateMailer::fireTrigger('transaction_approved_redeem', $user, [
            'amount' => number_format($amount, 2), 'type' => 'redeem', 'status' => 'Approved',
        ]);

        return response()->json([
            'message' => 'Redeem completed instantly.',
            'transaction' => $transaction->fresh(),
            'new_balance' => (float) $user->fresh()->balance,
            'instant' => true,
        ], 201);
    }

    private function rejectFailedInstantRedeem(User $user, Game $game, Transaction $transaction, array $sync)
    {
        // Nothing was ever added to the wallet, so there's nothing to undo — just mark the
        // attempt as rejected with the reason. balance_before/after are both the unchanged
        // current balance, documenting that this transaction had zero net effect.
        $reason = $sync['message'] ?? 'Game API redeem failed.';
        $currentBalance = (float) $user->fresh()->balance;
        $transaction->status = 'rejected';
        $transaction->reviewed_at = now();
        $transaction->notes = trim(($transaction->notes ? $transaction->notes . ' — ' : '') . "Auto-rejected: {$reason}");
        $transaction->failure_reason = $reason;
        $transaction->provider = $sync['provider_name'] ?? null;
        $transaction->balance_before = $currentBalance;
        $transaction->balance_after = $currentBalance;
        $transaction->save();

        TransactionLog::create([
            'transaction_id' => $transaction->id,
            'action' => 'auto_redeem_failed',
            'action_by' => null,
            'old_status' => 'pending',
            'new_status' => 'rejected',
            'note' => $reason,
            'action_at' => now(),
        ]);

        Notification::notify(
            $user->id,
            'Redeem Failed',
            "Your redeem request from {$game->name} could not be completed. No balance was deducted from your game account.",
            'warning',
            'redeem'
        );

        EmailTemplateMailer::fireTrigger('transaction_rejected_redeem', $user, [
            'amount' => number_format((float) $transaction->amount, 2), 'type' => 'redeem', 'status' => 'Rejected',
        ]);

        return response()->json([
            'message' => 'Redeem could not be completed right now. Please try again shortly.',
            'transaction' => $transaction->fresh(),
            'instant' => true,
        ], 422);
    }
}
