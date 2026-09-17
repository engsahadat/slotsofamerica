<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class JwtAuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_and_receive_jwt_token(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Alice Smith',
            'email' => 'alice@example.com',
            'password' => 'secret123',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'token',
                'user' => ['id', 'name', 'email'],
            ]);

        $this->assertDatabaseHas('users', [
            'email' => 'alice@example.com',
        ]);
    }

    public function test_user_can_login_and_receive_jwt_token(): void
    {
        $user = User::factory()->create([
            'email' => 'bob@example.com',
            'password' => bcrypt('password123'),
            'is_flagged' => false,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'bob@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['message', 'token', 'user']);
    }

    public function test_suspended_user_cannot_login(): void
    {
        $user = User::factory()->create([
            'email' => 'suspended@example.com',
            'password' => bcrypt('password123'),
            'is_flagged' => true,
            'flagged_reason' => 'Terms violation',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'suspended@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'message' => 'Your account has been suspended. Reason: Terms violation',
            ]);
    }

    public function test_protected_route_requires_jwt_token(): void
    {
        $response = $this->getJson('/api/auth/me');
        $response->assertStatus(401)
            ->assertJson(['message' => 'Unauthenticated. JWT token missing.']);
    }

    public function test_authenticated_user_can_access_me_endpoint(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_logout_revokes_jwt_token(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/logout');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Logged out successfully']);

        // Subsequent call with same token must be rejected
        $meResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/auth/me');

        $meResponse->assertStatus(401)
            ->assertJson(['message' => 'Unauthenticated. Invalid or expired JWT token.']);
    }

    public function test_regular_user_cannot_access_admin_routes(): void
    {
        $user = User::factory()->create([
            'role' => 'user',
            'is_flagged' => false,
        ]);
        $token = JwtAuthService::generateToken($user);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/admin/overview');

        $response->assertStatus(403);
    }

    public function test_admin_user_can_access_admin_routes(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'is_flagged' => false,
        ]);
        $token = JwtAuthService::generateToken($admin);

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/admin/overview');

        $response->assertStatus(200);
    }
}
