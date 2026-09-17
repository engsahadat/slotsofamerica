<?php

namespace Tests\Feature;

use App\Models\PaymentGateway;
use App\Models\PaymentGatewayAccount;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UserDepositApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeGateway(float $minimum = 10): PaymentGateway
    {
        return PaymentGateway::create([
            'name' => 'Cash App', 'address' => '$HorizonPay', 'minimum_amount' => $minimum, 'is_active' => true,
        ]);
    }

    public function test_user_can_upload_deposit_proof_and_submit_deposit(): void
    {
        Storage::fake('public');

        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);
        $gateway = $this->makeGateway();

        // 1. Upload proof via /api/upload
        $file = UploadedFile::fake()->image('proof.png', 400, 400);
        $uploadRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/upload', [
                'file' => $file,
                'folder' => 'deposit-proof',
            ]);

        $uploadRes->assertStatus(201)
            ->assertJsonStructure(['message', 'url', 'path']);

        $proofUrl = $uploadRes->json('url');

        // 2. Submit deposit with proof_url
        $depositRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit', [
                'amount' => 50.00,
                'gateway_id' => $gateway->id,
                'proof_url' => $proofUrl,
                'notes' => 'Payment via Cash App Official Account',
            ]);

        $depositRes->assertStatus(201)
            ->assertJsonPath('transaction.status', 'pending');

        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id,
            'type' => 'deposit',
            'amount' => 50.00,
            'status' => 'pending',
            'gateway_id' => $gateway->id,
        ]);
    }

    public function test_deposit_requires_a_gateway_id(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit', ['amount' => 50, 'proof_url' => '/fake.png']);
        $res->assertStatus(422);
    }

    public function test_deposit_below_gateway_minimum_is_rejected(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);
        $gateway = $this->makeGateway(20);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit', [
                'amount' => 10, 'gateway_id' => $gateway->id, 'proof_url' => '/fake.png',
            ]);
        $res->assertStatus(422);
        $this->assertStringContainsString('Minimum deposit', $res->json('message'));
    }

    public function test_deposit_persists_the_selected_rotating_account(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);
        $gateway = $this->makeGateway();
        $account = PaymentGatewayAccount::create([
            'gateway_id' => $gateway->id, 'account_name' => 'HorizonPay1', 'account_number' => '$HorizonPay1',
            'priority_order' => 0, 'is_active' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit', [
                'amount' => 50, 'gateway_id' => $gateway->id, 'gateway_account_id' => $account->id, 'proof_url' => '/fake.png',
            ]);
        $res->assertStatus(201);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'gateway_id' => $gateway->id, 'gateway_account_id' => $account->id,
        ]);
    }

    public function test_deposit_ignores_an_account_id_that_belongs_to_a_different_gateway(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);
        $gateway = $this->makeGateway();
        $otherGateway = PaymentGateway::create(['name' => 'Zelle', 'address' => 'pay@horizon.gg', 'minimum_amount' => 20, 'is_active' => true]);
        $foreignAccount = PaymentGatewayAccount::create([
            'gateway_id' => $otherGateway->id, 'account_name' => 'Zelle1', 'account_number' => 'pay@horizon.gg',
            'priority_order' => 0, 'is_active' => true,
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/deposit', [
                'amount' => 50, 'gateway_id' => $gateway->id, 'gateway_account_id' => $foreignAccount->id, 'proof_url' => '/fake.png',
            ]);
        $res->assertStatus(201);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id, 'gateway_id' => $gateway->id, 'gateway_account_id' => null,
        ]);
    }
}
