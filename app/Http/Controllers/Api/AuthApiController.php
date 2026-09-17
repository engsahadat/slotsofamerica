<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\ResetPasswordMail;
use App\Models\User;
use App\Services\EmailTemplateMailer;
use App\Services\GoHighLevelService;
use App\Services\JwtAuthService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthApiController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'username' => 'nullable|string|max:255|unique:users',
            'phone' => 'nullable|string|max:50',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => strtolower($validated['email']),
            'username' => $validated['username'] ?? explode('@', $validated['email'])[0],
            'phone' => $validated['phone'] ?? null,
            'password' => Hash::make($validated['password']),
            'role' => 'user',
            'balance' => 0.00,
        ]);

        $jwt = JwtAuthService::generateToken($user);

        EmailTemplateMailer::fireTrigger('user_registered', $user);

        // Best-effort customer profile sync — GoHighLevelService never throws on its own,
        // but this try/catch is a deliberate second line of defense: a GHL outage must never
        // turn a successful registration into a 500 for the new user.
        try {
            GoHighLevelService::syncUser($user);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'message' => 'Registration successful',
            'token' => $jwt,
            'user' => $user,
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('email', strtolower($request->email))
            ->orWhere('username', $request->email)
            ->first();

        // Hash::check() throws (rather than returning false) if the stored value isn't a
        // recognized Bcrypt hash at all — e.g. a row inserted by raw SQL/an old data import
        // that bypassed the model's `password => 'hashed'` cast, or a blank/null password.
        // That's a data problem for an admin to fix, not something a logging-in user should
        // ever see as a raw exception message — treat it the same as "wrong password".
        $passwordMatches = false;
        if ($user) {
            try {
                $passwordMatches = Hash::check($request->password, $user->password);
            } catch (\Throwable $e) {
                report($e);
                $passwordMatches = false;
            }
        }

        if (!$user || !$passwordMatches) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials do not match our records.'],
            ]);
        }

        if ($user->is_flagged) {
            return response()->json([
                'message' => 'Your account has been suspended. Reason: ' . ($user->flagged_reason ?? 'Contact support.')
            ], 403);
        }

        $jwt = JwtAuthService::generateToken($user);

        $user->last_login_at = now();
        $user->save();

        return response()->json([
            'message' => 'Login successful',
            'token' => $jwt,
            'user' => $user,
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $request->user(),
        ]);
    }

    public function logout(Request $request)
    {
        $token = $request->bearerToken();
        if ($token) {
            JwtAuthService::revokeToken($token);
        }

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    public function forgotPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|email',
        ]);

        $email = strtolower($validated['email']);
        $user = User::where('email', $email)->first();

        // Always return a generic success message so this endpoint can't be used to enumerate
        // registered emails — only actually send a mail if the account exists.
        if ($user) {
            $rawToken = Str::random(64);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $email],
                ['token' => Hash::make($rawToken), 'created_at' => now()]
            );

            $resetUrl = rtrim(config('app.url', 'http://localhost'), '/')
                . '/reset-password?email=' . urlencode($email) . '&token=' . $rawToken;

            Mail::to($email)->send(new ResetPasswordMail($resetUrl));
        }

        return response()->json([
            'message' => 'If an account with that email exists, a password reset link has been sent.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|email',
            'token' => 'required|string',
            'password' => 'required|string|min:6',
        ]);

        $email = strtolower($validated['email']);
        $record = DB::table('password_reset_tokens')->where('email', $email)->first();

        if (!$record || !Hash::check($validated['token'], $record->token)) {
            throw ValidationException::withMessages([
                'token' => ['This password reset link is invalid.'],
            ]);
        }

        if (now()->diffInMinutes($record->created_at, absolute: true) > 60) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            throw ValidationException::withMessages([
                'token' => ['This password reset link has expired. Please request a new one.'],
            ]);
        }

        $user = User::where('email', $email)->firstOrFail();
        $user->password = Hash::make($validated['password']);
        $user->save();

        // Revoke all existing JWT tokens for this user
        JwtAuthService::revokeAllUserTokens($user->id);

        DB::table('password_reset_tokens')->where('email', $email)->delete();

        return response()->json([
            'message' => 'Password reset successfully. You can now log in with your new password.',
        ]);
    }
}
