<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use App\Services\EmailTemplateMailer;
use App\Services\GameApiProvider\Provisioner;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class UserTransferApiController extends Controller
{
    public function __construct(private Provisioner $provisioner)
    {
    }

    /**
     * "Transfer wallet balance into a game account" — i.e. Recharge. The amount is always
     * reserved (deducted) immediately and locked against the user row, so two concurrent
     * submissions from the same user can never jointly overdraw a balance they don't have.
     *
     * When the selected game has a Game API provider assigned with automate_deposit on, the
     * reservation is confirmed INSTANTLY in this same request: the provider's recharge API is
     * called synchronously, and the reservation is either finalized (provider confirmed) or
     * fully refunded (provider failed) — the wallet is never left permanently debited for a
     * recharge that didn't actually happen on the provider's side.
     *
     * Otherwise (no provider assigned, or automation off), this falls back to the original
     * behavior unchanged: the reservation sits as a pending Transaction until an admin reviews
     * it via AdminTransactionApiController@review, which refunds it on rejection.
     */
    public function transfer(Request $request)
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

        $amount = (float) $validated['amount'];
        $idempotencyKey = $validated['idempotency_key'] ?? null;

        // Idempotent replay: a duplicate submission (double-click, or a retried network
        // request) carrying the same key returns the original outcome instead of reserving
        // the balance a second time.
        if ($idempotencyKey) {
            $existing = Transaction::where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return response()->json([
                    'message' => 'This transfer was already submitted.',
                    'transaction' => $existing,
                    'new_balance' => (float) $user->fresh()->balance,
                    'instant' => $existing->status !== 'pending',
                ], 200);
            }
        }

        $outcome = DB::transaction(function () use ($user, $game, $amount, $validated, $idempotencyKey) {
            // Lock the user row for the duration of the balance check + deduction so a second
            // concurrent request from the same user always sees the post-deduction balance.
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            if ((float) $locked->balance < $amount) {
                return ['ok' => false, 'reason' => 'insufficient_balance'];
            }

            $balanceBefore = (float) $locked->balance;
            $locked->balance = $balanceBefore - $amount;
            $locked->save();

            try {
                $transaction = Transaction::create([
                    'user_id' => $user->id,
                    'game_id' => $game->id,
                    'type' => 'transfer',
                    'amount' => $amount,
                    'status' => 'pending',
                    'balance_reserved' => true,
                    'idempotency_key' => $idempotencyKey,
                    'balance_before' => $balanceBefore,
                    'notes' => $validated['notes'] ?? null,
                ]);
            } catch (QueryException $e) {
                // Unique constraint on idempotency_key — a genuinely simultaneous duplicate
                // request won this race; undo our own deduction and let the caller re-fetch
                // the winning transaction below instead of creating/charging a second one.
                if ($idempotencyKey && str_contains($e->getMessage(), 'idempotency_key')) {
                    $locked->balance = (float) $locked->balance + $amount;
                    $locked->save();

                    return ['ok' => false, 'reason' => 'duplicate'];
                }
                throw $e;
            }

            return ['ok' => true, 'transaction' => $transaction];
        });

        if (!$outcome['ok']) {
            if ($outcome['reason'] === 'duplicate') {
                $existing = Transaction::where('user_id', $user->id)->where('idempotency_key', $idempotencyKey)->first();

                return response()->json([
                    'message' => 'This transfer was already submitted.',
                    'transaction' => $existing,
                    'new_balance' => (float) $user->fresh()->balance,
                    'instant' => $existing && $existing->status !== 'pending',
                ], 200);
            }

            return response()->json(['message' => 'Insufficient account balance.'], 400);
        }

        /** @var Transaction $transaction */
        $transaction = $outcome['transaction'];

        // Only attempt the instant path when this game is actually configured for it —
        // otherwise skip straight to the unchanged pending-admin-review flow below.
        if ($this->provisioner->depositAutomationEnabled($game->id)) {
            try {
                $sync = $this->provisioner->instantRecharge($user->id, $game->id, $amount, $transaction->id);
            } catch (Throwable $e) {
                report($e);
                $sync = ['success' => false, 'message' => 'Unexpected error while contacting the game provider.'];
            }

            return $sync['success']
                ? $this->finalizeInstantRecharge($user, $game, $amount, $transaction, $sync)
                : $this->refundFailedInstantRecharge($user, $game, $amount, $transaction, $sync);
        }

        EmailTemplateMailer::fireTrigger('transaction_pending_transfer', $user, [
            'amount' => number_format($amount, 2), 'type' => 'transfer', 'status' => 'Pending', 'game_name' => $game->name,
        ]);

        $submitter = $user->username ?? $user->name ?? 'A user';
        Notification::notifyAdmins(
            'New Transfer Request',
            "{$submitter} requested to transfer \$" . number_format($amount, 2) . " into {$game->name}.",
            'info',
            'transfer'
        );

        return response()->json([
            'message' => 'Transfer request submitted successfully. Waiting for admin approval.',
            'transaction' => $transaction,
            'new_balance' => (float) $user->fresh()->balance,
            'instant' => false,
        ], 201);
    }

    private function finalizeInstantRecharge(User $user, Game $game, float $amount, Transaction $transaction, array $sync)
    {
        $transaction->status = 'approved';
        $transaction->reviewed_at = now();
        $transaction->provider_reference = $sync['provider_reference'] ?? null;
        $transaction->provider = $sync['provider_name'] ?? null;
        // The deduction already happened at reservation time (balance_before was captured
        // then); nothing further changes the balance here, so balance_after is simply that.
        $transaction->balance_after = $transaction->balance_before !== null
            ? (float) $transaction->balance_before - $amount
            : (float) $user->fresh()->balance;
        $transaction->save();

        TransactionLog::create([
            'transaction_id' => $transaction->id,
            'action' => 'auto_recharge_confirmed',
            'action_by' => null, // system/automated — no human admin involved.
            'old_status' => 'pending',
            'new_status' => 'approved',
            'note' => 'Instant recharge confirmed via Game API.',
            'action_at' => now(),
        ]);

        Notification::notify(
            $user->id,
            'Recharge Completed',
            "Your recharge of \$" . number_format($amount, 2) . " to {$game->name} was completed instantly.",
            'success',
            'transfer'
        );

        EmailTemplateMailer::fireTrigger('transaction_approved_transfer', $user, [
            'amount' => number_format($amount, 2), 'type' => 'transfer', 'status' => 'Approved',
        ]);

        return response()->json([
            'message' => 'Recharge completed instantly.',
            'transaction' => $transaction->fresh(),
            'new_balance' => (float) $user->fresh()->balance,
            'instant' => true,
        ], 201);
    }

    private function refundFailedInstantRecharge(User $user, Game $game, float $amount, Transaction $transaction, array $sync)
    {
        DB::transaction(function () use ($user, $amount, $transaction, $sync) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $locked->balance = (float) $locked->balance + $amount;
            $locked->save();

            // balance_reserved is intentionally left true here, matching how a manually
            // rejected transfer already works elsewhere (AdminTransactionApiController::review/
            // undo) — it marks "this amount participates in reserve/refund accounting", not
            // "is currently deducted right now".
            $transaction->status = 'rejected';
            $transaction->reviewed_at = now();
            $reason = $sync['message'] ?? 'Game API recharge failed.';
            $transaction->notes = trim(($transaction->notes ? $transaction->notes . ' — ' : '') . "Auto-rejected: {$reason} Amount refunded automatically.");
            $transaction->failure_reason = $reason;
            $transaction->provider = $sync['provider_name'] ?? null;
            // Refunded in full, so the net effect is zero — balance ends up exactly where it
            // started, which balance_after should reflect.
            $transaction->balance_after = $transaction->balance_before;
            $transaction->save();

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'auto_recharge_failed_refunded',
                'action_by' => null,
                'old_status' => 'pending',
                'new_status' => 'rejected',
                'note' => $reason,
                'action_at' => now(),
            ]);
        });

        Notification::notify(
            $user->id,
            'Recharge Failed',
            "Your recharge of \$" . number_format($amount, 2) . " to {$game->name} could not be completed. The amount has been refunded to your balance.",
            'warning',
            'transfer'
        );

        EmailTemplateMailer::fireTrigger('transaction_rejected_transfer', $user, [
            'amount' => number_format($amount, 2), 'type' => 'transfer', 'status' => 'Rejected',
        ]);

        return response()->json([
            'message' => 'Recharge could not be completed right now. Your balance has been refunded.',
            'transaction' => $transaction->fresh(),
            'new_balance' => (float) $user->fresh()->balance,
            'instant' => true,
        ], 422);
    }
}
