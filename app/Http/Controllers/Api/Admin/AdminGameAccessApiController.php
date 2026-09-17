<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\GameAccount;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Notification;
use App\Models\PasswordRequest;
use App\Services\EmailTemplateMailer;
use App\Services\FastApiService;
use App\Services\GameAgentApiService;
use App\Services\GameApiProvider\Provisioner;
use App\Services\GameUsernameGenerator;
use App\Services\OrionStarsApiService;
use App\Services\RiverPayApiService;
use Exception;
use Illuminate\Http\Request;

class AdminGameAccessApiController extends Controller
{
    public function index()
    {
        $unlockRequests = GameUnlockRequest::with(['user', 'game'])->latest()->get();
        $passwordRequests = PasswordRequest::with(['user', 'gameAccount.game'])->latest()->get();

        return response()->json([
            'unlock_requests' => $unlockRequests,
            'password_requests' => $passwordRequests,
        ]);
    }

    public function reviewUnlock(Request $request, $id)
    {
        // Mirrors the frontend's validateGameUsername/validateGamePassword — kept here too
        // so a direct API call (or a future UI) can't slip an unusable game login through.
        // Game usernames become real credentials on the external provider, so spaces/stray
        // symbols there would silently break login rather than fail loudly.
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'admin_note' => 'nullable|string',
            'game_username' => ['nullable', 'string', 'min:3', 'max:100', 'regex:/^[a-zA-Z0-9_.-]+$/'],
            'game_password' => 'nullable|string|min:4|max:255',
        ], [
            'game_username.min' => 'Game username must be at least 3 characters.',
            'game_username.regex' => 'Game username can only contain letters, numbers, underscores, hyphens and dots (no spaces).',
            'game_password.min' => 'Game password must be at least 4 characters.',
        ]);

        $req = GameUnlockRequest::findOrFail($id);
        $req->status = $validated['status'];
        $req->admin_note = $validated['admin_note'] ?? null;
        $req->approved_by = $request->user()->id;
        $req->approved_at = now();

        if ($validated['status'] === 'approved') {
            $game = $req->game;
            // $req->username should already carry the properly-generated (site username +
            // game suffix) value from the original request — this fallback only fires for
            // an edge case where that's somehow empty, and now uses the same generator
            // instead of a disconnected "player123"-style random guess.
            $username = !empty($validated['game_username'])
                ? $validated['game_username']
                : ($req->username ?: ($game ? GameUsernameGenerator::generate($req->user?->username ?? $req->user?->name ?? 'player', $game) : 'player' . rand(100, 999)));

            $password = !empty($validated['game_password'])
                ? $validated['game_password']
                : ($req->game_password ?: GameAccount::generateRandomPassword());

            $webLoginUrl = null;
            $providerAccountId = null;
            $noOverride = empty($validated['game_username']) && empty($validated['game_password']);

            // If the admin left both fields blank, first try to pull a ready-made account from
            // this game's admin-managed pool (Admin -> Games -> Manage Accounts) — that's what
            // the "auto-assign" UI copy promises, and it avoids ever touching the external
            // Provider API (which may not be configured) when a pool account already exists.
            $poolAccount = $noOverride
                ? GameAccount::where('game_id', $req->game_id)->where('status', 'available')->first()
                : null;

            if ($poolAccount) {
                $username = $poolAccount->username;
                $webLoginUrl = $poolAccount->web_login_url;
            } else {
                // Determine provider (orion_stars, river_pay, fast_api, game_agent)
                $provider = strtolower($game?->api_provider ?? '');
                if (empty($provider) && $game) {
                    $gName = strtolower($game->name);
                    if (str_contains($gName, 'orion')) $provider = 'orion_stars';
                    elseif (str_contains($gName, 'river')) $provider = 'river_pay';
                    elseif (str_contains($gName, 'fast')) $provider = 'fast_api';
                    else $provider = 'game_agent';
                }

                // Call Provider API to register user. $username stays as decided above for
                // every provider except River Pay (see the note on the equivalent branch in
                // UserGameApiController::requestUnlock — River Pay has no username input at
                // all, its response "code" is the account's only identifier). Elsewhere, the
                // provider's own echoed-back reference is captured as $providerAccountId for
                // record-keeping only, never adopted as the login username.
                try {
                    if ($provider === 'orion_stars' || str_contains($provider, 'orion')) {
                        OrionStarsApiService::registerUser($username, $password);
                        try {
                            $info = OrionStarsApiService::queryInfo($username, $password);
                            if (!empty($info['webLoginUrl'])) $webLoginUrl = $info['webLoginUrl'];
                        } catch (Exception $e) {}
                    } elseif ($provider === 'river_pay' || str_contains($provider, 'river')) {
                        $res = RiverPayApiService::createAccount('0.00');
                        if (!empty($res['code'])) $username = $res['code'];
                    } elseif ($provider === 'fast_api' || str_contains($provider, 'fast')) {
                        $res = FastApiService::createUser($username, $password);
                        $providerAccountId = $res['full_account'] ?? null;
                    } else {
                        $res = GameAgentApiService::addUser($username, $password);
                        $providerAccountId = $res['user_id'] ?? null;
                    }
                } catch (Exception $e) {
                    if ($noOverride) {
                        // Lead with what the admin should actually do — a raw cURL/libcurl
                        // error dump doesn't tell them that either fixing the pool or filling
                        // in the override fields would unblock this approval right now.
                        return response()->json([
                            'message' => "\"{$game?->name}\" has no available account in its pool and its automatic provider connection isn't working right now. Either add an account for it in Admin \u{2192} Games \u{2192} Manage Accounts, or fill in the Game Username/Password fields above and approve manually.",
                            'technical_detail' => 'Provider API Error: ' . $e->getMessage(),
                        ], 422);
                    }
                }
            }

            // Create or update GameAccount record. provider_account_id is only included
            // when this approval actually got one back — omitted (not nulled) otherwise, so
            // re-approving a pool account (which never touches a provider API) doesn't wipe
            // out a value that was already there.
            $account = GameAccount::updateOrCreate(
                ['game_id' => $req->game_id, 'username' => $username],
                array_filter([
                    'provider_account_id' => $providerAccountId,
                    'password_hash' => $password,
                    'web_login_url' => $webLoginUrl,
                    'status' => 'assigned',
                    'assigned_to' => $req->user_id,
                ], fn ($v, $k) => $k !== 'provider_account_id' || $v !== null, ARRAY_FILTER_USE_BOTH)
            );

            $req->game_account_id = $account->id;
            $req->username = $username;
            $req->game_password = $password;
            $req->web_login_url = $webLoginUrl;
        }

        $req->save();
        AuditLog::record($request, $validated['status'] . '_game_access', 'GameUnlockRequest', $req->id, [
            'game_id' => $req->game_id,
            'admin_note' => $validated['admin_note'] ?? null,
        ]);

        $gameName = $req->game?->name ?? 'the requested game';
        Notification::notify(
            $req->user_id,
            $validated['status'] === 'approved' ? 'Game Access Approved' : 'Game Access Rejected',
            $validated['status'] === 'approved'
                ? "Your access to {$gameName} has been approved! You can now play."
                : "Your access request for {$gameName} was rejected." . (!empty($validated['admin_note']) ? " Reason: {$validated['admin_note']}" : ''),
            $validated['status'] === 'approved' ? 'success' : 'warning',
            'game_access'
        );

        return response()->json([
            'message' => "Game unlock request {$validated['status']}.",
            'request' => $req,
        ]);
    }

    public function updateUnlock(Request $request, $id)
    {
        $validated = $request->validate([
            'username' => 'required|string|max:100',
            'game_password' => 'nullable|string|max:255',
            'admin_note' => 'nullable|string',
        ]);

        $req = GameUnlockRequest::findOrFail($id);
        $req->username = $validated['username'];
        if (isset($validated['game_password'])) {
            $req->game_password = $validated['game_password'];
        }
        $req->admin_note = $validated['admin_note'] ?? null;
        $req->save();

        if ($req->game_account_id) {
            $account = GameAccount::find($req->game_account_id);
            if ($account) {
                $account->username = $validated['username'];
                if (isset($validated['game_password'])) {
                    $account->password_hash = $validated['game_password'];
                }
                $account->save();
            }
        }

        return response()->json([
            'message' => 'Game unlock request updated successfully.',
            'request' => $req,
        ]);
    }

    public function destroyUnlock($id)
    {
        $req = GameUnlockRequest::findOrFail($id);
        $req->delete();

        return response()->json(['message' => 'Game unlock request deleted successfully.']);
    }

    /**
     * Opt-in "Auto-create" button on a pending unlock request row — only
     * shown when the request's game has an active Game API provider
     * assignment. Purely additive: does not change the normal
     * reviewUnlock() manual approve/reject path above.
     */
    public function autoCreate(Request $request, $id)
    {
        $req = GameUnlockRequest::findOrFail($id);
        $assignment = GameProviderAssignment::where('game_id', $req->game_id)->first();
        if (!$assignment) {
            return response()->json(['success' => false, 'message' => 'No Game API provider assigned to this game.']);
        }

        $result = app(Provisioner::class)->createAccount((int) $id, $request->user()->id);
        AuditLog::record($request, 'manual_override_game_api_provider', 'GameUnlockRequest', $id, [
            'action' => 'auto_create', 'success' => $result['success'] ?? false,
        ]);

        return response()->json($result);
    }

    public function reviewPasswordRequest(Request $request, $id)
    {
        $validated = $request->validate([
            'status' => 'required|in:approved,rejected',
            'rejection_reason' => 'nullable|string',
            // Admin can type/override the password when the user's original request has none
            // stored (or wants to change it) — see the "Enter new password" input on the Pending
            // tab. Previously accepted by validation nowhere and silently dropped.
            'new_password' => 'nullable|string|max:255',
        ]);

        $req = PasswordRequest::with(['user', 'gameAccount.game'])->findOrFail($id);
        $req->status = $validated['status'];
        $req->rejection_reason = $validated['rejection_reason'] ?? null;
        if ($validated['status'] === 'approved' && !empty($validated['new_password'])) {
            $req->requested_password = $validated['new_password'];
        }
        $req->save();

        if ($validated['status'] === 'approved' && $req->gameAccount) {
            $req->gameAccount->password_hash = $req->requested_password;
            $req->gameAccount->save();

            // Update matching unlock request
            GameUnlockRequest::where('user_id', $req->user_id)
                ->where('game_id', $req->gameAccount->game_id)
                ->update(['game_password' => $req->requested_password]);
        }

        $gameName = $req->gameAccount?->game?->name ?? 'the game';
        Notification::notify(
            $req->user_id,
            $validated['status'] === 'approved' ? 'Password Change Approved' : 'Password Change Rejected',
            $validated['status'] === 'approved'
                ? "Your password change request for {$gameName} has been approved."
                : "Your password change request for {$gameName} was rejected.",
            $validated['status'] === 'approved' ? 'success' : 'warning',
            'password_request'
        );

        if ($req->user) {
            EmailTemplateMailer::fireTrigger("password_request_{$validated['status']}", $req->user, [
                'game_name' => $gameName,
                'status' => ucfirst($validated['status']),
            ]);
        }

        return response()->json([
            'message' => "Password request {$validated['status']}.",
            'request' => $req,
        ]);
    }

    public function destroyPasswordRequest($id)
    {
        $req = PasswordRequest::findOrFail($id);
        $req->delete();

        return response()->json(['message' => 'Password request deleted successfully.']);
    }
}
