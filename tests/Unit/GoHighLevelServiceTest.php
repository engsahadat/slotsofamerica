<?php

namespace Tests\Unit;

use App\Models\SiteSetting;
use App\Models\User;
use App\Services\GoHighLevelService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoHighLevelServiceTest extends TestCase
{
    use RefreshDatabase;

    private function configure(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-testtoken', 'ghl_location_id' => 'loc_123']);
    }

    public function test_it_creates_a_new_contact_and_stores_the_returned_id(): void
    {
        $this->configure();
        Http::fake([
            '*/contacts/upsert' => Http::response(['new' => true, 'contact' => ['id' => 'ghlc_1', 'email' => 'a@b.com']], 200),
        ]);

        $user = User::factory()->create(['name' => 'John Doe', 'email' => 'a@b.com', 'phone' => '+15550001111']);

        $result = GoHighLevelService::syncUser($user);

        $this->assertTrue($result['success']);
        $this->assertSame('ghlc_1', $result['contact_id']);
        $this->assertSame('ghlc_1', $user->fresh()->ghl_contact_id);

        Http::assertSent(function ($request) use ($user) {
            return str_contains($request->url(), '/contacts/upsert')
                && $request->hasHeader('Authorization', 'Bearer pit-testtoken')
                && $request->hasHeader('Version', '2021-07-28')
                && $request['locationId'] === 'loc_123'
                && $request['firstName'] === 'John'
                && $request['lastName'] === 'Doe'
                && $request['email'] === 'a@b.com'
                && $request['phone'] === '+15550001111'
                && in_array('site-user-id:' . $user->id, $request['tags'], true);
        });

        $this->assertDatabaseHas('ghl_api_logs', ['action' => 'upsert_contact', 'success' => true]);
    }

    public function test_a_user_with_a_stored_contact_id_is_updated_directly_not_upserted(): void
    {
        $this->configure();
        Http::fake([
            '*/contacts/existing_id' => Http::response(['contact' => ['id' => 'existing_id']], 200),
        ]);

        // ghl_contact_id is deliberately NOT mass-assignable (only GoHighLevelService itself
        // sets it) — assign it directly to bypass that guard, as the service does.
        $user = User::factory()->create();
        $user->ghl_contact_id = 'existing_id';
        $user->save();

        $result = GoHighLevelService::syncUser($user);

        $this->assertTrue($result['success']);
        $this->assertSame('existing_id', $result['contact_id']);
        Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/contacts/existing_id'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/contacts/upsert'));
    }

    /**
     * Testing Requirements: "Duplicate prevention" — a user with no stored ghl_contact_id yet
     * (e.g. their very first sync attempt failed and they're now retrying) whose email already
     * matches an existing GHL contact must reuse that contact, never create a second one.
     * /contacts/upsert IS the duplicate-prevention mechanism (GHL matches by email/phone
     * server-side); this locks in that our own code correctly adopts whatever id upsert
     * returns, including when GHL reports it matched an existing contact (new:false).
     */
    public function test_an_existing_ghl_contact_matched_by_email_is_reused_not_duplicated(): void
    {
        $this->configure();
        Http::fake([
            '*/contacts/upsert' => Http::response(['new' => false, 'contact' => ['id' => 'existing_matched_id', 'email' => 'dup@example.com']], 200),
        ]);

        // ghl_contact_id defaults to null for a brand-new user (never synced before).
        $user = User::factory()->create(['email' => 'dup@example.com']);

        $result = GoHighLevelService::syncUser($user);

        $this->assertTrue($result['success']);
        $this->assertSame('existing_matched_id', $result['contact_id']);
        $this->assertSame('existing_matched_id', $user->fresh()->ghl_contact_id);
        Http::assertSentCount(1); // one upsert call, no separate "create" attempt.
    }

    /**
     * Regression: confirmed against the real live API — PUT /contacts/{id} rejects the whole
     * request ("property locationId should not exist") if locationId is present in the body,
     * unlike POST /contacts/upsert which requires it. Every update was failing until this was
     * excluded from the update payload specifically.
     */
    public function test_the_update_call_never_sends_locationid(): void
    {
        $this->configure();
        Http::fake(['*/contacts/existing_id' => Http::response(['contact' => ['id' => 'existing_id']], 200)]);

        $user = User::factory()->create();
        $user->ghl_contact_id = 'existing_id';
        $user->save();

        GoHighLevelService::syncUser($user);

        Http::assertSent(fn ($request) => $request->method() === 'PUT' && !array_key_exists('locationId', $request->data()));
    }

    public function test_a_stale_contact_id_that_404s_self_heals_via_upsert(): void
    {
        $this->configure();
        Http::fake([
            '*/contacts/stale_id' => Http::response(['message' => 'not found'], 404),
            '*/contacts/upsert' => Http::response(['contact' => ['id' => 'fresh_id']], 200),
        ]);

        $user = User::factory()->create();
        $user->ghl_contact_id = 'stale_id';
        $user->save();

        $result = GoHighLevelService::syncUser($user);

        $this->assertTrue($result['success']);
        $this->assertSame('fresh_id', $result['contact_id']);
        $this->assertSame('fresh_id', $user->fresh()->ghl_contact_id);
    }

    public function test_missing_configuration_fails_cleanly_without_an_http_call(): void
    {
        Http::fake();
        $user = User::factory()->create();

        $result = GoHighLevelService::syncUser($user);

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('not configured', $result['error']);
        Http::assertNothingSent();
        $this->assertDatabaseHas('ghl_api_logs', ['success' => false]);
    }

    public function test_a_network_failure_never_throws_and_is_logged(): void
    {
        $this->configure();
        Http::fake(function () {
            throw new \Illuminate\Http\Client\ConnectionException('Could not resolve host');
        });

        $user = User::factory()->create();

        $result = GoHighLevelService::syncUser($user);

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('Could not resolve host', $result['error']);
        $this->assertDatabaseHas('ghl_api_logs', ['success' => false]);
    }

    public function test_registering_a_new_user_triggers_a_sync_but_a_ghl_outage_never_fails_registration(): void
    {
        $this->configure();
        Http::fake(function () {
            throw new \Illuminate\Http\Client\ConnectionException('GHL is down');
        });

        $res = $this->postJson('/api/auth/register', [
            'name' => 'New Player', 'email' => 'newplayer@example.com', 'password' => 'secret123',
        ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('users', ['email' => 'newplayer@example.com']);
        $this->assertDatabaseHas('ghl_api_logs', ['success' => false]);
    }
}
