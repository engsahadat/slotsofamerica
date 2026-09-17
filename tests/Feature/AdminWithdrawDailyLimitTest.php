<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Models\WithdrawMethod;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: "Daily Withdraw Limit" previously wrote to the dead Supabase `app_settings`
 * stub (no such table exists in Laravel) and nothing on the backend enforced any daily cap
 * at all — a user could submit unlimited withdrawals all day. Now SiteSetting::withdraw_daily_limit
 * is the real, shared source, enforced server-side as a sliding 24h window (matching the
 * admin UI's own "per user, 24hrs" copy).
 */
class AdminWithdrawDailyLimitTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    private function makeMethod(float $min = 1, float $max = 10000): WithdrawMethod
    {
        return WithdrawMethod::create([
            'name' => 'Cash App', 'code' => 'cashapp', 'minimum_amount' => $min, 'maximum_amount' => $max,
            'fee_percentage' => 0, 'fee_fixed' => 0, 'is_active' => true,
        ]);
    }

    public function test_admin_can_read_and_update_the_daily_limit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $before = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->getJson('/api/admin/withdraw-methods/daily-limit');
        $before->assertStatus(200);
        $this->assertEquals(100.0, $before->json('daily_limit'));

        $update = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/withdraw-methods/daily-limit', ['daily_limit' => 250]);
        $update->assertStatus(200);
        $this->assertEquals(250.0, $update->json('daily_limit'));

        $this->assertDatabaseHas('site_settings', ['id' => 1, 'withdraw_daily_limit' => 250]);
    }

    public function test_non_admin_cannot_update_the_daily_limit(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/admin/withdraw-methods/daily-limit', ['daily_limit' => 250]);
        $res->assertStatus(403);
    }

    public function test_user_withdraw_index_reports_real_limit_and_used_total(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'withdraw_daily_limit' => 100]);
        $user = User::factory()->create(['role' => 'user', 'balance' => 1000]);
        Transaction::create(['user_id' => $user->id, 'type' => 'withdraw', 'amount' => 30, 'status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->getJson('/api/user/withdraw/methods');
        $res->assertStatus(200);
        $this->assertEquals(100.0, $res->json('daily_limit'));
        $this->assertEquals(30.0, $res->json('daily_used'));
    }

    public function test_withdraw_request_exceeding_daily_limit_is_rejected(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'withdraw_daily_limit' => 100]);
        $user = User::factory()->create(['role' => 'user', 'balance' => 1000]);
        $method = $this->makeMethod();
        Transaction::create(['user_id' => $user->id, 'type' => 'withdraw', 'amount' => 70, 'status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 40, 'account_details' => ['tag' => '$test'],
            ]);
        $res->assertStatus(422);
        $this->assertStringContainsString('24-hour', $res->json('message'));
    }

    public function test_withdraw_request_within_daily_limit_succeeds(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'withdraw_daily_limit' => 100]);
        $user = User::factory()->create(['role' => 'user', 'balance' => 1000]);
        $method = $this->makeMethod();
        Transaction::create(['user_id' => $user->id, 'type' => 'withdraw', 'amount' => 30, 'status' => 'approved']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 40, 'account_details' => ['tag' => '$test'],
            ]);
        $res->assertStatus(201);
    }

    public function test_withdrawals_older_than_24_hours_do_not_count_toward_the_limit(): void
    {
        SiteSetting::create(['id' => 1, 'site_name' => 'Horizon Players', 'withdraw_daily_limit' => 100]);
        $user = User::factory()->create(['role' => 'user', 'balance' => 1000]);
        $method = $this->makeMethod();

        $old = Transaction::create(['user_id' => $user->id, 'type' => 'withdraw', 'amount' => 90, 'status' => 'approved']);
        $old->forceFill(['created_at' => now()->subHours(30)])->save();

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->postJson('/api/user/withdraw', [
                'method_id' => $method->id, 'amount' => 90, 'account_details' => ['tag' => '$test'],
            ]);
        $res->assertStatus(201);
    }
}
