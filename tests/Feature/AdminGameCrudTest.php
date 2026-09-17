<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminGameCrudTest extends TestCase
{
    use RefreshDatabase;

    private function adminToken(): string
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return JwtAuthService::generateToken($admin);
    }

    public function test_admin_can_create_a_game_with_a_username_suffix(): void
    {
        $token = $this->adminToken();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/games', ['name' => 'Test Game', 'username_suffix' => 'tg']);

        $res->assertStatus(201);
        // Stored as-typed here — GameUsernameGenerator uppercases at read time, so the
        // column itself doesn't need to force a case.
        $this->assertDatabaseHas('games', ['name' => 'Test Game', 'username_suffix' => 'tg']);
    }

    public function test_creating_a_game_with_a_symbol_in_the_suffix_is_rejected(): void
    {
        $token = $this->adminToken();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/games', ['name' => 'Test Game', 'username_suffix' => 'T-G']);

        $res->assertStatus(422)
            ->assertJsonPath('errors.username_suffix.0', 'Username suffix can only contain letters and numbers.');
    }

    public function test_admin_can_update_a_games_username_suffix(): void
    {
        $token = $this->adminToken();
        $game = Game::create(['name' => 'Test Game', 'is_active' => true]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson("/api/admin/games/{$game->id}", ['username_suffix' => 'TG']);

        $res->assertStatus(200);
        $this->assertDatabaseHas('games', ['id' => $game->id, 'username_suffix' => 'TG']);
    }
}
