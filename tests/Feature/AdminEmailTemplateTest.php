<?php

namespace Tests\Feature;

use App\Mail\GenericTemplateMail;
use App\Models\EmailTemplate;
use App\Models\Game;
use App\Models\GameAccount;
use App\Models\PasswordRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Services\JwtAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdminEmailTemplateTest extends TestCase
{
    use RefreshDatabase;

    private function tokenFor(User $user): string
    {
        return JwtAuthService::generateToken($user);
    }

    public function test_admin_can_create_update_duplicate_and_delete_a_template(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $token = $this->tokenFor($admin);

        $createRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/admin/email-templates', [
                'name' => 'Welcome Email',
                'category' => 'welcome',
                'trigger_event' => 'user_registered',
                'subject' => 'Hi {{user_name}}',
                'body_html' => '<p>Hello {{user_name}}</p>',
            ]);
        $createRes->assertStatus(201);
        $id = $createRes->json('template.id');
        $this->assertDatabaseHas('email_templates', ['id' => $id, 'name' => 'Welcome Email', 'is_active' => true]);

        $updateRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->putJson("/api/admin/email-templates/{$id}", ['subject' => 'Updated subject']);
        $updateRes->assertStatus(200);
        $this->assertDatabaseHas('email_templates', ['id' => $id, 'subject' => 'Updated subject']);

        $dupRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson("/api/admin/email-templates/{$id}/duplicate");
        $dupRes->assertStatus(201);
        $this->assertDatabaseHas('email_templates', ['name' => 'Welcome Email (Copy)', 'is_active' => false]);

        $delRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->deleteJson("/api/admin/email-templates/{$id}");
        $delRes->assertStatus(200);
        $this->assertDatabaseMissing('email_templates', ['id' => $id]);
    }

    public function test_send_test_email_interpolates_placeholders(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson('/api/admin/email-templates/send-test', [
                'to' => 'test@example.com',
                'subject' => 'Hello {{user_name}}',
                'body_html' => '<p>Amount: {{amount}}</p>',
            ]);
        $res->assertStatus(200)->assertJsonPath('success', true);

        Mail::assertSent(GenericTemplateMail::class, function ($mail) {
            return $mail->emailSubject === 'Hello John Doe' && str_contains($mail->htmlBody, 'Amount: 50.00');
        });
    }

    public function test_non_admin_cannot_manage_templates(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($user))
            ->getJson('/api/admin/email-templates');
        $res->assertStatus(403);
    }

    public function test_transaction_approval_fires_matching_template(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        EmailTemplate::create([
            'name' => 'Deposit Approved', 'category' => 'transaction', 'trigger_event' => 'transaction_approved_deposit',
            'subject' => 'Your deposit of ${{amount}} was {{status}}', 'body_html' => '<p>Hi {{user_name}}</p>', 'is_active' => true,
        ]);
        $tx = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 25, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$tx->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Mail::assertSent(GenericTemplateMail::class, function ($mail) {
            return str_contains($mail->emailSubject, 'Approved') || str_contains($mail->emailSubject, '25.00');
        });
    }

    /**
     * Regression: Settings.tsx's "Email Notifications" toggle persisted to the real
     * `users.email_notifications` column but nothing ever checked it before sending — every
     * triggered email went out regardless. EmailTemplateMailer::fireTrigger() now respects it.
     */
    public function test_triggered_email_is_skipped_when_user_has_opted_out(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user', 'email_notifications' => false]);
        EmailTemplate::create([
            'name' => 'Deposit Approved', 'category' => 'transaction', 'trigger_event' => 'transaction_approved_deposit',
            'subject' => 'Your deposit was {{status}}', 'body_html' => '<p>Hi {{user_name}}</p>', 'is_active' => true,
        ]);
        $tx = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 25, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$tx->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Mail::assertNothingSent();
    }

    public function test_transaction_approval_does_not_fail_when_no_template_matches(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        $tx = Transaction::create(['user_id' => $player->id, 'type' => 'deposit', 'amount' => 25, 'status' => 'pending']);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/transactions/{$tx->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Mail::assertNothingSent();
    }

    public function test_password_request_approval_fires_matching_template(): void
    {
        Mail::fake();
        $admin = User::factory()->create(['role' => 'admin']);
        $player = User::factory()->create(['role' => 'user']);
        EmailTemplate::create([
            'name' => 'Password Approved', 'category' => 'custom', 'trigger_event' => 'password_request_approved',
            'subject' => 'Password change {{status}}', 'body_html' => '<p>Hi {{user_name}}</p>', 'is_active' => true,
        ]);
        $game = Game::create(['name' => 'Slots Master', 'is_active' => true]);
        $account = GameAccount::create(['game_id' => $game->id, 'username' => 'player1', 'password_hash' => 'old', 'status' => 'assigned', 'assigned_to' => $player->id]);
        $req = PasswordRequest::create([
            'user_id' => $player->id, 'game_account_id' => $account->id, 'requested_password' => 'newpass123', 'status' => 'pending',
        ]);

        $res = $this->withHeader('Authorization', 'Bearer ' . $this->tokenFor($admin))
            ->postJson("/api/admin/game-access/password/{$req->id}/review", ['status' => 'approved']);
        $res->assertStatus(200);

        Mail::assertSent(GenericTemplateMail::class, fn ($mail) => str_contains($mail->emailSubject, 'Approved'));
    }

    public function test_registration_fires_user_registered_template(): void
    {
        Mail::fake();
        EmailTemplate::create([
            'name' => 'Welcome', 'category' => 'welcome', 'trigger_event' => 'user_registered',
            'subject' => 'Welcome {{user_name}}!', 'body_html' => '<p>Hi {{user_name}}</p>', 'is_active' => true,
        ]);

        $res = $this->postJson('/api/auth/register', [
            'name' => 'New Player', 'email' => 'newplayer@example.com', 'password' => 'password123',
        ]);
        $res->assertStatus(201);

        Mail::assertSent(GenericTemplateMail::class, fn ($mail) => str_contains($mail->emailSubject, 'New Player'));
    }
}
