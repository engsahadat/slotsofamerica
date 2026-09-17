<?php

namespace Tests\Feature;

use App\Models\SiteSetting;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UserProfileGhlSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_updating_name_re_syncs_the_ghl_contact(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake(['*/contacts/upsert' => Http::response(['contact' => ['id' => 'c_1']], 200)]);

        $user = User::factory()->create(['name' => 'Old Name']);
        $token = JwtAuthService::generateToken($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/settings/profile', ['name' => 'New Name'])
            ->assertStatus(200);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/contacts/upsert') && $request['firstName'] === 'New');
    }

    public function test_updating_only_email_notifications_does_not_trigger_a_ghl_call(): void
    {
        SiteSetting::create(['ghl_api_key' => 'pit-test', 'ghl_location_id' => 'loc_1']);
        Http::fake();

        $user = User::factory()->create();
        $token = JwtAuthService::generateToken($user);

        $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/user/settings/profile', ['email_notifications' => false])
            ->assertStatus(200);

        Http::assertNothingSent();
    }
}
