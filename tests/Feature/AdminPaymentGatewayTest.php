<?php

namespace Tests\Feature;

use App\Models\PaymentGateway;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPaymentGatewayTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_can_add_an_account_to_a_gateway(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $gateway = PaymentGateway::create(['name' => 'Cash App', 'address' => '$HorizonPay', 'minimum_amount' => 10, 'is_active' => true]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/payment-gateways/{$gateway->id}/accounts", [
                'account_name' => 'HorizonPay1', 'account_number' => '$HorizonPay1',
            ]);
        $res->assertStatus(201);
        $this->assertDatabaseHas('payment_gateway_accounts', ['gateway_id' => $gateway->id, 'account_name' => 'HorizonPay1']);
    }

    public function test_adding_an_account_to_a_nonexistent_gateway_404s_cleanly(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/payment-gateways/999999/accounts', [
                'account_name' => 'X', 'account_number' => 'Y',
            ]);
        $res->assertStatus(404);
    }

    public function test_non_admin_cannot_manage_gateways(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->getJson('/api/admin/payment-gateways');
        $res->assertStatus(403);
    }
}
