<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Backup;
use App\Models\BackupDownload;
use App\Models\RecoveryConfig;
use App\Services\Backup\BackupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AdminBackupApiController extends Controller
{
    public function __construct(private BackupService $backups)
    {
    }

    public function index()
    {
        return response()->json([
            'backups' => Backup::orderByDesc('created_at')->limit(100)->get(),
            'downloads' => BackupDownload::with('admin:id,name,username')->orderByDesc('created_at')->limit(50)->get(),
            'recovery_config' => RecoveryConfig::firstOrCreate(['id' => 1]),
        ]);
    }

    public function store(Request $request)
    {
        $alreadyRunning = Backup::where('type', 'full')->where('status', 'running')
            ->where('created_at', '>=', now()->subMinutes(10))->exists();

        if ($alreadyRunning) {
            return response()->json(['success' => true, 'already_running' => true, 'message' => 'A backup is already running.']);
        }

        try {
            $job = $this->backups->runFull($request->user());
            AuditLog::record($request, 'create_backup', 'Backup', $job->id, [
                'size_bytes' => $job->size_bytes, 'storage_path' => $job->storage_path,
            ]);

            return response()->json(['success' => true, 'message' => 'Backup created', 'job' => $job], 201);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Backup failed: ' . $e->getMessage()], 500);
        }
    }

    public function download(Request $request, $id)
    {
        $job = Backup::findOrFail($id);

        if ($job->status !== 'success' || !$job->storage_path || !Storage::disk('local')->exists($job->storage_path)) {
            return response()->json(['success' => false, 'message' => 'Backup file is not available (it may have expired).'], 404);
        }

        BackupDownload::create([
            'backup_id' => $job->id, 'admin_id' => $request->user()->id,
            'ip' => $request->ip(), 'created_at' => now(),
        ]);
        AuditLog::record($request, 'download_backup', 'Backup', $job->id);

        $filename = basename($job->storage_path);

        return Storage::disk('local')->download($job->storage_path, $filename);
    }

    public function destroy(Request $request, $id)
    {
        $job = Backup::findOrFail($id);

        if ($job->storage_path && Storage::disk('local')->exists($job->storage_path)) {
            Storage::disk('local')->delete($job->storage_path);
        }
        $job->delete();

        AuditLog::record($request, 'delete_backup', 'Backup', $id);

        return response()->json(['success' => true, 'message' => 'Backup deleted.']);
    }

    /** Restore (or dry-run integrity check) from an existing history entry. */
    public function restore(Request $request, $id)
    {
        $job = Backup::findOrFail($id);

        if ($job->status !== 'success' || !$job->storage_path) {
            return response()->json(['success' => false, 'message' => 'This backup has no file available to restore from.'], 422);
        }

        return $this->doRestore($request, $job->storage_path, (bool) $request->boolean('dry_run'));
    }

    /** Upload a fresh zip and restore (or dry-run) from it in one call. */
    public function restoreUpload(Request $request)
    {
        $validated = $request->validate([
            'file' => 'required|file|mimes:zip|max:204800', // 200MB
            'dry_run' => 'sometimes|boolean',
        ]);

        $path = $request->file('file')->store('backups/uploads', 'local');

        return $this->doRestore($request, $path, (bool) ($validated['dry_run'] ?? false));
    }

    private function doRestore(Request $request, string $storagePath, bool $dryRun)
    {
        try {
            if ($dryRun) {
                $integrity = $this->backups->checkIntegrity($storagePath);

                return response()->json(['success' => true, 'integrity' => $integrity]);
            }

            $recentRestores = Backup::where('type', 'restore')
                ->where('created_by', $request->user()->id)
                ->where('created_at', '>=', now()->subMinutes(10))
                ->count();
            if ($recentRestores >= 3) {
                return response()->json(['success' => false, 'message' => 'Too many restore attempts. Please wait a few minutes and try again.'], 429);
            }

            $job = $this->backups->runRestore($request->user(), $storagePath);
            AuditLog::record($request, 'restore_backup', 'Backup', $job->id, $job->meta ?? []);

            return response()->json([
                'success' => true, 'message' => 'Restore complete',
                'restored_tables' => $job->meta['restored_tables'] ?? [],
                'skipped' => $job->meta['skipped'] ?? [],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function exportCustomers(Request $request)
    {
        $format = $request->query('format', 'csv');
        $scope = $request->query('scope', 'emergency');

        if (!in_array($format, ['csv', 'json'], true) || !in_array($scope, ['full', 'emergency'], true)) {
            throw ValidationException::withMessages(['format' => ['Invalid format or scope.']]);
        }

        $data = $this->backups->customerExport($format, $scope);
        AuditLog::record($request, 'customer_export', 'User', null, [
            'format' => $format, 'scope' => $scope,
            'count' => is_array($data) ? count($data) : substr_count($data, "\n"),
        ]);

        if ($format === 'json') {
            return response()->json(['success' => true, 'scope' => $scope, 'customers' => $data]);
        }

        $filename = "customers-{$scope}-" . now()->format('YmdHis') . '.csv';

        return response($data, 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function exportStorage(Request $request)
    {
        try {
            $job = $this->backups->exportStorage($request->user());
            AuditLog::record($request, 'storage_export', 'Backup', $job->id, $job->meta ?? []);

            return response()->json([
                'success' => true, 'backup_id' => $job->id,
                'files' => $job->meta['files'] ?? 0, 'size_bytes' => $job->size_bytes,
                'truncated' => $job->meta['truncated'] ?? false,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function importStorage(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:zip|max:204800']);
        $path = $request->file('file')->store('backups/uploads', 'local');

        try {
            $result = $this->backups->importStorage($path);
            AuditLog::record($request, 'storage_import', 'Backup', null, $result);

            return response()->json(array_merge(['success' => true], $result));
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }
    }

    public function envSnapshot(Request $request)
    {
        $snapshot = $this->backups->envSnapshot();
        AuditLog::record($request, 'recovery_config_export', 'RecoveryConfig', null);

        $filename = 'recovery-config-' . now()->format('YmdHis') . '.json';

        return response()->json(['success' => true, 'snapshot' => $snapshot], 200, [
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }

    public function getRecoveryConfig()
    {
        return response()->json(['config' => RecoveryConfig::firstOrCreate(['id' => 1])]);
    }

    public function saveRecoveryConfig(Request $request)
    {
        $validated = $request->validate([
            'site_url' => 'nullable|string|max:255',
            'frontend_url' => 'nullable|string|max:255',
            'support_email' => 'nullable|email|max:255',
            'notes' => 'nullable|string',
        ]);

        $config = RecoveryConfig::firstOrCreate(['id' => 1]);
        $config->update(array_merge($validated, ['updated_by' => $request->user()->id]));

        AuditLog::record($request, 'update_recovery_config', 'RecoveryConfig', $config->id);

        return response()->json(['success' => true, 'message' => 'Recovery config saved.', 'config' => $config]);
    }
}
