<?php

namespace App\Console\Commands;

use App\Models\GameApiLog;
use App\Models\Transaction;
use App\Services\GameApiProvider\Provisioner;
use Illuminate\Console\Command;

/**
 * Failure & Recovery Handling — the narrow gap the instant Recharge/Redeem paths can't close on
 * their own: both are fully synchronous within one HTTP request (reserve/create -> call
 * provider -> finalize/refund), so the only way a transaction gets stuck between those steps is
 * the PHP process itself dying mid-request (a server restart, an out-of-memory kill) — rare, but
 * not impossible, and NOT something to auto-resolve. A recharge stuck here means the wallet is
 * reserved with no confirmed outcome; a redeem stuck here means the provider MAY have already
 * deducted the player's in-game balance with our wallet never credited for it — real money at
 * stake either way, and the honest recovery step is a human looking at it via the existing
 * admin Transactions undo/edit tools, not this command guessing.
 *
 * Report-only, by design: "Do not blindly retry financial operations unless idempotency is
 * guaranteed" — there is no reliable, generic way to ask a Game API provider "did my last
 * recharge/withdraw call actually apply?", so this never touches balance or transaction status.
 */
class DetectStuckFinancialTransactions extends Command
{
    protected $signature = 'transactions:detect-stuck
        {--older-than=15 : Only flag pending transactions at least this many minutes old}
        {--limit=100 : Maximum transactions to scan}';

    protected $description = 'Report (never modify) recharge/redeem transactions that should have resolved instantly but are still pending — for manual admin review';

    public function __construct(private Provisioner $provisioner)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $cutoff = now()->subMinutes((int) $this->option('older-than'));

        $candidates = Transaction::whereIn('type', ['transfer', 'redeem'])
            ->where('status', 'pending')
            ->whereNotNull('game_id')
            ->where('created_at', '<=', $cutoff)
            ->limit((int) $this->option('limit'))
            ->get();

        $stuck = $candidates->filter(function (Transaction $t) {
            // Only flag ones whose game currently has automation on for this direction — those
            // are the ones the instant path SHOULD have resolved in seconds. A pending
            // transaction for a manual-only game is completely normal (awaiting admin review),
            // not stuck.
            return $t->type === 'transfer'
                ? $this->provisioner->depositAutomationEnabled($t->game_id)
                : $this->provisioner->withdrawAutomationEnabled($t->game_id);
        });

        if ($stuck->isEmpty()) {
            $this->info('No stuck recharge/redeem transactions found.');

            return self::SUCCESS;
        }

        $this->warn("Found {$stuck->count()} pending recharge/redeem transaction(s) older than {$this->option('older-than')} minute(s) whose game has automation enabled — these should have resolved instantly and did not.");
        $this->newLine();

        foreach ($stuck as $t) {
            // The strongest possible warning: a successful provider-side call already logged
            // against this exact transaction id means the provider likely already acted (game
            // balance moved) while our own wallet/status never got updated to match.
            $providerActed = GameApiLog::where('related_transaction_id', $t->id)
                ->whereIn('action', ['recharge', 'withdraw'])
                ->where('success', true)
                ->exists();

            $flag = $providerActed
                ? '⚠️  PROVIDER CALL SUCCEEDED — review immediately, funds may be at risk'
                : 'no confirmed provider-side action found in game_api_logs';

            $this->line(sprintf(
                '  #%d  type=%s  user_id=%d  game_id=%d  amount=%s  created_at=%s  — %s',
                $t->id, $t->type, $t->user_id, $t->game_id, $t->amount, $t->created_at, $flag
            ));
        }

        $this->newLine();
        $this->line('Resolve each manually via Admin > Transactions (Undo / Edit Amount / Review) after checking the actual outcome — this command never modifies anything.');

        return self::SUCCESS;
    }
}
