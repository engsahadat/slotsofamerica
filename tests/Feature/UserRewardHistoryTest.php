<?php

namespace Tests\Feature;

use App\Models\RewardHistory;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserRewardHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_only_sees_their_own_reward_history(): void
    {
        $userA = User::factory()->create(['role' => 'user']);
        $userB = User::factory()->create(['role' => 'user']);

        RewardHistory::create(['user_id' => $userA->id, 'reward_key' => 'email_verification_reward', 'amount' => 5, 'created_at' => now()]);
        RewardHistory::create(['user_id' => $userB->id, 'reward_key' => 'phone_verification_reward', 'amount' => 5, 'created_at' => now()]);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($userA))
            ->getJson('/api/user/reward-history');
        $res->assertStatus(200);
        $this->assertCount(1, $res->json('history'));
        $this->assertSame('email_verification_reward', $res->json('history.0.reward_key'));
    }
}
