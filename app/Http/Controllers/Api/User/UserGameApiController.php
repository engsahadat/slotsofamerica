<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Game;
use App\Models\GameAccount;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Notification;
use App\Models\PasswordRequest;
use App\Services\FastApiService;
use App\Services\GameAgentApiService;
use App\Services\GameApiProvider\Provisioner;
use App\Services\GameUsernameGenerator;
use App\Services\OrionStarsApiService;
use App\Services\RiverPayApiService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class UserGameApiController extends Controller
{
    public function __construct(private Provisioner $provisioner)
    {
    }

    public function index()
    {
        $games = Game::where('is_active', true)->get();

        return response()->json([
            'games' => $games,
        ]);
    }

    /**
     * Account Registration & Instant Credentials Provisioning:
     * Registers account via upstream API (Orion Stars, Game Agent, FastAPI, River Pay),
     * creates/assigns GameAccount, and returns approved credentials (username, password & web_login_url).
     */
    public function requestUnlock(Request $request, $gameId = null)
    {
        $targetGameId = $gameId ?? $request->input('game_id');
        if ($targetGameId) {
            $request->merge(['game_id' => $targetGameId]);
        }

        $validated = $request->validate([
            'game_id' => 'required|exists:games,id,is_active,1',
            'email' => 'nullable|email|max:255',
            'game_password' => 'nullable|string|max:255',
        ]);

        $user = $request->user();
        $game = Game::findOrFail($validated['game_id']);

        // Check for existing approved request
        $existingReq = GameUnlockRequest::where('user_id', $user->id)
            ->where('game_id', $game->id)
            ->first();

        if ($existingReq && $existingReq->status === 'approved' && !empty($existingReq->game_password)) {
            return response()->json([
                'success' => true,
                'status' => 'approved',
                'username' => $existingReq->username,
                'password' => $existingReq->game_password,
                'game_password' => $existingReq->game_password,
                'message' => 'Access granted! Your game credentials are ready.',
                'request' => $existingReq,
            ], 200);
        }

        // Already pending manual review — don't re-attempt registration or re-notify admins on
        // every repeated click; the frontend disables the button once it sees status:pending, but
        // this guards the API itself against a stale page state doing it anyway.
        if ($existingReq && $existingReq->status === 'pending') {
            return response()->json([
                'success' => false,
                'status' => 'pending',
                'message' => 'Your request is already pending admin approval. You will be notified once your account is ready.',
                'request' => $existingReq,
            ], 200);
        }

        // Generate the game-specific username BEFORE calling any provider API — our own
        // system decides the format (site username + this game's configured suffix; see
        // GameUsernameGenerator and Admin > Games), never the provider. Every branch below
        // sends exactly this username to the provider and keeps it as the account's login
        // regardless of what the provider echoes back — see the no-overwrite comments at
        // each provider branch (River Pay is the one unavoidable exception: it has no
        // username input at all, see its own comment below).
        $gameUsername = GameUsernameGenerator::generate($user->username ?? $user->name ?? 'player', $game);

        $freshPassword = $validated['game_password'] ?? GameAccount::generateRandomPassword();
        $apiUsername = $gameUsername;
        $providerAccountId = null;
        $webLoginUrl = null;

        // Try the Game API Providers module first (admin-configurable, generic
        // multi-provider integration — see /admin/game-api-providers). Only
        // used when the game has been explicitly assigned to a provider AND
        // that provider has "Auto-create accounts" turned on; any failure
        // (no assignment, inactive, no password, provider rejected, etc)
        // falls straight through to the legacy per-game dispatch below,
        // unchanged, so existing games keep working exactly as before.
        $registeredViaGameApi = $this->provisioner->registerOnAssignedProvider($game->id, $gameUsername, $freshPassword);

        // Tracks whether an upstream provider actually confirmed the account
        // was created — never fabricate "approved" credentials that were
        // never registered anywhere real. Only a real pool account (below)
        // or a confirmed provider registration may mark this true.
        $registrationConfirmed = false;

        if ($registeredViaGameApi['success']) {
            // $apiUsername already equals $gameUsername — Provisioner echoes back exactly
            // what it was asked to create, never a provider-chosen value.
            $providerAccountId = $registeredViaGameApi['provider_account_id'] ?? null;
            $registrationConfirmed = true;
        } else {
            $gName = strtolower(trim($game->name));
            $provider = strtolower($game->api_provider ?? '');
            if (empty($provider)) {
                if (str_contains($gName, 'orion')) {
                    $provider = 'orion_stars';
                } elseif (str_contains($gName, 'river')) {
                    $provider = 'river_pay';
                } elseif (str_contains($gName, 'fast')) {
                    $provider = 'fast_api';
                } else {
                    $provider = 'game_agent'; // Juwa, Game Vault, Milky Way, Panda Master, Fire Kirin, etc.
                }
            }

            // Execute Provider API registration. $apiUsername stays our own generated
            // $gameUsername for every provider — it was already sent as the requested
            // account name, and each provider's own docs confirm later calls (deposit,
            // balance, etc.) use that same un-prefixed value back, not whatever "full"/
            // display variant it echoes. That echoed value is captured as
            // $providerAccountId for reference only, never adopted as the login username.
            // River Pay is the sole structural exception: its create-account call has no
            // username field at all — it always mints its own opaque "code", which IS the
            // account's only identifier, so that one case must keep using the response.
            try {
                if ($provider === 'orion_stars' || str_contains($provider, 'orion')) {
                    OrionStarsApiService::registerUser($gameUsername, $freshPassword);
                    try {
                        $info = OrionStarsApiService::queryInfo($gameUsername, $freshPassword);
                        if (!empty($info['webLoginUrl'])) {
                            $webLoginUrl = $info['webLoginUrl'];
                        }
                    } catch (Exception $e) {}
                } elseif ($provider === 'river_pay' || str_contains($provider, 'river')) {
                    $res = RiverPayApiService::createAccount('0.00');
                    if (!empty($res['code'])) {
                        $apiUsername = $res['code'];
                    }
                } elseif ($provider === 'fast_api' || str_contains($provider, 'fast')) {
                    $res = FastApiService::createUser($gameUsername, $freshPassword);
                    $providerAccountId = $res['full_account'] ?? null;
                } else {
                    // Game Agent API
                    $res = GameAgentApiService::addUser($gameUsername, $freshPassword);
                    $providerAccountId = $res['user_id'] ?? null;
                }
                $registrationConfirmed = true;
            } catch (Exception $e) {
                // Real failure — handled below. Do NOT fabricate credentials.
                $registrationConfirmed = false;
            }
        }

        // A confirmed live registration ALWAYS wins over a pool account — regression fix:
        // this used to check the pool first unconditionally, so a leftover "available" pool
        // row (e.g. juwa_user3, an admin-pre-stocked real account with its own fixed name)
        // would silently override a just-created, correctly-generated-username API account,
        // even when the live registration above succeeded. That orphaned the real account
        // just created on the provider's side and handed the user pool-style credentials
        // instead of the {app_username}{suffix} format — exactly what "do not let the
        // provider (or an unrelated pool) randomly determine the username" was meant to
        // prevent.
        //
        // The pool is now ALSO never used as a fallback for a game that HAS a Game API
        // provider assigned — found live: a real, working provider (Fire Kirin) had a leftover
        // pool account sitting available, and a single transient registration failure ("Invalid
        // token") was enough to hand the user firekirin_user2 instead of the standard
        // {app_username}{suffix} username, breaking the "every approved account uses the
        // standard format" guarantee for a purely transient blip. A game with automation
        // configured should either succeed with the standard username or go to pending review
        // for a retry/manual look — never silently substitute a differently-named real account.
        // The pool stays exactly as before for a genuinely "— Manual only —" game (no provider
        // assigned at all), where it's the only way to grant instant access at all.
        $hasAssignedProvider = GameProviderAssignment::where('game_id', $game->id)->exists();

        if ($registrationConfirmed) {
            $account = GameAccount::create([
                'game_id' => $game->id,
                'username' => $apiUsername,
                'provider_account_id' => $providerAccountId,
                'password_hash' => $freshPassword,
                'web_login_url' => $webLoginUrl ?: $game->web_url,
                'status' => 'assigned',
                'assigned_to' => $user->id,
            ]);
        } elseif (!$hasAssignedProvider && $account = GameAccount::where('game_id', $game->id)->where('status', 'available')->first()) {
            $account->status = 'assigned';
            $account->assigned_to = $user->id;
            $account->password_hash = $freshPassword;
            if ($webLoginUrl) {
                $account->web_login_url = $webLoginUrl;
            }
            $account->save();
        } elseif ($hasAssignedProvider) {
            // A Game API provider IS configured for this game, so registration was actually
            // attempted and failed — likely transient (e.g. Fire Kirin's intermittent "Invalid
            // token"), possibly a real config issue. Either way: never fall back to a pool
            // account here (that's exactly the "different username format" bug found live),
            // and never lock the user into a stuck pending request either — nothing is created
            // at all, so a simple retry (the request() early-return above only blocks a SECOND
            // request while one is genuinely still pending) can succeed on its own the moment
            // the underlying issue (IP whitelist, a wrong credential, a momentary provider
            // hiccup) clears, with no admin step required for what's often a transient blip.
            // The attempt itself is still fully logged in game_api_logs either way.
            return response()->json([
                'success' => false,
                'status' => 'failed',
                'message' => 'We could not complete your registration right now. Please try again in a moment.',
            ], 422);
        } else {
            // Nothing worked — no pool account, and neither the new Game API Providers module
            // nor the legacy per-game dispatch confirmed a real registration (most commonly
            // because the game is "— Manual only —" in the admin's Game Assignments tab, i.e.
            // no provider is configured for it at all; the legacy dispatch above still gets a
            // chance to work first in case real credentials for it exist, though).
            //
            // This used to be a hard 503 "try again in a few minutes" — actively misleading
            // for an unconfigured game, since retrying can never succeed. Create a real pending
            // request instead, so it shows up on the admin's Game Access Requests page for
            // manual credential assignment — the whole review/approve UI for this already
            // exists and already works, it just never had anything routing into it before.
            $pendingReq = GameUnlockRequest::updateOrCreate(
                ['user_id' => $user->id, 'game_id' => $game->id],
                [
                    'username' => $gameUsername,
                    'email' => $user->email,
                    'status' => 'pending',
                    'game_password' => null,
                    'game_account_id' => null,
                    'admin_note' => null,
                ]
            );

            $requester = $user->username ?? $user->name ?? 'A user';
            Notification::notifyAdmins(
                'New Game Access Request',
                "{$requester} requested access to {$game->name} — automatic registration wasn't available, needs manual review.",
                'info',
                'game_access'
            );

            return response()->json([
                'success' => false,
                'status' => 'pending',
                'message' => 'Your request has been submitted and is pending admin approval. You will be notified once your account is ready.',
                'request' => $pendingReq,
            ], 200);
        }

        // Automatically approve unlock request and assign credentials instantly
        $unlockReq = GameUnlockRequest::updateOrCreate(
            ['user_id' => $user->id, 'game_id' => $game->id],
            [
                'username' => $account->username,
                'email' => $user->email,
                'game_password' => $freshPassword,
                'web_login_url' => $account->web_login_url ?: $game->web_url,
                'status' => 'approved',
                'game_account_id' => $account->id,
                'approved_at' => now(),
                'admin_note' => null,
            ]
        );

        Notification::notify(
            $user->id,
            'Game Access Granted',
            "Your access to {$game->name} has been generated and approved!",
            'success',
            'game_access'
        );

        return response()->json([
            'success' => true,
            'status' => 'approved',
            'username' => $unlockReq->username,
            'password' => $freshPassword,
            'game_password' => $freshPassword,
            'message' => 'Access granted! Your game credentials are ready.',
            'request' => $unlockReq,
        ], 201);
    }

    /**
     * Retrieve game access status and credentials for current user.
     */
    public function checkAccess(Request $request, $gameId = null)
    {
        $targetGameId = $gameId ?? $request->input('game_id');
        if (!$targetGameId) {
            return response()->json(['success' => false, 'message' => 'Game ID required.'], 422);
        }

        $user = $request->user();
        $existingReq = GameUnlockRequest::where('user_id', $user->id)
            ->where('game_id', $targetGameId)
            ->first();

        if ($existingReq && $existingReq->status === 'approved') {
            return response()->json([
                'success' => true,
                'approved' => true,
                'status' => 'approved',
                'username' => $existingReq->username,
                'password' => $existingReq->game_password,
                'game_password' => $existingReq->game_password,
                'web_login_url' => $existingReq->web_login_url,
                'request' => $existingReq,
            ], 200);
        }

        return response()->json([
            'success' => true,
            'approved' => false,
            'status' => $existingReq?->status ?? 'locked',
            'request' => $existingReq,
        ], 200);
    }

    /**
     * Authenticate game credentials & retrieve web login redirect URL.
     */
    public function login(Request $request, $gameId = null)
    {
        $targetGameId = $gameId ?? $request->input('game_id');
        if (!$targetGameId) {
            return response()->json([
                'success' => false,
                'message' => 'Game ID is required.',
            ], 422);
        }

        $user = $request->user();
        $game = Game::findOrFail($targetGameId);

        $existingReq = GameUnlockRequest::where('user_id', $user->id)
            ->where('game_id', $game->id)
            ->first();

        $account = GameAccount::where('game_id', $game->id)
            ->where('assigned_to', $user->id)
            ->first();

        $username = $request->input('username') ?? $existingReq?->username ?? $account?->username;
        $password = $request->input('password') ?? $request->input('game_password') ?? $existingReq?->game_password ?? $account?->password_hash;

        $redirectUrl = $existingReq?->web_login_url
            ?: $account?->web_login_url
            ?: $game->web_url
            ?: $game->download_url;

        // Orion Stars dynamic login link retrieval
        $gName = strtolower(trim($game->name));
        $provider = strtolower($game->api_provider ?? '');
        if (empty($provider) && str_contains($gName, 'orion')) {
            $provider = 'orion_stars';
        }

        if ($provider === 'orion_stars' && $username && $password) {
            try {
                $info = OrionStarsApiService::queryInfo($username, $password);
                if (!empty($info['webLoginUrl'])) {
                    $redirectUrl = $info['webLoginUrl'];
                }
            } catch (Exception $e) {
                // Fallback to stored web login url
            }
        }

        if (empty($redirectUrl)) {
            return response()->json([
                'success' => false,
                'message' => 'No play online URL available for this game.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'redirect_url' => $redirectUrl,
            'url' => $redirectUrl,
            'username' => $username,
            'message' => 'Login successful.',
        ], 200);
    }

    /**
     * Password Change Request (standard request -> admin review -> approve flow):
     * Submits a PENDING PasswordRequest for admin review — never touches the account's actual
     * password itself. Both real frontend callers (PasswordChangeModal, UserPasswordRequests)
     * already tell the user "an admin will review and update it" and track pending/approved/
     * rejected counts, so this used to be a real bug: the account's password_hash and the
     * GameUnlockRequest's game_password were overwritten INSTANTLY and unconditionally here,
     * with status forced straight to 'approved' — no admin ever actually reviewed anything, and
     * the provider-side password-change API call this used to attempt was wrapped in a bare
     * try/catch that silently swallowed failures, so the locally-shown password could get
     * updated even when the real game account's password never actually changed. The account's
     * displayed username/password now only ever change via
     * AdminGameAccessApiController::reviewPasswordRequest() approving this request — so the
     * panel keeps showing the last CONFIRMED-working password the whole time it's pending.
     */
    public function requestPasswordReset(Request $request, $gameId = null)
    {
        $targetGameId = $gameId ?? $request->input('game_id');
        $validated = $request->validate([
            'game_account_id' => 'nullable|exists:game_accounts,id',
            'requested_password' => 'required|string|min:6|max:255',
        ]);

        $user = $request->user();
        $account = null;

        if (!empty($validated['game_account_id'])) {
            $account = GameAccount::with('game')->find($validated['game_account_id']);
        } elseif ($targetGameId) {
            $account = GameAccount::with('game')
                ->where('game_id', $targetGameId)
                ->where('assigned_to', $user->id)
                ->first();
        }

        if (!$account && $targetGameId) {
            $unlockReq = GameUnlockRequest::where('user_id', $user->id)
                ->where('game_id', $targetGameId)
                ->first();
            if ($unlockReq && $unlockReq->game_account_id) {
                $account = GameAccount::with('game')->find($unlockReq->game_account_id);
            }
        }

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'No game account found to request a password change for.',
            ], 404);
        }
        // Never let a user submit a password change request against an account that isn't
        // actually assigned to them — game_account_id above is only checked for existence, not
        // ownership, until this point.
        if ((int) $account->assigned_to !== (int) $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'This game account does not belong to you.',
            ], 403);
        }

        $alreadyPending = PasswordRequest::where('user_id', $user->id)
            ->where('game_account_id', $account->id)
            ->where('status', 'pending')
            ->exists();
        if ($alreadyPending) {
            return response()->json([
                'success' => false,
                'message' => 'You already have a pending password change request for this account. Please wait for admin review.',
            ], 422);
        }

        $passReq = PasswordRequest::create([
            'user_id' => $user->id,
            'game_account_id' => $account->id,
            'requested_password' => $validated['requested_password'],
            'status' => 'pending',
        ]);

        $submitter = $user->username ?? $user->name ?? 'A user';
        Notification::notifyAdmins(
            'New Password Change Request',
            "{$submitter} requested a password change for " . ($account->game?->name ?? 'a game') . '.',
            'info',
            'password_request'
        );

        return response()->json([
            'success' => true,
            'message' => 'Password change request submitted. An admin will review and update it shortly.',
            'request' => $passReq,
        ], 201);
    }

    /**
     * The current user's own password_requests history — no such endpoint existed before
     * (UserPasswordRequests.tsx's history table was still wired to the dead Supabase stub, so
     * it always showed empty). Only exposes this user's own rows.
     */
    public function passwordRequestHistory(Request $request)
    {
        $perPage = min(50, max(1, $request->integer('per_page', 10)));

        $requests = PasswordRequest::with('gameAccount.game')
            ->where('user_id', $request->user()->id)
            ->latest()
            ->paginate($perPage);

        return response()->json($requests);
    }
}
