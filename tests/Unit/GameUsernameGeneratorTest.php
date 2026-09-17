<?php

namespace Tests\Unit;

use App\Models\Game;
use App\Models\GameAccount;
use App\Services\GameUsernameGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameUsernameGeneratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_generate_combines_the_app_username_with_the_games_configured_suffix(): void
    {
        $game = Game::create(['name' => 'Game Vault', 'username_suffix' => 'GV', 'is_active' => true]);

        $this->assertSame('john123GV', GameUsernameGenerator::generate('john123', $game));
    }

    public function test_configured_suffix_is_not_algorithmically_derivable_and_must_come_from_the_column(): void
    {
        // "Juwa" -> "JW" is a real-world example that no simple first-letters rule would produce.
        $game = Game::create(['name' => 'Juwa', 'username_suffix' => 'JW', 'is_active' => true]);

        $this->assertSame('john123JW', GameUsernameGenerator::generate('john123', $game));
    }

    public function test_falls_back_to_a_derived_suffix_when_the_game_has_none_configured(): void
    {
        $twoWord = Game::create(['name' => 'Orion Star', 'is_active' => true]);
        $this->assertSame('OS', GameUsernameGenerator::suffixFor($twoWord));

        $oneWord = Game::create(['name' => 'Juwa', 'is_active' => true]);
        $this->assertSame('JU', GameUsernameGenerator::suffixFor($oneWord));
    }

    public function test_generate_lowercases_and_strips_symbols_from_the_app_username(): void
    {
        $game = Game::create(['name' => 'Orion Star', 'username_suffix' => 'OS', 'is_active' => true]);

        $this->assertSame('johndoeOS', GameUsernameGenerator::generate('John_Doe!', $game));
    }

    public function test_generate_pads_a_too_short_app_username(): void
    {
        $game = Game::create(['name' => 'Orion Star', 'username_suffix' => 'OS', 'is_active' => true]);

        $this->assertSame('jo0OS', GameUsernameGenerator::generate('jo', $game));
    }

    public function test_generate_truncates_a_long_app_username_to_stay_within_the_16_char_ceiling(): void
    {
        $game = Game::create(['name' => 'Orion Star', 'username_suffix' => 'OS', 'is_active' => true]);

        $result = GameUsernameGenerator::generate('averyveryverylongusername', $game);

        $this->assertLessThanOrEqual(16, strlen($result));
        $this->assertStringEndsWith('OS', $result);
    }

    public function test_generate_avoids_colliding_with_an_existing_game_account_for_the_same_game(): void
    {
        $game = Game::create(['name' => 'Game Vault', 'username_suffix' => 'GV', 'is_active' => true]);
        GameAccount::create(['game_id' => $game->id, 'username' => 'john123GV', 'password_hash' => 'x', 'status' => 'assigned']);

        $result = GameUsernameGenerator::generate('john123', $game);

        $this->assertSame('john123GV2', $result);
    }

    public function test_generate_does_not_collide_with_the_same_username_on_a_different_game(): void
    {
        $gameA = Game::create(['name' => 'Game Vault', 'username_suffix' => 'GV', 'is_active' => true]);
        $gameB = Game::create(['name' => 'Game Vault 2', 'username_suffix' => 'GV', 'is_active' => true]);
        GameAccount::create(['game_id' => $gameA->id, 'username' => 'john123GV', 'password_hash' => 'x', 'status' => 'assigned']);

        // Same suffix, different game_id — no collision scope crossing games.
        $this->assertSame('john123GV', GameUsernameGenerator::generate('john123', $gameB));
    }
}
