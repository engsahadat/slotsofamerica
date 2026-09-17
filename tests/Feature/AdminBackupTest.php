<?php

namespace Tests\Feature;

use App\Models\Backup;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

class AdminBackupTest extends TestCase
{
    use RefreshDatabase;

    private function adminTokenPair(): array
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return [$admin, JwtAuthService::generateToken($admin)];
    }

    public function test_admin_can_create_download_and_delete_a_full_backup(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        [$admin, $token] = $this->adminTokenPair();

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/backups');
        $createRes->assertStatus(201)->assertJsonPath('success', true);

        $backupId = $createRes->json('job.id');
        $this->assertDatabaseHas('backups', ['id' => $backupId, 'status' => 'success', 'type' => 'full']);

        $job = Backup::find($backupId);
        Storage::disk('local')->assertExists($job->storage_path);

        $zip = new ZipArchive();
        $this->assertTrue($zip->open(Storage::disk('local')->path($job->storage_path)) === true);
        $info = json_decode($zip->getFromName('backup-info.json'), true);
        $db = json_decode($zip->getFromName('database.json'), true);
        $zip->close();

        $this->assertNotNull($info);
        $this->assertArrayHasKey('users', $db['tables']);
        // Passwords must never appear in a downloadable backup.
        $this->assertSame('[REDACTED]', $db['tables']['users'][0]['password'] ?? '[REDACTED]');

        $dlRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->get("/api/admin/backups/{$backupId}/download");
        $dlRes->assertStatus(200);
        $this->assertDatabaseHas('backup_downloads', ['backup_id' => $backupId, 'admin_id' => $admin->id]);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson("/api/admin/backups/{$backupId}");
        $delRes->assertStatus(200)->assertJsonPath('success', true);
        $this->assertDatabaseMissing('backups', ['id' => $backupId]);
        Storage::disk('local')->assertMissing($job->storage_path);
    }

    public function test_dry_run_restore_reports_integrity_without_writing_anything(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        [, $token] = $this->adminTokenPair();

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/admin/backups');
        $backupId = $createRes->json('job.id');
        $usersBefore = User::count();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/backups/{$backupId}/restore", ['dry_run' => true]);

        $res->assertStatus(200)->assertJsonPath('success', true);
        $integrity = $res->json('integrity');
        $this->assertEmpty($integrity['missing_required_tables']);
        $this->assertGreaterThan(0, $integrity['database_tables_in_zip']);

        $this->assertSame($usersBefore, User::count());
        $this->assertDatabaseMissing('backups', ['type' => 'restore']);
    }

    public function test_live_restore_repopulates_a_wiped_table(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        [$admin, $token] = $this->adminTokenPair();

        // Use `games` (not `users`) for the wipe-and-restore check — deleting
        // every user mid-test would also delete the admin making this very
        // authenticated request, which is a test-setup artifact, not
        // something a real restore run needs to worry about (the acting
        // admin's own row survives the request that's currently using it).
        \App\Models\Game::create(['name' => 'Restore Test Game 1', 'is_active' => true]);
        \App\Models\Game::create(['name' => 'Restore Test Game 2', 'is_active' => true]);
        $gamesBefore = \App\Models\Game::count();

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/admin/backups');
        $backupId = $createRes->json('job.id');

        \App\Models\Game::query()->delete();
        $this->assertSame(0, \App\Models\Game::count());

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/backups/{$backupId}/restore", ['dry_run' => false]);

        $res->assertStatus(200)->assertJsonPath('success', true);
        $this->assertSame($gamesBefore, \App\Models\Game::count());
        $this->assertDatabaseHas('users', ['id' => $admin->id]);
        $this->assertDatabaseHas('backups', ['type' => 'restore', 'status' => 'success']);
    }

    public function test_customer_export_emergency_scope_excludes_role_and_matches_user_count(): void
    {
        [, $token] = $this->adminTokenPair();
        User::factory()->count(3)->create(['role' => 'user']);
        $expectedCount = User::count();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/admin/backups/customers/export?format=json&scope=emergency');

        $res->assertStatus(200)->assertJsonPath('success', true);
        $this->assertCount($expectedCount, $res->json('customers'));
        $this->assertArrayHasKey('username', $res->json('customers.0'));
        $this->assertArrayNotHasKey('role', $res->json('customers.0'));
    }

    public function test_non_admin_cannot_access_backups(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/admin/backups');
        $res->assertStatus(403);
    }

    public function test_recovery_config_can_be_saved_and_fetched(): void
    {
        [, $token] = $this->adminTokenPair();

        $save = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/recovery-config', [
                'site_url' => 'https://example.com',
                'support_email' => 'support@example.com',
            ]);
        $save->assertStatus(200)->assertJsonPath('success', true);

        $get = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/admin/recovery-config');
        $get->assertStatus(200)->assertJsonPath('config.site_url', 'https://example.com');
    }
}
