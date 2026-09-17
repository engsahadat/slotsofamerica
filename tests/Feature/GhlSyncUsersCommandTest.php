<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GhlSyncUsersCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_syncs_every_user_and_reports_a_summary(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake(['*/contacts/upsert' => Http::response(['contact' => ['id' => 'c_1']], 200)]);

        User::factory()->count(3)->create();

        $this->artisan('ghl:sync-users')
            ->expectsOutputToContain('Synced: 3 succeeded, 0 failed.')
            ->assertExitCode(0);

        $this->assertSame(3, User::whereNotNull('ghl_contact_id')->count());
    }

    public function test_dry_run_lists_users_without_calling_the_api(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake();

        User::factory()->count(2)->create();

        $this->artisan('ghl:sync-users --dry-run')->assertExitCode(0);

        Http::assertNothingSent();
        $this->assertSame(0, User::whereNotNull('ghl_contact_id')->count());
    }

    public function test_limit_option_only_syncs_the_first_n_users(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake(['*/contacts/upsert' => Http::response(['contact' => ['id' => 'c_1']], 200)]);

        User::factory()->count(5)->create();

        $this->artisan('ghl:sync-users --limit=2')->assertExitCode(0);

        $this->assertSame(2, User::whereNotNull('ghl_contact_id')->count());
    }

    /**
     * Failure & Recovery: "GHL sync can retry later" — the practical retry path when GHL was
     * down during registration/profile-update is re-running this command targeted at exactly
     * the users whose sync never actually succeeded, without re-touching everyone else.
     */
    public function test_failed_only_option_only_retries_users_without_a_ghl_contact_id(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake(['*/contacts/upsert' => Http::response(['contact' => ['id' => 'c_new']], 200)]);

        $alreadySynced = User::factory()->create(['ghl_contact_id' => 'already-linked']);
        $neverSynced = User::factory()->count(2)->create(['ghl_contact_id' => null]);

        $this->artisan('ghl:sync-users --failed-only')
            ->expectsOutputToContain('Synced: 2 succeeded, 0 failed.')
            ->assertExitCode(0);

        $this->assertSame('already-linked', $alreadySynced->fresh()->ghl_contact_id);
        foreach ($neverSynced as $u) {
            $this->assertSame('c_new', $u->fresh()->ghl_contact_id);
        }
    }
}
