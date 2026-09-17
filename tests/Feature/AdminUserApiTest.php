<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: the Users admin page's backend actions (role change, flag/unflag, create,
 * delete) silently produced no AuditLog trail, unlike every other admin controller in this
 * codebase. Also locks in the previously-unreachable balance adjustment endpoint now that
 * the frontend "Adjust Balance" modal is wired to it.
 */
class AdminUserApiTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_can_add_to_a_users_balance_and_it_is_audit_logged(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 50]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/balance", [
                'amount' => 25, 'type' => 'add', 'reason' => 'Goodwill credit',
            ]);
        $res->assertStatus(200);
        $this->assertEquals(75, $player->fresh()->balance);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'balance_adjustment', 'target_type' => 'User', 'target_id' => $player->id,
        ]);
    }

    public function test_subtract_never_takes_balance_below_zero(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 10]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/balance", [
                'amount' => 100, 'type' => 'subtract', 'reason' => 'Correction',
            ]);
        $res->assertStatus(200);
        $this->assertEquals(0, $player->fresh()->balance);
    }

    public function test_role_change_is_audit_logged(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/role", ['role' => 'manager']);
        $res->assertStatus(200);
        $this->assertDatabaseHas('users', ['id' => $player->id, 'role' => 'manager']);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'updated_user_role', 'target_type' => 'User', 'target_id' => $player->id,
        ]);
    }

    public function test_flag_and_unflag_are_audit_logged(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'is_flagged' => false]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/flag", ['reason' => 'Suspicious activity']);
        $res->assertStatus(200);
        $this->assertDatabaseHas('users', ['id' => $player->id, 'is_flagged' => true]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'flagged_user', 'target_id' => $player->id]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/flag");
        $res->assertStatus(200);
        $this->assertDatabaseHas('users', ['id' => $player->id, 'is_flagged' => false]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'unflagged_user', 'target_id' => $player->id]);
    }

    public function test_flagged_user_is_rejected_on_the_very_next_authenticated_request(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $token = $this->tokenFor($player);

        // Token is valid before the flag.
        $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/auth/me')->assertStatus(200);

        $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/users/{$player->id}/flag", ['reason' => 'Suspended'])
            ->assertStatus(200);

        // Same still-unexpired token is now rejected — the flag check happens on every request, not just login.
        $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/auth/me')->assertStatus(401);
    }

    /**
     * Regression: `users.email` is a NOT NULL unique column, but store() validated it as
     * nullable — submitting without one crashed with a raw SQL constraint error (500) instead
     * of a clean 422 validation message.
     */
    public function test_creating_a_user_without_an_email_returns_a_clean_validation_error(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/users', [
                'username' => 'noemailuser', 'name' => 'No Email', 'password' => 'secret123',
            ]);
        $res->assertStatus(422);
        $res->assertJsonValidationErrors('email');
    }

    public function test_create_and_delete_user_are_audit_logged(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['role' => 'admin']); // second admin so destroy() isn't blocked below

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/users', [
                'username' => 'newplayer', 'name' => 'New Player', 'email' => 'newplayer@example.com', 'password' => 'secret123',
            ]);
        $res->assertStatus(201);
        $newId = $res->json('user.id');
        $this->assertDatabaseHas('audit_logs', ['action' => 'created_user', 'target_id' => $newId]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->deleteJson("/api/admin/users/{$newId}");
        $res->assertStatus(200);
        $this->assertDatabaseMissing('users', ['id' => $newId]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'deleted_user', 'target_id' => $newId]);
    }
}
