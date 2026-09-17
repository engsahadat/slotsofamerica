<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_user_search_filters_by_name_username_or_email(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['name' => 'Kazi Rahman', 'username' => 'kazirahman', 'email' => 'kazi@example.com']);
        User::factory()->create(['name' => 'Someone Else', 'username' => 'someoneelse', 'email' => 'else@example.com']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/users?search=kazi');
        $res->assertStatus(200);
        $this->assertCount(1, $res->json('data'));
        $this->assertSame('Kazi Rahman', $res->json('data.0.name'));
    }

    public function test_broadcast_respects_chosen_category_and_targets_a_specific_user(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $target = User::factory()->create(['role' => 'user']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/notifications/broadcast', [
                'title' => 'Maintenance window',
                'message' => 'We will be down for 10 minutes.',
                'type' => 'warning',
                'category' => 'other',
                'user_id' => $target->id,
            ]);
        $res->assertStatus(201);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $target->id,
            'title' => 'Maintenance window',
            'category' => 'other',
            'type' => 'warning',
        ]);
    }

    public function test_broadcast_to_all_creates_a_notification_per_user(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->count(3)->create(['role' => 'user']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/notifications/broadcast', [
                'title' => 'Welcome',
                'message' => 'Thanks for joining.',
                'type' => 'info',
                'category' => 'system',
            ]);
        $res->assertStatus(201);

        // 3 seeded users + the admin itself = 4 total user rows.
        $this->assertSame(4, Notification::where('title', 'Welcome')->count());
    }
}
