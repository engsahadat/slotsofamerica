<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ExportRequest;
use App\Models\FastPaymentTransaction;
use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use App\Services\EmailTemplateMailer;
use App\Services\GameApiProvider\Provisioner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class AdminTransactionApiController extends Controller
{
    public function __construct(private Provisioner $provisioner)
    {
    }

    /**
     * Powers the Export Requests / TransactionExportPanel download flow.
     * Admins get free direct access; managers must pass the id of an
     * export_requests row that belongs to them, is approved, and hasn't
     * passed its approved_expires_at window (see ExportRequest::isApprovedAndUnexpired).
     */
    public function export(Request $request)
    {
        $validated = $request->validate([
            'from' => 'required|date',
            'to' => 'required|date',
            'type' => 'nullable|in:all,deposit,withdraw,redeem,transfer',
            'status' => 'nullable|in:all,pending,completed,rejected',
            'export_request_id' => 'nullable|integer',
        ]);

        $user = $request->user();
        if (!$user->isAdmin()) {
            $exportRequestId = $validated['export_request_id'] ?? null;
            $exportReq = $exportRequestId ? ExportRequest::find($exportRequestId) : null;
            if (!$exportReq || $exportReq->manager_id !== $user->id || !$exportReq->isApprovedAndUnexpired()) {
                return response()->json(['message' => 'No approved export access. Submit a request and wait for admin approval.'], 403);
            }
        }

        $from = \Carbon\Carbon::parse($validated['from'])->startOfDay();
        $to = \Carbon\Carbon::parse($validated['to'])->endOfDay();

        $query = Transaction::with(['user:id,name,username,email', 'game:id,name'])
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at');

        $type = $validated['type'] ?? 'all';
        if ($type !== 'all') {
            $query->where('type', $type);
        }

        $status = $validated['status'] ?? 'all';
        if ($status === 'completed') {
            $query->whereIn('status', ['approved', 'completed']);
        } elseif ($status !== 'all') {
            $query->where('status', $status);
        }

        $rows = $query->limit(10000)->get()->map(function (Transaction $t) {
            $userLabel = $t->user?->name ?: $t->user?->username ?: $t->user?->email ?: 'User';
            return [
                'id' => $t->id,
                'created_at' => $t->created_at,
                'type' => $t->type,
                'status' => $t->status,
                'amount' => (float) $t->amount,
                'notes' => $t->notes,
                'user_label' => $userLabel,
                'game_label' => $t->game?->name ?: '—',
            ];
        });

        return response()->json(['rows' => $rows]);
    }

    public function index(Request $request)
    {
        $query = Transaction::with(['user', 'game', 'reviewer', 'gateway:id,name', 'gatewayAccount:id,account_name,account_number'])->latest();

        if ($request->filled('type')) {
            $query->where('type', (string) $request->input('type'));
        }

        if ($request->filled('status')) {
            // Accept the UI's "completed" tab label as an alias for the real "approved" enum
            // value (transactions.status is pending|approved|rejected — there is no "completed").
            $status = (string) $request->input('status');
            $query->where('status', $status === 'completed' ? 'approved' : $status);
        }

        // Admin tabs are always scoped to a single type+status at a time, so this is a bounded
        // subset in practice (not "every transaction ever"); capped defensively regardless.
        $transactions = $query->limit(2000)->get();

        // For redeem/transfer, attach the game username the user actually plays under (from
        // their approved GameUnlockRequest) — batched into one query rather than N+1 per row.
        $pairs = $transactions->filter(fn ($t) => in_array($t->type, ['redeem', 'transfer']) && $t->game_id)
            ->map(fn ($t) => [$t->user_id, $t->game_id])->unique(fn ($p) => "{$p[0]}_{$p[1]}");
        if ($pairs->isNotEmpty()) {
            $userIds = $pairs->pluck(0)->unique()->values();
            $gameIds = $pairs->pluck(1)->unique()->values();
            $unlocks = GameUnlockRequest::whereIn('user_id', $userIds)
                ->whereIn('game_id', $gameIds)
                ->where('status', 'approved')
                ->get(['user_id', 'game_id', 'username']);
            $usernameMap = [];
            foreach ($unlocks as $u) {
                $usernameMap["{$u->user_id}_{$u->game_id}"] = $u->username;
            }
            $transactions->each(function (Transaction $t) use ($usernameMap) {
                $t->game_username = $usernameMap["{$t->user_id}_{$t->game_id}"] ?? null;
            });
        }

        $this->attachSource($transactions);

        return response()->json(['transactions' => $transactions]);
    }

    /**
     * Admin Visibility: classify each transaction's real origin — manual, FAST Payment, or
     * Game API — from actual recorded evidence rather than config that might not reflect what
     * happened. A game having a provider assigned (even with automation on) proves nothing by
     * itself: automation could have been off at submit time, or the call could have failed and
     * fallen back to manual review. The only trustworthy signals are a linked
     * FastPaymentTransaction row (deposit actually went through that gateway) and a
     * game_api_logs row actually recorded against this transaction id (a recharge/withdraw call
     * was actually made, whether it succeeded or not) — both batched, not per-row queries.
     */
    private function attachSource($transactions): void
    {
        $ids = $transactions->pluck('id');

        $fastByTxnId = FastPaymentTransaction::whereIn('transaction_id', $ids)
            ->get(['transaction_id', 'provider', 'order_sn', 'fast_transaction_id', 'payment_status'])
            ->keyBy('transaction_id');

        $gameApiTouchedIds = GameApiLog::whereIn('related_transaction_id', $ids)
            ->whereIn('action', ['recharge', 'withdraw'])
            ->pluck('related_transaction_id')
            ->unique();

        $transactions->each(function (Transaction $t) use ($fastByTxnId, $gameApiTouchedIds) {
            if ($fastByTxnId->has($t->id)) {
                $fp = $fastByTxnId->get($t->id);
                $t->source = 'fast_payment';
                // The transaction's own provider/provider_reference are only set once resolved
                // (webhook or reconcile) — fall back to the linked FastPaymentTransaction's own
                // fields so a still-pending deposit is identifiable too.
                $t->source_provider = $t->provider ?: ('FAST Payment (' . $fp->provider . ')');
                $t->source_reference = $t->provider_reference ?: ($fp->fast_transaction_id ?: $fp->order_sn);
                $t->source_status = $fp->payment_status;
            } elseif ($gameApiTouchedIds->contains($t->id)) {
                $t->source = 'game_api';
                $t->source_provider = $t->provider;
                $t->source_reference = $t->provider_reference;
                $t->source_status = $t->status;
            } else {
                $t->source = 'manual';
                $t->source_provider = $t->type === 'deposit' ? ($t->gateway->name ?? null) : null;
                $t->source_reference = null;
                $t->source_status = $t->status;
            }
        });
    }

    public function pendingCounts()
    {
        $counts = Transaction::where('status', 'pending')
            ->selectRaw('type, count(*) as count')
            ->groupBy('type')
            ->pluck('count', 'type');

        return response()->json(['counts' => $counts]);
    }

    public function logs($id)
    {
        Transaction::findOrFail($id);
        $logs = TransactionLog::where('transaction_id', $id)
            ->with('actor:id,name,username')
            ->orderByDesc('action_at')
            ->get();

        return response()->json(['logs' => $logs]);
    }

    /** Reverts an approved/rejected transaction back to pending, undoing whatever balance
     * effect review() applied for that specific status transition. */
    public function undo(Request $request, $id)
    {
        $validated = $request->validate(['reason' => 'nullable|string']);
        $admin = $request->user();
        $transaction = Transaction::findOrFail($id);

        if ($transaction->status === 'pending') {
            return response()->json(['message' => 'Transaction is already pending.'], 400);
        }

        $user = User::find($transaction->user_id);
        $wasCredited = $transaction->status === 'approved' && in_array($transaction->type, ['deposit', 'redeem']);
        $wasRefunded = $transaction->status === 'rejected' && in_array($transaction->type, ['withdraw', 'transfer']) && $transaction->balance_reserved;

        if ($user && ($wasCredited || $wasRefunded) && (float) $user->balance < (float) $transaction->amount) {
            return response()->json(['message' => 'Cannot undo: the user\'s balance is lower than this transaction\'s amount (funds may have already been spent/withdrawn).'], 422);
        }

        DB::transaction(function () use ($transaction, $user, $wasCredited, $wasRefunded, $validated, $admin) {
            $oldStatus = $transaction->status;

            if ($user && ($wasCredited || $wasRefunded)) {
                // Locked so this undo can't race a concurrent balance change on the same user.
                $locked = User::where('id', $user->id)->lockForUpdate()->first();
                $locked->balance = (float) $locked->balance - (float) $transaction->amount;
                $locked->save();
            }

            $transaction->status = 'pending';
            $transaction->reviewed_by = null;
            $transaction->reviewed_at = null;
            // No longer a completed transaction — its previous before/after snapshot describes
            // a state that no longer holds; it'll be recaptured accurately if reviewed again.
            $transaction->balance_before = null;
            $transaction->balance_after = null;
            $transaction->save();

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'undo',
                'action_by' => $admin->id,
                'old_status' => $oldStatus,
                'new_status' => 'pending',
                'note' => $validated['reason'] ?? null,
            ]);
        });

        AuditLog::record($request, 'undid_transaction', 'Transaction', $transaction->id, ['reason' => $validated['reason'] ?? null]);

        return response()->json(['message' => 'Transaction reverted to pending.', 'transaction' => $transaction->fresh()]);
    }

    /** Edits a transaction's amount, adjusting the user's balance by the delta if this
     * transaction is currently the source of a live balance effect (credited or reserved). */
    public function editAmount(Request $request, $id)
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|gt:0',
            'reason' => 'nullable|string',
        ]);
        $admin = $request->user();
        $transaction = Transaction::findOrFail($id);
        $oldAmount = (float) $transaction->amount;
        $newAmount = (float) $validated['amount'];

        if ($oldAmount === $newAmount) {
            return response()->json(['message' => 'Amount unchanged.', 'transaction' => $transaction]);
        }

        $user = User::find($transaction->user_id);
        $isCredited = $transaction->status === 'approved' && in_array($transaction->type, ['deposit', 'redeem']);
        $isReserved = in_array($transaction->status, ['pending', 'approved']) && in_array($transaction->type, ['withdraw', 'transfer']) && $transaction->balance_reserved;
        $delta = $newAmount - $oldAmount;
        $balanceDelta = $isCredited ? $delta : ($isReserved ? -$delta : 0);

        if ($user && $balanceDelta !== 0.0 && (float) $user->balance + $balanceDelta < 0) {
            return response()->json(['message' => 'Cannot apply this change: it would make the user\'s balance negative.'], 422);
        }

        DB::transaction(function () use ($transaction, $user, $balanceDelta, $oldAmount, $newAmount, $validated, $admin) {
            if ($user && $balanceDelta !== 0.0) {
                // Locked so this amend can't race a concurrent balance change on the same user.
                $locked = User::where('id', $user->id)->lockForUpdate()->first();
                $locked->balance = (float) $locked->balance + $balanceDelta;
                $locked->save();
                // The ledger snapshot on this transaction is now stale by exactly the delta —
                // keep it accurate rather than leaving it describing the pre-amend amount.
                if ($transaction->balance_after !== null) {
                    $transaction->balance_after = (float) $transaction->balance_after + $balanceDelta;
                }
            }

            $transaction->amount = $newAmount;
            $transaction->save();

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'edit_amount',
                'action_by' => $admin->id,
                'old_amount' => $oldAmount,
                'new_amount' => $newAmount,
                'note' => $validated['reason'] ?? null,
            ]);
        });

        AuditLog::record($request, 'edited_transaction_amount', 'Transaction', $transaction->id, ['old_amount' => $oldAmount, 'new_amount' => $newAmount]);

        return response()->json(['message' => 'Amount updated.', 'transaction' => $transaction->fresh()]);
    }

    public function review(Request $request, $id)
    {
        $admin = $request->user();
        $transaction = Transaction::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'note' => 'nullable|string',
        ]);

        if ($transaction->status !== 'pending') {
            return response()->json(['message' => 'Transaction has already been reviewed.'], 400);
        }

        DB::transaction(function () use ($transaction, $validated, $admin) {
            $oldStatus = $transaction->status;
            $transaction->status = $validated['status'];
            $transaction->reviewed_by = $admin->id;
            $transaction->reviewed_at = now();

            // Locked for the duration of the read-modify-write below so a concurrent action
            // touching this same user's balance (another review, an instant recharge/redeem,
            // a FAST Payment webhook) can never lose an update.
            $user = User::where('id', $transaction->user_id)->lockForUpdate()->first();
            if ($user) {
                // withdraw/transfer already captured their TRUE pre-reservation balance at
                // submission time (before this transaction's own deduction was applied) — keep
                // that, rather than overwriting it with the current (already-reserved) balance.
                // deposit/redeem never reserve anything, so this is naturally still null for
                // them and gets captured fresh, right here, right before their own effect.
                $balanceBefore = $transaction->balance_before !== null
                    ? (float) $transaction->balance_before
                    : (float) $user->balance;
                // deposit/redeem credit the balance only once approved.
                if (in_array($transaction->type, ['deposit', 'redeem']) && $validated['status'] === 'approved') {
                    $user->balance = $balanceBefore + (float)$transaction->amount;
                    $user->save();
                } elseif (in_array($transaction->type, ['withdraw', 'transfer']) && $validated['status'] === 'rejected' && $transaction->balance_reserved) {
                    // withdraw/transfer reserve balance at submit time; refund it if rejected.
                    $user->balance = $balanceBefore + (float)$transaction->amount;
                    $user->save();
                }
                // Every other case (approved withdraw/transfer, rejected deposit/redeem) has no
                // further balance math here — before/after are simply equal, which correctly
                // documents "no additional effect happened at this review step".
                $transaction->balance_before = $balanceBefore;
                $transaction->balance_after = (float) $user->balance;
            }

            if ($validated['status'] === 'rejected' && !empty($validated['note'])) {
                $transaction->failure_reason = $validated['note'];
            }

            if (!$transaction->provider) {
                if (in_array($transaction->type, ['redeem', 'transfer'], true) && $transaction->game_id) {
                    $assignment = GameProviderAssignment::where('game_id', $transaction->game_id)->first();
                    $provider = $assignment ? GameApiProvider::find($assignment->provider_id) : null;
                    if ($provider) {
                        $transaction->provider = $provider->display_name ?: $provider->name;
                    }
                } elseif ($transaction->type === 'deposit' && $transaction->gateway_id) {
                    $transaction->provider = $transaction->gateway?->name;
                }
            }

            $transaction->save();

            // A rejected deposit that's actually a still-pending FAST Payment session (e.g. the
            // user never completed checkout, or the gateway never reported back) gets its
            // linked FastPaymentTransaction marked 'cancelled' — distinct from 'failed' (which
            // means the gateway itself reported a failure). This also closes it out so a stray
            // late webhook or a future reconcile pass can never act on it again — markCompleted/
            // markFailed both bail out unless the core Transaction is still 'pending'.
            if ($validated['status'] === 'rejected' && $transaction->type === 'deposit') {
                FastPaymentTransaction::where('transaction_id', $transaction->id)
                    ->where('payment_status', 'pending')
                    ->update(['payment_status' => 'cancelled']);
            }

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'review_' . $validated['status'],
                'action_by' => $admin->id,
                'old_status' => $oldStatus,
                'new_status' => $validated['status'],
                'note' => $validated['note'] ?? null,
            ]);
        });

        AuditLog::record($request, $validated['status'] . '_transaction', 'Transaction', $transaction->id, [
            'type' => $transaction->type,
            'amount' => (float)$transaction->amount,
            'note' => $validated['note'] ?? null,
        ]);

        // Best-effort mirror onto the assigned Game API provider's own panel — only actually
        // attempted when that provider has automate_deposit/automate_withdraw turned on (off by
        // default). Never affects our own balance math above, which is already final at this
        // point regardless of whether this succeeds, fails, or isn't applicable.
        $providerSyncMessage = null;
        if ($validated['status'] === 'approved' && $transaction->game_id && $this->providerAutomationApplies($transaction)) {
            try {
                $sync = $this->provisioner->processTransaction($transaction->id);
                if (!($sync['success'] ?? false)) {
                    $providerSyncMessage = 'Note: provider sync failed — ' . ($sync['message'] ?? 'unknown error') . '. Balance is still correct; only the provider-side mirror did not go through.';
                }
            } catch (Throwable $e) {
                report($e);
                $providerSyncMessage = 'Note: provider sync raised an unexpected error — balance is still correct; check Game API logs.';
            }
        }

        $typeLabel = ucfirst($transaction->type);
        $amount = number_format((float)$transaction->amount, 2);
        Notification::notify(
            $transaction->user_id,
            $validated['status'] === 'approved' ? "{$typeLabel} Approved" : "{$typeLabel} Rejected",
            $validated['status'] === 'approved'
                ? "Your {$transaction->type} of \${$amount} has been approved."
                : "Your {$transaction->type} of \${$amount} was rejected." . (!empty($validated['note']) ? " Reason: {$validated['note']}" : ''),
            $validated['status'] === 'approved' ? 'success' : 'warning',
            $transaction->type
        );

        $notifiedUser = User::find($transaction->user_id);
        if ($notifiedUser) {
            EmailTemplateMailer::fireTrigger("transaction_{$validated['status']}_{$transaction->type}", $notifiedUser, [
                'amount' => $amount,
                'type' => $transaction->type,
                'status' => ucfirst($validated['status']),
            ]);
        }

        return response()->json([
            'message' => "Transaction marked as {$validated['status']}." . ($providerSyncMessage ? " {$providerSyncMessage}" : ''),
            'transaction' => $transaction->fresh(),
        ]);
    }

    /**
     * Cheap pre-check so review() only calls the Provisioner (and only builds a user-facing
     * sync message) when a live provider call is actually going to be attempted — i.e. skips
     * silently for the common case (no assignment, or automation left off) instead of having
     * to distinguish "not applicable" from "attempted and failed" after the fact.
     */
    private function providerAutomationApplies(Transaction $transaction): bool
    {
        $assignment = GameProviderAssignment::where('game_id', $transaction->game_id)->first();
        if (!$assignment) {
            return false;
        }
        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return false;
        }
        // Must mirror Provisioner::processTransaction()'s direction exactly (see the comment
        // there): 'deposit'/'transfer' add to the player's in-game balance (gated by
        // automate_deposit), 'redeem'/'withdraw' remove from it (gated by automate_withdraw).
        $addsToGameBalance = in_array($transaction->type, ['deposit', 'transfer'], true);
        $removesFromGameBalance = in_array($transaction->type, ['redeem', 'withdraw'], true);

        return ($addsToGameBalance && $provider->automate_deposit) || ($removesFromGameBalance && $provider->automate_withdraw);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'user_id' => 'required|exists:users,id',
            'type' => 'required|in:deposit,withdraw,transfer,redeem',
            'amount' => 'required|numeric|gt:0',
            'status' => 'required|in:pending,approved,rejected',
            'game_id' => 'nullable|exists:games,id',
            'note' => 'nullable|string',
        ]);

        $admin = $request->user();
        $user = User::findOrFail($validated['user_id']);

        $transaction = DB::transaction(function () use ($user, $validated, $admin) {
            // Locked for the balance read-modify-write below, matching every other
            // balance-mutating path (review, instant recharge/redeem, FAST Payment webhook).
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            $balanceBefore = (float) $locked->balance;
            $balanceAfter = $balanceBefore;

            if ($validated['status'] === 'approved') {
                if (in_array($validated['type'], ['deposit', 'redeem'])) {
                    $balanceAfter = $balanceBefore + (float)$validated['amount'];
                } elseif (in_array($validated['type'], ['withdraw', 'transfer'])) {
                    $balanceAfter = max(0, $balanceBefore - (float)$validated['amount']);
                }
                $locked->balance = $balanceAfter;
                $locked->save();
            }

            return Transaction::create([
                'user_id' => $user->id,
                'type' => $validated['type'],
                'amount' => $validated['amount'],
                'status' => $validated['status'],
                'game_id' => $validated['game_id'] ?? null,
                'reviewed_by' => $admin->id,
                'reviewed_at' => now(),
                'balance_before' => $balanceBefore,
                'balance_after' => $balanceAfter,
                'notes' => $validated['note'] ?? null,
            ]);
        });

        AuditLog::record($request, 'created_transaction', 'Transaction', $transaction->id, [
            'type' => $transaction->type,
            'amount' => (float)$transaction->amount,
            'status' => $transaction->status,
        ]);

        return response()->json([
            'message' => 'Transaction created successfully.',
            'transaction' => $transaction->load(['user', 'game', 'reviewer']),
        ], 201);
    }

    public function destroy($id)
    {
        $transaction = Transaction::findOrFail($id);
        $transaction->delete();

        return response()->json(['message' => 'Transaction deleted successfully.']);
    }
}
