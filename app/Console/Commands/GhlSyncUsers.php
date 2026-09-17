<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\GoHighLevelService;
use Illuminate\Console\Command;

/**
 * The "safe way for Admin to sync existing users to GHL" the integration spec calls for.
 * Runs over HTTP-timeout limits safely (this app has no queue worker), reports live progress,
 * and never aborts the whole run over one user's failure — GoHighLevelService::syncUser()
 * already never throws, and every attempt lands in ghl_api_logs regardless.
 */
class GhlSyncUsers extends Command
{
    protected $signature = 'ghl:sync-users
        {--limit= : Only sync the first N users (useful for a small first test)}
        {--failed-only : Only retry users who don\'t have a ghl_contact_id yet (a previous sync never succeeded) — the retry path for "GHL was unavailable"}
        {--dry-run : List who would be synced without calling the GHL API}';

    protected $description = 'Sync existing users\' profile data to GoHighLevel contacts (create-or-update, never duplicates)';

    public function handle(): int
    {
        $query = User::orderBy('id');
        if ($this->option('failed-only')) {
            $query->whereNull('ghl_contact_id');
        }
        if ($limit = $this->option('limit')) {
            $query->limit((int) $limit);
        }
        $users = $query->get();

        if ($users->isEmpty()) {
            $this->info('No users found.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info("Dry run — would sync {$users->count()} user(s):");
            foreach ($users as $user) {
                $this->line("  #{$user->id} {$user->username} <{$user->email}>" . ($user->ghl_contact_id ? " (already linked: {$user->ghl_contact_id})" : ''));
            }

            return self::SUCCESS;
        }

        $bar = $this->output->createProgressBar($users->count());
        $bar->start();

        $succeeded = 0;
        $failed = 0;
        $failures = [];

        foreach ($users as $user) {
            $result = GoHighLevelService::syncUser($user);
            if ($result['success']) {
                $succeeded++;
            } else {
                $failed++;
                $failures[] = "#{$user->id} {$user->username}: {$result['error']}";
            }
            $bar->advance();
            // A light courtesy pause between calls — GHL, like most CRMs, rate-limits by
            // location; this keeps a 500+-user backfill well under any reasonable per-second cap.
            usleep(200_000);
        }

        $bar->finish();
        $this->newLine(2);
        $this->info("Synced: {$succeeded} succeeded, {$failed} failed.");

        if ($failed > 0) {
            $this->warn('Failures (see ghl_api_logs for full detail):');
            foreach (array_slice($failures, 0, 20) as $line) {
                $this->line("  {$line}");
            }
            if (count($failures) > 20) {
                $this->line('  … and ' . (count($failures) - 20) . ' more.');
            }
        }

        return self::SUCCESS;
    }
}
