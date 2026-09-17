<?php

namespace App\Services;

use App\Models\FastPaymentApiLog;
use App\Models\FastPaymentTransaction;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\TransactionLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Applies a verified FAST Payment status payload (pay_status/amount/transaction_id — the same
 * shape whether it arrived via the inbound webhook or an outbound Payment Order Query) to a
 * FastPaymentTransaction. Shared by FastPaymentWebhookController and the fast-payment:reconcile
 * console command so the two paths can never diverge or double-apply an outcome — the row lock
 * + "still pending?" check is the single idempotency guard both go through.
 */
class FastPaymentReconciler
{
    /**
     * "Test Merchant ID" values the vendor's own API documentation has labeled as such — two
     * different doc revisions have issued two different test IDs so far (1092768610 and
     * 1092767102), and both share the same dangerous behavior: FAST Payment's test/sandbox
     * environment auto-sends a validly-signed "payment successful" webhook/query response
     * shortly after ANY payment session is created under one of these IDs, regardless of
     * whether the end user ever actually completed a real payment. That's normal, intended
     * sandbox behavior for developer testing — but live debugging found it silently crediting
     * real user balance the moment these credentials were (even briefly) live in Site Settings,
     * because a validly-signed "success" is otherwise exactly what a real payment looks like.
     * A response reporting one of these merchant IDs is therefore NEVER trusted to credit real
     * balance, no matter what Site Settings happens to hold right now — this is a hard safety
     * net independent of (and in addition to) keeping the live credentials correct.
     */
    private const KNOWN_TEST_MERCHANT_IDS = ['1092768610', '1092767102'];

    public function apply(int $fastPaymentId, array $payload, string $source = 'webhook_notify'): void
    {
        DB::transaction(function () use ($fastPaymentId, $payload, $source) {
            $fastPayment = FastPaymentTransaction::where('id', $fastPaymentId)->lockForUpdate()->first();
            if (!$fastPayment || $fastPayment->payment_status !== 'pending') {
                $this->log($source, $payload, false, 'Already processed — ignored duplicate/late delivery.', $fastPaymentId);

                return;
            }

            $reportedMerchantId = (string) ($payload['merchant_id'] ?? '');
            if (in_array($reportedMerchantId, self::KNOWN_TEST_MERCHANT_IDS, true)) {
                $fastPayment->raw_response = $payload;
                $fastPayment->save();
                $this->log($source, $payload, false, "Blocked: confirmation reported a known TEST merchant ID ({$reportedMerchantId}), not a real payment — never auto-credited.", $fastPaymentId);
                report(new \Exception("FAST Payment: blocked a TEST-merchant-ID auto-confirm for order {$fastPayment->order_sn} (merchant_id={$reportedMerchantId}) — needs manual review; Site Settings may have had test credentials live at some point."));

                return;
            }

            $payStatus = (string) ($payload['pay_status'] ?? '');
            $fastPayment->fast_transaction_id = $payload['transaction_id'] ?? null;
            $fastPayment->confirmed_amount = $payload['amount'] ?? null;
            $fastPayment->raw_response = $payload;

            if ($payStatus === '1') {
                $this->markCompleted($fastPayment);
            } elseif ($payStatus === '5') {
                $this->markFailed($fastPayment);
            } elseif ($payStatus === '4') {
                // Refund issued on an already-completed payment is a distinct, rarer event —
                // never auto-reverse a balance credit here; flag it for a human to review.
                $fastPayment->payment_status = 'completed';
                $fastPayment->save();
                report(new \Exception("FAST Payment refund issued for order {$fastPayment->order_sn} — needs manual admin review."));
            } else {
                // Unrecognized/still-processing status — save what we learned but never credit
                // balance on anything other than a confirmed pay_status=1. Stays 'pending' so a
                // later webhook or reconciliation pass can still resolve it.
                $fastPayment->save();
            }

            $this->log($source, $payload, true, null, $fastPayment->id);
        });
    }

    private function markCompleted(FastPaymentTransaction $fastPayment): void
    {
        $fastPayment->payment_status = 'completed';
        $fastPayment->confirmed_at = now();
        $fastPayment->save();

        $transaction = Transaction::find($fastPayment->transaction_id);
        if (!$transaction || $transaction->status !== 'pending') {
            return;
        }

        // Row lock so a webhook/reconciliation for a different order landing for the SAME user
        // at the same moment can never lose an update on this read-modify-write.
        $user = $fastPayment->user_id ? User::where('id', $fastPayment->user_id)->lockForUpdate()->first() : null;
        $balanceBefore = $user ? (float) $user->balance : null;
        if ($user) {
            $user->balance = $balanceBefore + (float) $fastPayment->requested_amount;
            $user->save();
        }

        $transaction->status = 'approved';
        $transaction->reviewed_at = now();
        $transaction->provider = 'FAST Payment (' . $fastPayment->provider . ')';
        $transaction->provider_reference = $fastPayment->fast_transaction_id;
        $transaction->balance_before = $balanceBefore;
        $transaction->balance_after = $user ? (float) $user->balance : null;
        $transaction->save();

        TransactionLog::create([
            'transaction_id' => $transaction->id,
            'action' => 'fast_payment_confirmed',
            'old_status' => 'pending',
            'new_status' => 'approved',
            'old_amount' => $transaction->amount,
            'new_amount' => $transaction->amount,
            'note' => "Auto-approved via verified FAST Payment status (order {$fastPayment->order_sn}).",
            'action_at' => now(),
        ]);

        if ($user) {
            Notification::notify(
                $user->id,
                'Deposit Confirmed',
                "Your deposit of \${$fastPayment->requested_amount} has been confirmed and added to your balance.",
                'success',
                'deposit'
            );
        }
    }

    /**
     * Auto-fails a deposit that has sat 'pending' too long with no confirmation from FAST —
     * e.g. the user was redirected to checkout but never actually completed payment there (closed
     * the tab, the checkout page itself failed to load, etc.). Without this, such a deposit shows
     * "still processing" to the user forever, since nothing will ever arrive to resolve it — no
     * webhook fires for a payment that was never made, and repeated status queries just keep
     * saying "still processing" too. Reuses the exact same markFailed() path as a real failure
     * webhook, so the transaction/notification/audit trail is identical either way. Called only
     * by the fast-payment:reconcile command, never from an inbound payload — the lockForUpdate +
     * "still pending?" check is what keeps this safe to run repeatedly without racing a webhook
     * or query result that resolves the same row moments later.
     */
    public function expire(int $fastPaymentId, string $reason): void
    {
        DB::transaction(function () use ($fastPaymentId, $reason) {
            $fastPayment = FastPaymentTransaction::where('id', $fastPaymentId)->lockForUpdate()->first();
            if (!$fastPayment || $fastPayment->payment_status !== 'pending') {
                return;
            }

            $this->markFailed($fastPayment);
            $this->log('auto_expire', ['reason' => $reason], true, $reason, $fastPayment->id);
        });
    }

    private function markFailed(FastPaymentTransaction $fastPayment): void
    {
        $fastPayment->payment_status = 'failed';
        $fastPayment->save();

        $transaction = Transaction::find($fastPayment->transaction_id);
        if ($transaction && $transaction->status === 'pending') {
            // Nothing was ever credited for a pending deposit — balance is simply untouched, so
            // before/after both equal the user's current balance (zero net effect).
            $currentBalance = $fastPayment->user ? (float) $fastPayment->user->balance : null;
            $transaction->status = 'rejected';
            $transaction->reviewed_at = now();
            $transaction->provider = 'FAST Payment (' . $fastPayment->provider . ')';
            $transaction->failure_reason = 'FAST Payment reported this deposit as failed (order ' . $fastPayment->order_sn . ').';
            $transaction->balance_before = $currentBalance;
            $transaction->balance_after = $currentBalance;
            $transaction->save();

            TransactionLog::create([
                'transaction_id' => $transaction->id,
                'action' => 'fast_payment_failed',
                'old_status' => 'pending',
                'new_status' => 'rejected',
                'note' => "FAST Payment reported failure (order {$fastPayment->order_sn}).",
                'action_at' => now(),
            ]);
        }
    }

    public function log(string $action, array $payload, bool $success, ?string $error = null, ?int $fastPaymentId = null, ?bool $signatureValid = null): void
    {
        $fastPayment = $fastPaymentId ? FastPaymentTransaction::find($fastPaymentId) : null;
        $providerReference = $payload['transaction_id'] ?? $payload['outer_order_sn'] ?? $fastPayment?->order_sn ?? null;

        FastPaymentApiLog::create([
            'fast_payment_transaction_id' => $fastPaymentId,
            'provider' => 'FAST Payment',
            'user_id' => $fastPayment?->user_id,
            'provider_reference' => $providerReference,
            'action' => $action,
            'request_payload' => PayloadSanitizer::sanitize($payload),
            'response_payload' => null,
            'signature_valid' => $signatureValid ?? true,
            'success' => $success,
            'error_message' => $error,
            'duration_ms' => null,
            'created_at' => now(),
        ]);
    }
}
