<?php

namespace App\Console\Commands;

use App\Models\FastPaymentTransaction;
use App\Services\FastPaymentReconciler;
use App\Services\FastPaymentService;
use Illuminate\Console\Command;

/**
 * Recovery path for the one real gap in the webhook-only design: if FAST Payment's webhook
 * delivery never reaches us (their outage, ours, a network partition, a dropped delivery),
 * a deposit could stay 'pending' forever with no other way to resolve it — the frontend only
 * polls status while the user happens to still be on the page.
 *
 * Run this periodically (e.g. every 5-15 minutes via a scheduled task/cron, since this app has
 * no queue worker) to actively query FAST for the true status of anything that's been pending
 * too long, and apply it through the exact same idempotent FastPaymentReconciler used by the
 * live webhook — so this can never double-credit a deposit the webhook already resolved, and a
 * webhook that arrives later can never double-credit one this command already resolved either.
 */
class ReconcileFastPayments extends Command
{
    protected $signature = 'fast-payment:reconcile
        {--older-than=10 : Only check deposits that have been pending at least this many minutes}
        {--expire-after=60 : Auto-fail a deposit still pending after this many minutes with no confirmation from FAST — otherwise "still processing" would show forever for a checkout the user never actually completed (blocked, abandoned, tab closed, etc.)}
        {--limit=50 : Maximum number of pending deposits to check in one run}
        {--dry-run : Query and report without applying any outcome}';

    protected $description = 'Query FAST Payment for the true status of pending deposits the webhook may have missed, and resolve them safely';

    public function __construct(private FastPaymentReconciler $reconciler)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $cutoff = now()->subMinutes((int) $this->option('older-than'));
        $pending = FastPaymentTransaction::where('payment_status', 'pending')
            ->where('created_at', '<=', $cutoff)
            ->limit((int) $this->option('limit'))
            ->get();

        if ($pending->isEmpty()) {
            $this->info('No stale pending FAST Payment deposits found.');

            return self::SUCCESS;
        }

        $this->info("Checking {$pending->count()} pending deposit(s) older than {$this->option('older-than')} minute(s)...");

        $expireCutoff = now()->subMinutes((int) $this->option('expire-after'));
        $resolved = 0;
        $stillPending = 0;
        $skipped = 0;
        $expired = 0;

        foreach ($pending as $fastPayment) {
            $isStale = $fastPayment->created_at->lte($expireCutoff);
            $dryRun = (bool) $this->option('dry-run');

            // Applies once a deposit couldn't be resolved from this query attempt (failed query,
            // bad signature, or a query that still says "still processing") — auto-fails it once
            // it's old enough that FAST giving us nothing conclusive almost certainly means the
            // checkout was abandoned or never completed (blocked page, closed tab, etc.), rather
            // than leaving the user staring at "still processing" forever with no way to retry.
            // $notStaleIsError distinguishes "still pending, just not old enough yet" (normal,
            // counts as still-pending) from "not stale yet, but this attempt was a query/signature
            // failure" (counts as skipped, same as before this auto-expire logic existed).
            $maybeExpire = function (string $reasonSuffix, bool $notStaleIsError = false) use ($fastPayment, $isStale, $dryRun, &$expired, &$stillPending, &$skipped) {
                if (!$isStale) {
                    if ($notStaleIsError) {
                        $skipped++;
                    } else {
                        $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): still pending — {$reasonSuffix}");
                        $stillPending++;
                    }

                    return;
                }
                if ($dryRun) {
                    $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): would expire — {$reasonSuffix} (dry run — not applied)");
                    $stillPending++;

                    return;
                }
                $this->reconciler->expire($fastPayment->id, "No confirmation received from FAST Payment within {$this->option('expire-after')} minute(s) ({$reasonSuffix}).");
                $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): expired — {$reasonSuffix}");
                $expired++;
            };

            $result = FastPaymentService::queryPayment($fastPayment->order_sn, $fastPayment->user_id);

            if (!$result['success'] || empty($result['body'])) {
                $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): query failed — {$result['error']}");
                $maybeExpire('query kept failing', notStaleIsError: true);

                continue;
            }

            // Same trust rule as the webhook: never act on a payload whose signature doesn't
            // check out, even though this came from an outbound call we initiated ourselves —
            // defense against a corrupted/tampered response is cheap and consistent.
            if (!FastPaymentService::verifySignature($result['body'])) {
                $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): query response failed signature verification — skipped");
                $this->reconciler->log('reconcile_query', $result['body'], false, 'Query response failed signature verification.', $fastPayment->id, false);
                $maybeExpire('query response failed signature verification', notStaleIsError: true);

                continue;
            }

            $payStatus = (string) ($result['body']['pay_status'] ?? '');

            if ($dryRun) {
                if (in_array($payStatus, ['1', '4', '5'], true)) {
                    $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): pay_status={$payStatus} — would resolve (dry run — not applied)");
                    $resolved++;
                } else {
                    $maybeExpire("gateway still reports pay_status={$payStatus}");
                }

                continue;
            }

            $this->reconciler->apply($fastPayment->id, $result['body'], 'reconcile_query');

            $fresh = $fastPayment->fresh();
            if ($fresh->payment_status !== 'pending') {
                $this->line("  #{$fastPayment->id} ({$fastPayment->order_sn}): resolved -> {$fresh->payment_status}");
                $resolved++;

                continue;
            }

            // Still pending after a fresh, validly-signed "still processing" query response.
            $maybeExpire("gateway still reports pay_status={$payStatus}");
        }

        $this->newLine();
        $this->info("Done. Resolved: {$resolved}, expired: {$expired}, still pending: {$stillPending}, skipped/errors: {$skipped}.");

        return self::SUCCESS;
    }
}
