<?php

namespace Tests\Feature;

use App\Models\SupportChannel;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSupportChannelTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_can_create_update_and_delete_a_channel(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $token = $this->tokenFor($admin);

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/support-channels', [
                'name' => 'WhatsApp', 'icon' => 'whatsapp', 'link' => 'https://wa.me/123', 'is_active' => true,
            ]);
        $createRes->assertStatus(201);
        $id = $createRes->json('channel.id');
        $this->assertDatabaseHas('support_channels', ['id' => $id, 'name' => 'WhatsApp']);

        $updateRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson("/api/admin/support-channels/{$id}", ['is_active' => false]);
        $updateRes->assertStatus(200);
        $this->assertDatabaseHas('support_channels', ['id' => $id, 'is_active' => false]);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson("/api/admin/support-channels/{$id}");
        $delRes->assertStatus(200);
        $this->assertDatabaseMissing('support_channels', ['id' => $id]);
    }

    public function test_javascript_link_is_rejected_on_create_and_update(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $token = $this->tokenFor($admin);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/support-channels', [
                'name' => 'Evil', 'icon' => 'whatsapp', 'link' => 'javascript:alert(1)', 'is_active' => true,
            ]);
        $res->assertStatus(422);

        $channel = SupportChannel::create(['name' => 'Ok', 'icon' => 'whatsapp', 'link' => 'https://wa.me/1', 'is_active' => true, 'sort_order' => 0]);
        $res2 = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson("/api/admin/support-channels/{$channel->id}", ['link' => 'javascript:alert(1)']);
        $res2->assertStatus(422);
    }

    public function test_public_listing_only_returns_active_channels_while_admin_sees_all(): void
    {
        SupportChannel::create(['name' => 'Active', 'icon' => 'whatsapp', 'link' => 'https://wa.me/1', 'is_active' => true, 'sort_order' => 0]);
        SupportChannel::create(['name' => 'Inactive', 'icon' => 'telegram', 'link' => 'https://t.me/x', 'is_active' => false, 'sort_order' => 1]);

        $publicRes = $this->getJson('/api/support-channels');
        $publicRes->assertStatus(200);
        $this->assertCount(1, $publicRes->json('channels'));
        $this->assertSame('Active', $publicRes->json('channels.0.name'));

        $admin = User::factory()->create(['role' => 'admin']);
        $adminRes = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/support-channels');
        $adminRes->assertStatus(200);
        $this->assertCount(2, $adminRes->json('channels'));
    }

    public function test_non_admin_cannot_manage_support_channels(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/admin/support-channels', ['name' => 'X', 'icon' => 'whatsapp', 'link' => 'https://x.com', 'is_active' => true]);
        $res->assertStatus(403);
    }
}
