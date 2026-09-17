<?php

namespace Tests\Feature;

use App\Models\ExportRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminExportRequestTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    private function sampleFilters(): array
    {
        return [
            'from' => now()->subDays(7)->toDateString(),
            'to' => now()->toDateString(),
            'typeFilter' => 'all',
            'statusFilter' => 'all',
        ];
    }

    public function test_manager_can_submit_an_export_request(): void
    {
        $manager = User::factory()->create(['role' => 'manager']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->postJson('/api/admin/export-requests', [
                'filters' => $this->sampleFilters(),
                'reason' => 'Monthly report',
            ]);

        $res->assertStatus(201)->assertJsonPath('success', true);
        $this->assertDatabaseHas('export_requests', [
            'manager_id' => $manager->id,
            'status' => 'pending',
            'reason' => 'Monthly report',
        ]);
    }

    public function test_admin_can_approve_a_request_and_manager_can_then_download(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $manager = User::factory()->create(['role' => 'manager']);
        $player = User::factory()->create(['role' => 'user']);

        Transaction::create([
            'user_id' => $player->id,
            'type' => 'deposit',
            'amount' => 50,
            'status' => 'approved',
        ]);

        $req = ExportRequest::create([
            'manager_id' => $manager->id,
            'export_type' => 'transactions',
            'filters' => $this->sampleFilters(),
            'status' => 'pending',
            'created_at' => now(),
        ]);

        $approveRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/export-requests/{$req->id}/approve");
        $approveRes->assertStatus(200)->assertJsonPath('success', true);
        $req->refresh();
        $this->assertSame('approved', $req->status);
        $this->assertNotNull($req->approved_expires_at);
        $this->assertTrue($req->approved_expires_at->isFuture());

        // Manager consumes the approval right before downloading.
        $consumeRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->postJson("/api/admin/export-requests/{$req->id}/consume");
        $consumeRes->assertStatus(200)->assertJsonPath('success', true);

        // Manager can now pull the actual export rows scoped to their approved request.
        $exportRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->getJson('/api/admin/transactions/export?' . http_build_query([
                'from' => $req->filters['from'],
                'to' => $req->filters['to'],
                'type' => 'all',
                'status' => 'all',
                'export_request_id' => $req->id,
            ]));
        $exportRes->assertStatus(200);
        $this->assertCount(1, $exportRes->json('rows'));
        $this->assertSame('deposit', $exportRes->json('rows.0.type'));
    }

    public function test_manager_cannot_approve_a_request(): void
    {
        $manager = User::factory()->create(['role' => 'manager']);
        $req = ExportRequest::create([
            'manager_id' => $manager->id,
            'export_type' => 'transactions',
            'filters' => $this->sampleFilters(),
            'status' => 'pending',
            'created_at' => now(),
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->postJson("/api/admin/export-requests/{$req->id}/approve");
        $res->assertStatus(403);
        $this->assertSame('pending', $req->fresh()->status);
    }

    public function test_manager_without_an_approved_request_is_blocked_from_the_export_endpoint(): void
    {
        $manager = User::factory()->create(['role' => 'manager']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->getJson('/api/admin/transactions/export?' . http_build_query([
                'from' => now()->subDays(7)->toDateString(),
                'to' => now()->toDateString(),
            ]));
        $res->assertStatus(403);
    }

    public function test_expired_approval_blocks_download_and_sweep_marks_it_expired(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $manager = User::factory()->create(['role' => 'manager']);

        $req = ExportRequest::create([
            'manager_id' => $manager->id,
            'export_type' => 'transactions',
            'filters' => $this->sampleFilters(),
            'status' => 'approved',
            'reviewed_by' => $admin->id,
            'reviewed_at' => now()->subHours(30),
            'approved_expires_at' => now()->subHours(6), // already past the 24h window
            'created_at' => now()->subHours(30),
        ]);

        $consumeRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($manager))
            ->postJson("/api/admin/export-requests/{$req->id}/consume");
        $consumeRes->assertStatus(422);

        $sweepRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/export-requests/sweep-expired');
        $sweepRes->assertStatus(200)->assertJsonPath('count', 1);
        $this->assertSame('expired', $req->fresh()->status);
    }

    public function test_admin_can_reject_with_a_note_and_delete_a_request(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $manager = User::factory()->create(['role' => 'manager']);

        $req = ExportRequest::create([
            'manager_id' => $manager->id,
            'export_type' => 'transactions',
            'filters' => $this->sampleFilters(),
            'status' => 'pending',
            'created_at' => now(),
        ]);

        $rejectRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/export-requests/{$req->id}/reject", []);
        $rejectRes->assertStatus(422); // note is required

        $rejectRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/export-requests/{$req->id}/reject", ['note' => 'Not authorized for this range.']);
        $rejectRes->assertStatus(200)->assertJsonPath('success', true);
        $this->assertSame('rejected', $req->fresh()->status);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->deleteJson("/api/admin/export-requests/{$req->id}");
        $delRes->assertStatus(200)->assertJsonPath('success', true);
        $this->assertDatabaseMissing('export_requests', ['id' => $req->id]);
    }

    public function test_manager_only_sees_their_own_requests_while_admin_sees_all(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $managerA = User::factory()->create(['role' => 'manager']);
        $managerB = User::factory()->create(['role' => 'manager']);

        ExportRequest::create([
            'manager_id' => $managerA->id, 'export_type' => 'transactions',
            'filters' => $this->sampleFilters(), 'status' => 'pending', 'created_at' => now(),
        ]);
        ExportRequest::create([
            'manager_id' => $managerB->id, 'export_type' => 'transactions',
            'filters' => $this->sampleFilters(), 'status' => 'pending', 'created_at' => now(),
        ]);

        $asManagerA = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($managerA))
            ->getJson('/api/admin/export-requests?status=pending');
        $asManagerA->assertStatus(200);
        $this->assertCount(1, $asManagerA->json('requests'));
        $this->assertSame($managerA->id, $asManagerA->json('requests.0.manager_id'));

        $asAdmin = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/export-requests?status=pending');
        $asAdmin->assertStatus(200);
        $this->assertCount(2, $asAdmin->json('requests'));
    }
}
