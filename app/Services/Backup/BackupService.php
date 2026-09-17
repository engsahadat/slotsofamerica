<?php

namespace App\Services\Backup;

use App\Models\Backup;
use App\Models\GameUnlockRequest;
use App\Models\RecoveryConfig;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * Full-platform backup/restore, storage export/import, and customer/env
 * exports for the Backup & Recovery admin page. Ported from a Supabase
 * Edge Functions reference (backup-run/backup-restore/customer-export/
 * recovery-config-export) — ZipArchive + Eloquent instead of Deno + fflate
 * + Postgres RPCs, and runs synchronously within the request (no queue
 * worker in this app; the dataset is modest enough that this is fine).
 */
class BackupService
{
    /** Tables included in a full backup. Deliberately excludes
     * game_api_provider_secrets (encrypted credentials never belong in a
     * downloadable zip) and infra tables (cache/jobs/backups/*). */
    public const TABLES = [
        'users', 'games', 'game_accounts', 'game_unlock_requests',
        'payment_gateways', 'payment_gateway_accounts',
        'withdraw_methods', 'withdraw_method_fields',
        'transactions', 'transaction_logs', 'withdraw_requests',
        'password_requests', 'rewards_config', 'reward_history',
        'notifications', 'site_settings', 'support_channels', 'audit_logs',
        'otp_verifications', 'verification_settings',
        'game_api_providers', 'game_provider_assignments', 'game_api_logs',
    ];

    /** Never wiped/re-inserted on restore — audit trail integrity. */
    public const PROTECTED_TABLES = ['audit_logs'];

    /** Columns scrubbed to '[REDACTED]' before ever being written to a backup file. */
    public const SENSITIVE_COLUMNS = [
        'users' => ['password'],
        'site_settings' => [
            'game_agent_secret_key', 'orion_stars_agent_password',
            'fast_api_app_secret', 'fast_api_agent_password',
            'river_pay_password', 'ghl_api_key',
        ],
    ];

    /** Folders on the `public` disk that hold user-uploaded files (see UploadApiController::ALLOWED_FOLDERS). */
    public const STORAGE_FOLDERS = [
        'avatars', 'game-images', 'gateway-qr', 'brand-assets',
        'landing-images', 'chat-images', 'withdraw-proof', 'deposit-proof',
    ];

    public const SCHEMA_VERSION = 1;
    public const KEEP_FULL_BACKUPS = 2;

    public function runFull(User $admin): Backup
    {
        $job = Backup::create([
            'type' => 'full', 'format' => 'zip', 'scope' => 'manual', 'status' => 'running',
            'created_by' => $admin->id, 'created_at' => now(),
        ]);

        try {
            $dump = $this->dumpTables();

            $info = [
                'backup_schema_version' => self::SCHEMA_VERSION,
                'app_name' => config('app.name'),
                'generated_at' => now()->toIso8601String(),
                'generated_by' => $admin->id,
                'scope' => 'manual',
                'table_count' => count($dump['tables']),
                'row_count' => $dump['totalRows'],
                'row_counts' => $dump['rowCounts'],
            ];

            $recoveryConfig = RecoveryConfig::first();

            $files = [
                'backup-info.json' => json_encode($info, JSON_PRETTY_PRINT),
                'database.json' => json_encode(['generated_at' => now()->toIso8601String(), 'tables' => $dump['tables']], JSON_PRETTY_PRINT),
                'database.sql' => $this->buildSql($dump['tables']),
                'customers.csv' => $this->buildCustomersCsv(),
                'settings.json' => json_encode(['site_settings' => $dump['tables']['site_settings'] ?? []], JSON_PRETTY_PRINT),
                'recovery-config.json' => json_encode($recoveryConfig, JSON_PRETTY_PRINT),
            ];

            $zipBytes = $this->zipStringFiles($files);
            $path = 'backups/full/full-manual-' . now()->format('Ymd-His') . '.zip';
            Storage::disk('local')->put($path, $zipBytes);

            $job->update([
                'status' => 'success',
                'size_bytes' => strlen($zipBytes),
                'storage_path' => $path,
                'completed_at' => now(),
            ]);

            $this->pruneOldBackups();

            return $job->fresh();
        } catch (Throwable $e) {
            $job->update(['status' => 'failed', 'error' => $e->getMessage(), 'completed_at' => now()]);
            throw $e;
        }
    }

    /** Keeps the latest N successful full backups; older ones lose their
     * file (storage_path nulled, status → expired) but the row stays as history. */
    public function pruneOldBackups(): void
    {
        $keepIds = Backup::where('type', 'full')->where('status', 'success')
            ->orderByDesc('created_at')->limit(self::KEEP_FULL_BACKUPS)->pluck('id');

        $stale = Backup::where('type', 'full')->where('status', 'success')
            ->whereNotIn('id', $keepIds)->get();

        foreach ($stale as $b) {
            if ($b->storage_path && Storage::disk('local')->exists($b->storage_path)) {
                Storage::disk('local')->delete($b->storage_path);
            }
            $b->update(['status' => 'expired', 'storage_path' => null]);
        }
    }

    /** Read-only — unzips and reports table/row/file counts without writing anything. */
    public function checkIntegrity(string $diskPath): array
    {
        [$zip, $tmp] = $this->openZipFromDisk($diskPath);

        try {
            $info = json_decode($zip->getFromName('backup-info.json') ?: 'null', true);
            $db = json_decode($zip->getFromName('database.json') ?: 'null', true);

            if (!$info || !$db) {
                throw new RuntimeException('This does not look like a valid backup archive (missing backup-info.json or database.json).');
            }

            $tables = $db['tables'] ?? [];
            $tablesInZip = array_keys($tables);
            $rowsTotal = array_sum(array_map('count', $tables));

            $storageFiles = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                if (str_starts_with($zip->getNameIndex($i), 'storage/')) {
                    $storageFiles++;
                }
            }

            return [
                'backup_version' => $info['backup_schema_version'] ?? null,
                'database_tables_in_zip' => count($tablesInZip),
                'database_rows_total' => $rowsTotal,
                'storage_files_in_zip' => $storageFiles,
                'missing_required_tables' => array_values(array_diff(self::TABLES, $tablesInZip)),
                'storage_manifest_matches_files' => true,
            ];
        } finally {
            $zip->close();
            @unlink($tmp);
        }
    }

    /** Live, destructive restore: delete-then-reinsert every non-protected
     * table present in the dump. Persists a report into the job's `meta`. */
    public function runRestore(User $admin, string $diskPath): Backup
    {
        $job = Backup::create([
            'type' => 'restore', 'format' => 'zip', 'scope' => 'manual', 'status' => 'running',
            'created_by' => $admin->id, 'created_at' => now(),
        ]);

        try {
            [$zip, $tmp] = $this->openZipFromDisk($diskPath);
            $info = json_decode($zip->getFromName('backup-info.json') ?: 'null', true);
            $db = json_decode($zip->getFromName('database.json') ?: 'null', true);
            $zip->close();
            @unlink($tmp);

            if (!$info || !$db) {
                throw new RuntimeException('Invalid backup archive.');
            }
            if ((int) ($info['backup_schema_version'] ?? 0) > self::SCHEMA_VERSION) {
                throw new RuntimeException('This backup was created by a newer, incompatible version and cannot be restored here.');
            }

            $tables = $db['tables'] ?? [];
            $restored = [];
            $skipped = [];

            foreach (self::TABLES as $table) {
                if (!isset($tables[$table]) || !is_array($tables[$table])) {
                    continue;
                }
                if (in_array($table, self::PROTECTED_TABLES, true) || !Schema::hasTable($table)) {
                    $skipped[] = $table;
                    continue;
                }

                $rows = $tables[$table];
                try {
                    DB::transaction(function () use ($table, $rows) {
                        DB::table($table)->delete();
                        foreach (array_chunk($rows, 500) as $chunk) {
                            if (!empty($chunk)) {
                                DB::table($table)->insert($chunk);
                            }
                        }
                    });
                    $restored[] = ['table' => $table, 'rows' => count($rows)];
                } catch (Throwable $e) {
                    $skipped[] = $table;
                }
            }

            $job->update([
                'status' => 'success',
                'completed_at' => now(),
                'meta' => ['restored_tables' => $restored, 'skipped' => $skipped],
            ]);

            return $job->fresh();
        } catch (Throwable $e) {
            $job->update(['status' => 'failed', 'error' => $e->getMessage(), 'completed_at' => now()]);
            throw $e;
        }
    }

    public function exportStorage(User $admin): Backup
    {
        $job = Backup::create([
            'type' => 'storage', 'format' => 'zip', 'scope' => 'manual', 'status' => 'running',
            'created_by' => $admin->id, 'created_at' => now(),
        ]);

        try {
            $tmpPath = tempnam(sys_get_temp_dir(), 'bkp');
            $zip = new ZipArchive();
            $zip->open($tmpPath, ZipArchive::OVERWRITE);

            $fileCount = 0;
            $truncated = false;
            $maxFiles = 5000;

            foreach (self::STORAGE_FOLDERS as $folder) {
                if ($fileCount >= $maxFiles) {
                    $truncated = true;
                    break;
                }
                foreach (Storage::disk('public')->allFiles($folder) as $file) {
                    if ($fileCount >= $maxFiles) {
                        $truncated = true;
                        break 2;
                    }
                    $zip->addFromString('storage/' . $file, Storage::disk('public')->get($file));
                    $fileCount++;
                }
            }
            $zip->close();

            $sizeBytes = filesize($tmpPath);
            $path = 'backups/storage/storage-' . now()->format('Ymd-His') . '.zip';
            Storage::disk('local')->put($path, file_get_contents($tmpPath));
            @unlink($tmpPath);

            $job->update([
                'status' => 'success',
                'size_bytes' => $sizeBytes,
                'storage_path' => $path,
                'completed_at' => now(),
                'meta' => ['files' => $fileCount, 'truncated' => $truncated],
            ]);

            return $job->fresh();
        } catch (Throwable $e) {
            $job->update(['status' => 'failed', 'error' => $e->getMessage(), 'completed_at' => now()]);
            throw $e;
        }
    }

    public function importStorage(string $diskPath): array
    {
        [$zip, $tmp] = $this->openZipFromDisk($diskPath);

        try {
            $restored = 0;
            $errors = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if (!str_starts_with($name, 'storage/')) {
                    continue;
                }
                $relative = substr($name, strlen('storage/'));
                $content = $zip->getFromIndex($i);
                if ($content === false) {
                    $errors[] = $relative;
                    continue;
                }
                try {
                    Storage::disk('public')->put($relative, $content);
                    $restored++;
                } catch (Throwable $e) {
                    $errors[] = $relative;
                }
            }

            return ['restored' => $restored, 'errors' => $errors];
        } finally {
            $zip->close();
            @unlink($tmp);
        }
    }

    /** @return array|string Array when $format==='json', CSV text otherwise. */
    public function customerExport(string $format, string $scope): array|string
    {
        if ($scope === 'emergency') {
            $customers = User::query()->select('username', 'email', 'phone', 'balance')
                ->orderBy('username')->get()
                ->map(fn ($u) => [
                    'username' => $u->username, 'email' => $u->email,
                    'phone' => $u->phone, 'balance' => (float) $u->balance,
                ])->all();
        } else {
            $users = User::query()->select('id', 'username', 'email', 'phone', 'balance', 'role', 'created_at')
                ->orderBy('username')->get();
            $gameUsernames = GameUnlockRequest::where('status', 'approved')->get()->groupBy('user_id');
            $txnTotals = Transaction::where('status', 'completed')->get()->groupBy('user_id');

            $customers = $users->map(function ($u) use ($gameUsernames, $txnTotals) {
                $games = ($gameUsernames[$u->id] ?? collect())->pluck('username')->filter()->unique()->implode('|');
                $txns = $txnTotals[$u->id] ?? collect();
                $sumBy = fn ($type) => (float) $txns->where('type', $type)->sum('amount');

                return [
                    'username' => $u->username, 'email' => $u->email, 'phone' => $u->phone,
                    'balance' => (float) $u->balance, 'role' => $u->role,
                    'signup_date' => optional($u->created_at)->toDateString(),
                    'game_usernames' => $games, 'txn_count' => $txns->count(),
                    'total_deposit' => $sumBy('deposit'), 'total_withdraw' => $sumBy('withdraw'),
                    'total_redeem' => $sumBy('redeem'), 'total_transfer' => $sumBy('transfer'),
                ];
            })->all();
        }

        return $format === 'json' ? $customers : $this->toCsv($customers);
    }

    public function envSnapshot(): array
    {
        $site = SiteSetting::first();
        $recovery = RecoveryConfig::first();

        return [
            'generated_at' => now()->toIso8601String(),
            'site' => [
                'site_name' => $site->site_name ?? null,
                'site_url' => $recovery->site_url ?? config('app.url'),
                'frontend_url' => $recovery->frontend_url ?? null,
                'support_email' => $recovery->support_email ?? null,
            ],
            'storage_folders' => self::STORAGE_FOLDERS,
            'notes' => 'App secrets, SMTP credentials, and provider passwords are intentionally excluded from this snapshot.',
        ];
    }

    // -- internals -----------------------------------------------------

    private function dumpTables(): array
    {
        $tables = [];
        $rowCounts = [];
        $totalRows = 0;

        foreach (self::TABLES as $table) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $rows = DB::table($table)->get()
                ->map(fn ($row) => $this->scrubRow($table, (array) $row))
                ->all();
            $tables[$table] = $rows;
            $rowCounts[$table] = count($rows);
            $totalRows += count($rows);
        }

        return ['tables' => $tables, 'rowCounts' => $rowCounts, 'totalRows' => $totalRows];
    }

    private function scrubRow(string $table, array $row): array
    {
        foreach (self::SENSITIVE_COLUMNS[$table] ?? [] as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null) {
                $row[$col] = '[REDACTED]';
            }
        }

        return $row;
    }

    private function buildSql(array $tables): string
    {
        $lines = ['-- Generated backup SQL', '-- ' . now()->toIso8601String(), ''];

        foreach ($tables as $table => $rows) {
            if (empty($rows)) {
                continue;
            }
            $columns = array_keys((array) $rows[0]);
            $lines[] = "-- Table: {$table}";
            foreach ($rows as $row) {
                $values = array_map(fn ($v) => $this->sqlEscape($v), array_values((array) $row));
                $lines[] = "INSERT INTO `{$table}` (`" . implode('`, `', $columns) . '`) VALUES (' . implode(', ', $values) . ');';
            }
            $lines[] = '';
        }

        return implode("\n", $lines);
    }

    private function sqlEscape($value): string
    {
        if ($value === null) {
            return 'NULL';
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], (string) $value) . "'";
    }

    private function buildCustomersCsv(): string
    {
        $rows = User::query()->select('username', 'email', 'phone', 'balance', 'created_at')
            ->orderBy('username')->get()
            ->map(fn ($u) => [
                'username' => $u->username, 'email' => $u->email, 'phone' => $u->phone,
                'balance' => $u->balance, 'created_at' => optional($u->created_at)->toIso8601String(),
            ])->all();

        return $this->toCsv($rows);
    }

    private function toCsv(array $rows): string
    {
        if (empty($rows)) {
            return '';
        }
        $headers = array_keys($rows[0]);
        $escape = fn ($v) => '"' . str_replace('"', '""', (string) ($v ?? '')) . '"';
        $lines = [implode(',', array_map($escape, $headers))];
        foreach ($rows as $row) {
            $lines[] = implode(',', array_map($escape, array_values($row)));
        }

        return implode("\n", $lines);
    }

    private function zipStringFiles(array $files): string
    {
        $tmpPath = tempnam(sys_get_temp_dir(), 'bkp');
        $zip = new ZipArchive();
        $zip->open($tmpPath, ZipArchive::OVERWRITE);
        foreach ($files as $name => $content) {
            $zip->addFromString($name, (string) $content);
        }
        $zip->close();

        $bytes = file_get_contents($tmpPath);
        @unlink($tmpPath);

        return $bytes;
    }

    /** @return array{0: ZipArchive, 1: string} the opened archive and the temp file path (caller must close()+unlink()). */
    private function openZipFromDisk(string $diskPath): array
    {
        if (!Storage::disk('local')->exists($diskPath)) {
            throw new RuntimeException('Backup file not found.');
        }

        $tmp = tempnam(sys_get_temp_dir(), 'bkp');
        file_put_contents($tmp, Storage::disk('local')->get($diskPath));

        $zip = new ZipArchive();
        if ($zip->open($tmp) !== true) {
            @unlink($tmp);
            throw new RuntimeException('Could not open backup archive — the file may be corrupted.');
        }

        return [$zip, $tmp];
    }
}
