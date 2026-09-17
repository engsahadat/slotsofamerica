<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class JwtAuthServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_generate_and_validate_jwt_token(): void
    {
        $user = User::factory()->create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'role' => 'user',
            'is_flagged' => false,
        ]);

        $token = JwtAuthService::generateToken($user);

        $this::assertIsString($token);
        $this::assertNotEmpty($token);

        $validatedUser = JwtAuthService::validateToken($token);

        $this::assertNotNull($validatedUser);
        $this::assertEquals($user->id, $validatedUser->id);
    }

    public function test_revoked_token_is_rejected(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);

        $this::assertNotNull(JwtAuthService::validateToken($token));

        $revoked = JwtAuthService::revokeToken($token);
        $this::assertTrue($revoked);

        $this::assertNull(JwtAuthService::validateToken($token));
    }

    public function test_global_user_revocation_rejects_old_tokens(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);

        $this::assertNotNull(JwtAuthService::validateToken($token));

        JwtAuthService::revokeAllUserTokens($user->id);

        $this::assertNull(JwtAuthService::validateToken($token));
    }

    public function test_flagged_user_token_is_rejected(): void
    {
        $user = User::factory()->create(['is_flagged' => false]);
        $token = JwtAuthService::generateToken($user);

        $this::assertNotNull(JwtAuthService::validateToken($token));

        $user->is_flagged = true;
        $user->save();

        $this::assertNull(JwtAuthService::validateToken($token));
    }

    public function test_invalid_token_returns_null(): void
    {
        $this::assertNull(JwtAuthService::validateToken('invalid.jwt.token'));
    }
}
