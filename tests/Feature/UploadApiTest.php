<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_upload_an_ico_favicon(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . JwtAuthService::generateToken($admin))
            ->post('/api/upload', [
                'file' => UploadedFile::fake()->create('favicon.ico', 10, 'image/x-icon'),
                'folder' => 'brand-assets',
            ]);

        $res->assertStatus(201);
        $this->assertNotEmpty($res->json('url'));
    }
}
