<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression: UserDashboard.tsx's "Last login" line read a dead Supabase-era field
 * (`user.last_sign_in_at`) that this Laravel app never populated, so it silently never showed.
 * login() now stamps a real `last_login_at` column.
 */
class AuthLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_stamps_last_login_at(): void
    {
        $user = User::factory()->create(['email' => 'logintest@example.com', 'password' => bcrypt('secret123')]);
        $this->assertNull($user->last_login_at);

        $res = $this->postJson('/api/auth/login', ['email' => 'logintest@example.com', 'password' => 'secret123']);
        $res->assertStatus(200);

        $this->assertNotNull($user->fresh()->last_login_at);
        $this->assertNotNull($res->json('user.last_login_at'));
    }

    /**
     * Regression: a row whose `password` column isn't a real Bcrypt hash (e.g. inserted by raw
     * SQL/an old data import that bypassed the User model's `password => 'hashed'` cast, or left
     * null/blank) makes Hash::check() throw "This password does not use the Bcrypt algorithm."
     * instead of returning false — that raw exception was leaking straight to the login response
     * instead of the normal "credentials don't match" message.
     */
    public function test_login_with_a_malformed_stored_password_hash_fails_cleanly(): void
    {
        $user = User::factory()->create(['email' => 'brokenhash@example.com', 'password' => bcrypt('irrelevant')]);
        // Bypass the model's hashing cast entirely, like a raw SQL insert/import would.
        \Illuminate\Support\Facades\DB::table('users')->where('id', $user->id)->update(['password' => 'not-a-real-hash']);

        $res = $this->postJson('/api/auth/login', ['email' => 'brokenhash@example.com', 'password' => 'anything']);

        $res->assertStatus(422);
        $res->assertJsonPath('errors.email.0', 'The provided credentials do not match our records.');
    }
}
