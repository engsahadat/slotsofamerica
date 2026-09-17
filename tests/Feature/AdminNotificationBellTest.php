<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\PaymentGateway;
use App\Models\User;
use App\Models\WithdrawMethod;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: the admin notification bell (top-right of every admin page) was wired to a dead
 * Supabase `admin_notifications` stub — always empty, unread count never moved. It's now backed
 * by the real `notifications` table via GET /user/notifications (same endpoint Notifications.tsx
 * already uses), fed by Notification::notifyAdmins() calls added to the 4 transaction-submission
 * endpoints (mirroring the pre-existing "New Export Request" -> admins pattern).
 */
class AdminNotificationBellTest extends TestCase
{
    use RefreshDatabase;

    public function test_deposit_submission_notifies_every_admin_and_not_other_roles(): void
    {
        $admin1 = User::factory()->create(['role' => 'admin']);
        $admin2 = User::factory()->create(['role' => 'admin']);
        $manager = User::factory()->create(['role' => 'manager']);
        $player = User::factory()->create(['role' => 'user', 'username' => 'depositor1']);
        $gateway = PaymentGateway::create(['name' => 'Cash App', 'address' => '$Pay', 'minimum_amount' => 5, 'is_active' => true]);

        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($player))
            ->postJson('/api/user/deposit', [
                'amount' => 40, 'gateway_id' => $gateway->id, 'proof_url' => 'https://example.com/proof.png',
            ])->assertStatus(201);

        $this->assertDatabaseHas('notifications', ['user_id' => $admin1->id, 'category' => 'deposit']);
        $this->assertDatabaseHas('notifications', ['user_id' => $admin2->id, 'category' => 'deposit']);
        $this->assertDatabaseMissing('notifications', ['user_id' => $manager->id, 'category' => 'deposit']);
        $this->assertDatabaseMissing('notifications', ['user_id' => $player->id, 'category' => 'deposit']);
    }

    public function test_withdraw_submission_notifies_admins(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100, 'username' => 'withdrawer1']);
        $method = WithdrawMethod::create(['name' => 'Zelle', 'code' => 'zelle', 'minimum_amount' => 1, 'maximum_amount' => 1000, 'is_active' => true]);

        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($player))
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 20, 'account_details' => ['email' => 'a@b.com'],
            ])->assertStatus(201);

        $this->assertDatabaseHas('notifications', ['user_id' => $admin->id, 'category' => 'withdraw']);
    }

    public function test_redeem_and_transfer_submissions_notify_admins_with_the_right_category(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'balance' => 100, 'username' => 'redeemer1']);
        $game = Game::create(['name' => 'Fire Kirin', 'is_active' => true]);

        // Default redeem minimum (config('redeem.min_amount')) is $40 when no SiteSetting override exists.
        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($player))
            ->postJson('/api/user/redeem/request', ['game_id' => $game->id, 'amount' => 50])
            ->assertStatus(201);
        $this->assertDatabaseHas('notifications', ['user_id' => $admin->id, 'category' => 'redeem']);

        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($player))
            ->postJson('/api/user/transfer', ['game_id' => $game->id, 'amount' => 10])
            ->assertStatus(201);
        $this->assertDatabaseHas('notifications', ['user_id' => $admin->id, 'category' => 'transfer']);
    }

    public function test_admin_can_fetch_and_mark_read_their_own_notification_feed(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'username' => 'notifyplayer']);
        $gateway = PaymentGateway::create(['name' => 'Cash App', 'address' => '$Pay', 'minimum_amount' => 5, 'is_active' => true]);

        $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($player))
            ->postJson('/api/user/deposit', [
                'amount' => 25, 'gateway_id' => $gateway->id, 'proof_url' => 'https://example.com/proof.png',
            ])->assertStatus(201);

        $token = JwtAuthService::generateToken($admin);
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/user/notifications');
        $res->assertStatus(200);
        $this->assertEquals(1, $res->json('unread_count'));
        $notifId = $res->json('notifications.0.id');

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/user/notifications/{$notifId}/read")
            ->assertStatus(200);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/user/notifications');
        $this->assertEquals(0, $res->json('unread_count'));
    }
}
