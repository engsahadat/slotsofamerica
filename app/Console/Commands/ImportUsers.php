<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ImportUsers extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'users:import {path : Path to the exported users JSON file}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import users from a legacy Supabase JSON export without overwriting existing accounts';

    public function handle(): int
    {
        $path = $this->argument('path');

        if (!is_file($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $data = json_decode(file_get_contents($path), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->error('Invalid JSON: ' . json_last_error_msg());

            return self::FAILURE;
        }

        $records = $data['users'] ?? (array_is_list($data) ? $data : null);

        if (!is_array($records)) {
            $this->error('Could not find a "users" list in the JSON file.');

            return self::FAILURE;
        }

        $this->info('Found ' . count($records) . ' user records to process.');

        $created = 0;
        $skippedExistingEmail = 0;
        $skippedExistingLegacyId = 0;
        $usernameAdjusted = 0;
        $errors = [];

        $existingEmails = User::pluck('email')->map(fn ($e) => strtolower($e))->flip();
        $existingLegacyIds = User::whereNotNull('legacy_id')->pluck('legacy_id')->flip();
        $existingUsernames = User::whereNotNull('username')->pluck('username')->flip();

        foreach ($records as $record) {
            $email = strtolower(trim($record['email'] ?? ''));

            if ($email === '') {
                $errors[] = "Skipped record with missing email (legacy_id: " . ($record['id'] ?? 'unknown') . ')';
                continue;
            }

            if (isset($existingEmails[$email])) {
                $skippedExistingEmail++;
                continue;
            }

            $legacyId = $record['id'] ?? null;

            if ($legacyId && isset($existingLegacyIds[$legacyId])) {
                $skippedExistingLegacyId++;
                continue;
            }

            try {
                DB::transaction(function () use ($record, $email, $legacyId, &$existingEmails, &$existingLegacyIds, &$existingUsernames, &$created, &$usernameAdjusted) {
                    $firstName = trim((string) ($record['first_name'] ?? ''));
                    $lastName = trim((string) ($record['last_name'] ?? ''));
                    $displayName = trim((string) ($record['display_name'] ?? ''));
                    $rawUsername = trim((string) ($record['username'] ?? ''));

                    if ($firstName !== '' && $lastName !== '') {
                        $name = "{$firstName} {$lastName}";
                    } elseif ($displayName !== '') {
                        $name = $displayName;
                    } elseif ($rawUsername !== '') {
                        $name = $rawUsername;
                    } else {
                        $name = 'Imported User';
                    }

                    $username = $rawUsername !== '' ? $rawUsername : Str::slug($email, '') . Str::random(4);
                    $originalUsername = $username;
                    $suffix = 1;

                    while (isset($existingUsernames[$username])) {
                        $suffix++;
                        $username = $originalUsername . '_' . $suffix;
                    }

                    $emailVerified = (bool) ($record['email_verified'] ?? false);
                    $phoneVerified = (bool) ($record['phone_verified'] ?? false);

                    $user = new User();
                    $user->legacy_id = $legacyId;
                    $user->name = $name;
                    $user->username = $username;
                    $user->email = $record['email'];
                    $user->phone = $record['phone'] ?? null;
                    $user->avatar_url = $record['avatar_url'] ?? null;
                    $user->balance = (float) ($record['balance'] ?? 0);
                    $user->role = in_array($record['role'] ?? 'user', ['user', 'manager', 'admin'], true) ? $record['role'] : 'user';
                    $user->is_flagged = (bool) ($record['is_flagged'] ?? false);
                    $user->flagged_reason = $record['flagged_reason'] ?? null;
                    $user->phone_verified = $phoneVerified;
                    $user->phone_verified_at = $phoneVerified ? ($record['created_at'] ?? now()) : null;
                    $user->email_verified_at = $emailVerified ? ($record['created_at'] ?? now()) : null;
                    $user->country = $record['country'] ?? null;
                    $user->state = $record['state'] ?? null;
                    $user->gender = $record['gender'] ?? null;
                    $user->date_of_birth = $record['date_of_birth'] ?? null;
                    $user->password = Str::random(20);

                    if (!empty($record['created_at'])) {
                        $user->created_at = $record['created_at'];
                        $user->updated_at = $record['created_at'];
                    }

                    $user->save();

                    $existingEmails[$email] = true;
                    if ($legacyId) {
                        $existingLegacyIds[$legacyId] = true;
                    }
                    $existingUsernames[$username] = true;
                    $created++;

                    if ($username !== $originalUsername) {
                        $usernameAdjusted++;
                    }
                });
            } catch (\Throwable $e) {
                $errors[] = "Failed for email {$email}: " . $e->getMessage();
            }
        }

        $this->newLine();
        $this->info('Import complete.');
        $this->table(['Metric', 'Count'], [
            ['Created', $created],
            ['Skipped (email already exists)', $skippedExistingEmail],
            ['Skipped (legacy_id already imported)', $skippedExistingLegacyId],
            ['Usernames auto-suffixed for collision', $usernameAdjusted],
            ['Errors', count($errors)],
        ]);

        if (!empty($errors)) {
            $this->warn('Errors encountered:');
            foreach (array_slice($errors, 0, 20) as $error) {
                $this->line(" - {$error}");
            }
            if (count($errors) > 20) {
                $this->line(' ... and ' . (count($errors) - 20) . ' more.');
            }
        }

        return self::SUCCESS;
    }
}
