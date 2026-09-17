<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DetectStuckFinancialTransactionsCommandTest extends TestCase
{
    use RefreshDatabase;

    private function makePendingTransfer(User $user, Game $game, int $ageMinutes): Transaction
    {
        $t = Transaction::create([
            'user_id' => $user->id, 'game_id' => $game->id, 'type' => 'transfer',
            'amount' => 20, 'status' => 'pending', 'balance_reserved' => true,
        ]);
        $t->created_at = now()->subMinutes($ageMinutes);
        $t->save();

        return $t;
    }

    public function test_it_flags_a_stale_pending_recharge_for_an_automated_game(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'Stuck Game', 'is_active' => true]);
        $provider = GameApiProvider::create([
            'name' => 'stuckprovider', 'display_name' => 'Stuck Provider', 'base_url' => 'https://x.example.com',
            'agent_username' => 'a', 'is_active' => true, 'automate_deposit' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $t = $this->makePendingTransfer($user, $game, 20);

        $this->artisan('transactions:detect-stuck')
            ->expectsOutputToContain("#{$t->id}")
            ->assertExitCode(0);

        // Never touched.
        $this->assertSame('pending', $t->fresh()->status);
    }

    public function test_it_does_not_flag_a_pending_recharge_for_a_manual_only_game(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'Manual Game', 'is_active' => true]);
        // No provider assignment at all — this is a completely normal awaiting-admin-review row.

        $t = $this->makePendingTransfer($user, $game, 20);

        $this->artisan('transactions:detect-stuck')
            ->expectsOutputToContain('No stuck')
            ->assertExitCode(0);
    }

    public function test_it_does_not_flag_a_recently_created_pending_recharge(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'Fresh Game', 'is_active' => true]);
        $provider = GameApiProvider::create([
            'name' => 'freshprovider', 'display_name' => 'Fresh Provider', 'base_url' => 'https://x.example.com',
            'agent_username' => 'a', 'is_active' => true, 'automate_deposit' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        // Only 1 minute old — well within the normal instant-resolution window.
        $this->makePendingTransfer($user, $game, 1);

        $this->artisan('transactions:detect-stuck')
            ->expectsOutputToContain('No stuck')
            ->assertExitCode(0);
    }

    public function test_it_raises_a_stronger_warning_when_a_provider_call_already_succeeded(): void
    {
        $user = User::factory()->create();
        $game = Game::create(['name' => 'Risky Game', 'is_active' => true]);
        $provider = GameApiProvider::create([
            'name' => 'riskyprovider', 'display_name' => 'Risky Provider', 'base_url' => 'https://x.example.com',
            'agent_username' => 'a', 'is_active' => true, 'automate_deposit' => true,
        ]);
        GameProviderAssignment::create(['game_id' => $game->id, 'provider_id' => $provider->id]);

        $t = $this->makePendingTransfer($user, $game, 20);
        GameApiLog::create([
            'provider_id' => $provider->id, 'provider_name' => $provider->name, 'action' => 'recharge',
            'success' => true, 'related_transaction_id' => $t->id, 'created_at' => now(),
        ]);

        $this->artisan('transactions:detect-stuck')
            ->expectsOutputToContain('PROVIDER CALL SUCCEEDED')
            ->assertExitCode(0);
    }
}
