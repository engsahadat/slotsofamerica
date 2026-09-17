<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiProvider;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Models\Notification;
use App\Models\Transaction;
use App\Services\GameApiProvider\Protocols\ProtocolResolver;
use Throwable;

/**
 * Staff-triggered provisioning actions — ports provider-create-account,
 * provider-sync-account, and provider-process-transaction from the
 * reference Supabase Edge Functions. Every failure path returns
 * `fallback:true` so callers know manual approval is still available;
 * this never throws for "provider unreachable"-class failures.
 *
 * Talks to providers only through ProtocolResolver — works the same for
 * "agent_login" providers (login is an internal detail of that protocol)
 * and "external_signed" providers (no login step at all).
 */
class Provisioner
{
    public function __construct(
        private ProviderPasswordResolver $passwords,
        private ProviderHttpClient $http,
        private ApiLogger $logger,
        private ProtocolResolver $protocols,
    ) {
    }

    /**
     * Register a player account on whichever provider is assigned to this
     * game via the Game API Providers module, using an already-decided
     * username/password. Used by the instant self-service "Request Access"
     * flow (UserGameApiController::requestUnlock) — checked FIRST, before
     * falling back to the legacy per-game hardcoded provider dispatch
     * (Orion Stars / River Pay / Fast API / Game Agent), so games newly
     * assigned to a Game API provider register on the real upstream site
     * without touching the legacy path at all.
     *
     * Every failure returns fallback:true so the caller can safely drop
     * through to its own fallback logic — this never throws.
     */
    public function registerOnAssignedProvider(int $gameId, string $username, string $password): array
    {
        $assignment = GameProviderAssignment::where('game_id', $gameId)->first();
        if (!$assignment) {
            return ['success' => false, 'fallback' => true, 'message' => 'No Game API provider assigned to this game.'];
        }

        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return ['success' => false, 'fallback' => true, 'message' => 'Assigned provider is inactive.'];
        }
        if (!$provider->automate_create_account) {
            return ['success' => false, 'fallback' => true, 'message' => 'Auto-create accounts is disabled for this provider.'];
        }

        $agentSecret = $this->passwords->resolve($provider);
        if (!$agentSecret) {
            return ['success' => false, 'fallback' => true, 'message' => 'Agent password not set for this provider.'];
        }

        $create = $this->protocols->resolve($provider)->createPlayer($provider, $agentSecret, [
            'username' => $username, 'nickname' => $username, 'password' => $password, 'money' => 0,
        ]);
        $this->logResult($provider, 'create_player', $create, ['username' => $username, 'nickname' => $username]);
        if (!$create['success']) {
            $createMessage = !empty($create['error']) ? ErrorClassifier::friendly($create['error']) : 'Account creation failed.';

            return ['success' => false, 'fallback' => true, 'message' => $createMessage];
        }

        return [
            'success' => true, 'fallback' => false, 'username' => $username,
            'provider_account_id' => $this->extractProviderAccountId($create),
            'message' => 'Registered on provider.',
        ];
    }

    /**
     * Best-effort extraction of whatever unique account reference a provider's createPlayer
     * response included (External Signed's data.user_id, FastAPI's data.full_account, River
     * Pay's data.code) — captured for reference only, never used as the login username; the
     * caller already committed to $username before this call was ever made.
     */
    private function extractProviderAccountId(array $createResult): ?string
    {
        // Note: raw.code at the top level is the response STATUS code (0/200 = success),
        // not an account reference — only look inside raw.data for an actual identifier.
        $data = $createResult['raw']['data'] ?? null;
        if (!is_array($data)) {
            return null;
        }

        $id = $data['user_id'] ?? $data['full_account'] ?? $data['code'] ?? $data['account_name'] ?? null;

        return $id !== null && $id !== '' ? (string) $id : null;
    }

    public function createAccount(int $requestId, int $adminUserId): array
    {
        $req = GameUnlockRequest::find($requestId);
        if (!$req) {
            return ['success' => false, 'message' => 'Request not found.'];
        }

        $username = trim((string) $req->username);
        if ($username === '' || strlen($username) < 3 || str_starts_with(strtolower($username), 'unknown')) {
            return [
                'success' => false, 'fallback' => true,
                'message' => "Cannot auto-create: the request has no valid base username (got '{$username}'). Ask the user to set their profile username, then re-submit. Manual approval is still available.",
            ];
        }

        $assignment = GameProviderAssignment::where('game_id', $req->game_id)->first();
        if (!$assignment) {
            return ['success' => false, 'fallback' => true, 'message' => 'No provider assigned — use manual approval.'];
        }

        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return ['success' => false, 'fallback' => true, 'message' => 'Provider inactive — use manual approval.'];
        }

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            return ['success' => false, 'fallback' => true, 'message' => 'Agent password not set — use manual approval or set it in the admin panel.'];
        }

        $protocol = $this->protocols->resolve($provider);
        $newPwd = $this->http->randomPassword(10);

        $create = $protocol->createPlayer($provider, $secret, [
            'username' => $username, 'nickname' => $username, 'password' => $newPwd, 'money' => 0,
        ]);
        $this->logResult($provider, 'create_player', $create, ['username' => $username, 'nickname' => $username], $req->id, $req->user_id);
        if (!$create['success']) {
            $createMessage = !empty($create['error']) ? ErrorClassifier::friendly($create['error']) : 'Account creation failed.';

            return ['success' => false, 'fallback' => true, 'message' => $createMessage];
        }

        $find = $protocol->findPlayerIdByUsername($provider, $secret, $username);
        $this->logResult($provider, 'player_list', $find, ['username' => $username], $req->id, $req->user_id);
        $playerId = $find['data']['id'] ?? null;

        try {
            $req->status = 'approved';
            $req->approved_at = now();
            $req->approved_by = $adminUserId;
            $req->game_password = $newPwd;
            $req->admin_note = "Auto-created via {$provider->name}" . ($playerId ? " (player_id={$playerId})" : '');
            $req->save();
        } catch (Throwable $e) {
            report($e);
            return [
                'success' => false,
                'message' => "Provider account created but saving the approval failed: {$e->getMessage()}. Approve manually with username '{$username}' and password '{$newPwd}'.",
                'password' => $newPwd,
            ];
        }

        Notification::notify(
            $req->user_id,
            'Game Account Ready',
            'Your game account has been created automatically. Check your game access page for login details.',
            'success',
            'game_access'
        );

        return ['success' => true, 'message' => 'Account created.', 'username' => $username, 'password' => $newPwd];
    }

    public function syncAccount(int $providerId, string $username): array
    {
        $provider = GameApiProvider::find($providerId);
        if (!$provider) {
            return ['success' => false, 'message' => 'Provider not found.'];
        }
        if (!$provider->is_active) {
            return ['success' => false, 'message' => 'Provider inactive.'];
        }

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            return ['success' => false, 'message' => 'Agent password not set for this provider.'];
        }

        $protocol = $this->protocols->resolve($provider);

        $find = $protocol->findPlayerIdByUsername($provider, $secret, $username);
        if (!$find['success'] || empty($find['data']['id'])) {
            return ['success' => false, 'message' => $find['error'] ?? 'Player not found on provider.'];
        }
        $playerId = $find['data']['id'];

        $score = $protocol->getScore($provider, $secret, $playerId);
        $this->logResult($provider, 'get_score', $score, ['id' => $playerId]);

        return [
            'success' => $score['success'],
            'balance' => $score['data']['balance'] ?? null,
            'raw' => $score['raw'],
            'message' => $score['success'] ? 'Sync complete.' : ($score['error'] ?? 'Balance check failed.'),
        ];
    }

    /**
     * Mirrors an already-approved transaction onto the assigned provider's own panel
     * (recharge/withdraw the player's balance there) — called from
     * AdminTransactionApiController::review() right after a deposit/withdraw/redeem/transfer
     * is approved, only when the assigned provider has automate_deposit/automate_withdraw
     * turned on. Our own DB balance change always stays on the existing, admin-approval-gated
     * path in review() regardless of what happens here — this is a best-effort side effect,
     * never the source of truth for the user's balance, and never throws.
     */
    public function processTransaction(int $transactionId): array
    {
        $txn = Transaction::find($transactionId);
        if (!$txn) {
            return ['success' => false, 'message' => 'Transaction not found.'];
        }
        if ($txn->status !== 'approved') {
            return ['success' => false, 'message' => 'Transaction is not approved — nothing to sync.'];
        }

        $req = GameUnlockRequest::where('user_id', $txn->user_id)
            ->where('game_id', $txn->game_id)
            ->where('status', 'approved')
            ->first();
        if (!$req || empty($req->username)) {
            return ['success' => false, 'message' => 'User has no approved game account.'];
        }

        $assignment = GameProviderAssignment::where('game_id', $txn->game_id)->first();
        if (!$assignment) {
            return ['success' => false, 'fallback' => true, 'message' => 'No provider assigned.'];
        }
        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return ['success' => false, 'fallback' => true, 'message' => 'Provider inactive.'];
        }

        // Direction is relative to the PLAYER'S IN-GAME BALANCE on the provider's own system,
        // not to our site wallet:
        //  - 'deposit'  (external money -> site wallet, rarely tied to a game_id at all) and
        //    'transfer' (site wallet -> a specific game account, per UserTransferApiController)
        //    both ADD to the player's in-game balance -> recharge.
        //  - 'redeem'   ("cash out in-game earnings" -> site wallet, per UserRedeemApiController)
        //    and 'withdraw' (site wallet -> bank/CashApp, never tied to a game_id in practice)
        //    both REMOVE from the player's in-game balance -> withdraw.
        // Getting this backwards would recharge a player's game balance when they cash OUT
        // (redeem) and drain it when money moves IN (transfer) — a real double-pay / lost-funds
        // risk, so this mapping must never be "simplified" to isDeposit===type==='deposit'.
        $addsToGameBalance = in_array($txn->type, ['deposit', 'transfer'], true);
        $removesFromGameBalance = in_array($txn->type, ['redeem', 'withdraw'], true);
        if (!$addsToGameBalance && !$removesFromGameBalance) {
            return ['success' => false, 'message' => 'Unsupported transaction type.'];
        }
        if ($addsToGameBalance && !$provider->automate_deposit) {
            return ['success' => false, 'fallback' => true, 'message' => 'Deposit automation disabled.'];
        }
        if ($removesFromGameBalance && !$provider->automate_withdraw) {
            return ['success' => false, 'fallback' => true, 'message' => 'Withdraw automation disabled.'];
        }

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            return ['success' => false, 'fallback' => true, 'message' => 'Agent password not set.'];
        }

        $protocol = $this->protocols->resolve($provider);

        $find = $protocol->findPlayerIdByUsername($provider, $secret, $req->username);
        if (!$find['success'] || empty($find['data']['id'])) {
            return ['success' => false, 'fallback' => true, 'message' => 'Player not found on provider.'];
        }
        $playerId = $find['data']['id'];

        // Alphanumeric only, no separators — several real providers (e.g. gameroom777) reject
        // any remark/order-reference containing punctuation like ":" with a hard validation
        // error ("Remarks can only be letters and numbers"), discovered live when a colon here
        // silently broke every instant recharge for that provider.
        $remark = "{$txn->type}{$transactionId}";
        $action = $addsToGameBalance ? 'recharge' : 'withdraw';
        $args = ['id' => $playerId, 'balance' => (float) $txn->amount, 'remark' => $remark];
        $result = $addsToGameBalance
            ? $protocol->recharge($provider, $secret, $args)
            : $protocol->withdraw($provider, $secret, $args);

        $this->logResult($provider, $action, $result, $args, null, $txn->user_id, $txn->id);

        if (!$result['success']) {
            return ['success' => false, 'fallback' => true, 'message' => $result['error'] ?? 'Provider request failed.'];
        }

        return ['success' => true, 'message' => ucfirst($action) . ' succeeded.'];
    }

    /**
     * Cheap pre-check for UserTransferApiController::transfer() to decide, before ever
     * reserving the user's balance, whether this game supports instant recharge at all —
     * mirrors AdminTransactionApiController::providerAutomationApplies() for the deposit
     * (wallet -> game) direction only.
     */
    public function depositAutomationEnabled(int $gameId): bool
    {
        $assignment = GameProviderAssignment::where('game_id', $gameId)->first();
        if (!$assignment) {
            return false;
        }
        $provider = GameApiProvider::find($assignment->provider_id);

        return (bool) ($provider && $provider->is_active && $provider->automate_deposit);
    }

    /**
     * Instant, same-request recharge for UserTransferApiController::transfer(). Unlike
     * processTransaction() (a best-effort mirror of an ALREADY-approved admin transaction,
     * never the source of truth for balance), this IS the confirmation the caller is waiting
     * on: the user's wallet balance has already been reserved (deducted) before this runs, and
     * the caller decides whether to finalize that reservation or refund it based on the result.
     * Every failure — including "not configured for this game" — returns fallback:true so the
     * caller always refunds and never leaves a reservation stuck in limbo.
     */
    public function instantRecharge(int $userId, int $gameId, float $amount, int $transactionId): array
    {
        $req = GameUnlockRequest::where('user_id', $userId)->where('game_id', $gameId)->where('status', 'approved')->first();
        if (!$req || empty($req->username)) {
            return ['success' => false, 'fallback' => true, 'message' => 'No approved game account found for this game.'];
        }

        $assignment = GameProviderAssignment::where('game_id', $gameId)->first();
        if (!$assignment) {
            return ['success' => false, 'fallback' => true, 'message' => 'No Game API provider assigned to this game.'];
        }
        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return ['success' => false, 'fallback' => true, 'message' => 'Assigned provider is inactive.'];
        }
        if (!$provider->automate_deposit) {
            return ['success' => false, 'fallback' => true, 'message' => 'Instant recharge is not enabled for this game.'];
        }

        $providerName = $provider->display_name ?: $provider->name;

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            return ['success' => false, 'fallback' => true, 'message' => 'Agent password not set for this provider.', 'provider_name' => $providerName];
        }

        $protocol = $this->protocols->resolve($provider);

        $find = $protocol->findPlayerIdByUsername($provider, $secret, $req->username);
        $this->logResult($provider, 'player_list', $find, ['username' => $req->username], null, $userId, $transactionId);
        if (!$find['success'] || empty($find['data']['id'])) {
            $findMessage = !empty($find['error']) ? ErrorClassifier::friendly($find['error']) : 'Player not found on provider.';

            return ['success' => false, 'fallback' => true, 'message' => $findMessage, 'provider_name' => $providerName];
        }
        $playerId = $find['data']['id'];

        // Alphanumeric only, no separators — see the comment on the matching remark in
        // processTransaction() above; gameroom777 hard-rejects a ":" in this field.
        $remark = "recharge{$transactionId}";
        $args = ['id' => $playerId, 'balance' => $amount, 'remark' => $remark];
        $result = $protocol->recharge($provider, $secret, $args);
        $this->logResult($provider, 'recharge', $result, $args, null, $userId, $transactionId);

        if (!$result['success']) {
            $rechargeMessage = !empty($result['error']) ? ErrorClassifier::friendly($result['error']) : 'Provider recharge failed.';

            return ['success' => false, 'fallback' => true, 'message' => $rechargeMessage, 'provider_name' => $providerName];
        }

        return ['success' => true, 'fallback' => false, 'message' => 'Recharge succeeded.', 'provider_reference' => $remark, 'provider_name' => $providerName];
    }

    /**
     * Cheap pre-check for UserRedeemApiController::submitCashout() — mirrors
     * depositAutomationEnabled() for the withdraw (game -> wallet) direction.
     */
    public function withdrawAutomationEnabled(int $gameId): bool
    {
        $assignment = GameProviderAssignment::where('game_id', $gameId)->first();
        if (!$assignment) {
            return false;
        }
        $provider = GameApiProvider::find($assignment->provider_id);

        return (bool) ($provider && $provider->is_active && $provider->automate_withdraw);
    }

    /**
     * Instant, same-request redeem ("cash out") for UserRedeemApiController::submitCashout().
     * The reverse of instantRecharge(): here the wallet has NOT been touched yet when this
     * runs — redeem only ever ADDS balance, and only the caller, only after this returns
     * success, ever does that. A failure here means nothing happened to either balance at all;
     * there is nothing to refund. Every failure — including "not configured for this game" —
     * returns fallback:true so the caller knows not to credit anything.
     */
    public function instantRedeem(int $userId, int $gameId, float $amount, int $transactionId): array
    {
        $req = GameUnlockRequest::where('user_id', $userId)->where('game_id', $gameId)->where('status', 'approved')->first();
        if (!$req || empty($req->username)) {
            return ['success' => false, 'fallback' => true, 'message' => 'No approved game account found for this game.'];
        }

        $assignment = GameProviderAssignment::where('game_id', $gameId)->first();
        if (!$assignment) {
            return ['success' => false, 'fallback' => true, 'message' => 'No Game API provider assigned to this game.'];
        }
        $provider = GameApiProvider::find($assignment->provider_id);
        if (!$provider || !$provider->is_active) {
            return ['success' => false, 'fallback' => true, 'message' => 'Assigned provider is inactive.'];
        }
        if (!$provider->automate_withdraw) {
            return ['success' => false, 'fallback' => true, 'message' => 'Instant redeem is not enabled for this game.'];
        }

        $providerName = $provider->display_name ?: $provider->name;

        $secret = $this->passwords->resolve($provider);
        if (!$secret) {
            return ['success' => false, 'fallback' => true, 'message' => 'Agent password not set for this provider.', 'provider_name' => $providerName];
        }

        $protocol = $this->protocols->resolve($provider);

        $find = $protocol->findPlayerIdByUsername($provider, $secret, $req->username);
        $this->logResult($provider, 'player_list', $find, ['username' => $req->username], null, $userId, $transactionId);
        if (!$find['success'] || empty($find['data']['id'])) {
            $findMessage = !empty($find['error']) ? ErrorClassifier::friendly($find['error']) : 'Player not found on provider.';

            return ['success' => false, 'fallback' => true, 'message' => $findMessage, 'provider_name' => $providerName];
        }
        $playerId = $find['data']['id'];

        // Alphanumeric only, no separators — same gameroom777-style rejection as recharge above.
        $remark = "redeem{$transactionId}";
        $args = ['id' => $playerId, 'balance' => $amount, 'remark' => $remark];
        $result = $protocol->withdraw($provider, $secret, $args);
        $this->logResult($provider, 'withdraw', $result, $args, null, $userId, $transactionId);

        if (!$result['success']) {
            $withdrawMessage = !empty($result['error']) ? ErrorClassifier::friendly($result['error']) : 'Provider redeem failed.';

            return ['success' => false, 'fallback' => true, 'message' => $withdrawMessage, 'provider_name' => $providerName];
        }

        return ['success' => true, 'fallback' => false, 'message' => 'Redeem succeeded.', 'provider_reference' => $remark, 'provider_name' => $providerName];
    }

    private function logResult(
        GameApiProvider $provider,
        string $action,
        array $result,
        array $requestPayload,
        ?int $relatedRequestId = null,
        ?int $relatedUserId = null,
        ?int $relatedTransactionId = null,
    ): void {
        // Every call site's $requestPayload already carries whatever identifies this specific
        // call on the provider's side — the recharge/withdraw remark (our own order reference),
        // otherwise the player id/username being operated on — so it's derived here rather than
        // threading a redundant extra argument through every one of the 9 call sites above.
        $providerReference = $requestPayload['remark'] ?? $requestPayload['id'] ?? $requestPayload['username'] ?? null;

        $this->logger->log([
            'provider_id' => $provider->id,
            'provider_name' => $provider->name,
            'action' => $action,
            'provider_reference' => $providerReference !== null ? (string) $providerReference : null,
            'request_payload' => $requestPayload,
            'response_payload' => $result['raw'] ?? null,
            'http_status' => $result['http_status'] ?? null,
            'success' => $result['success'] ?? false,
            'error_message' => $result['error'] ?? null,
            'duration_ms' => $result['duration_ms'] ?? null,
            'related_request_id' => $relatedRequestId,
            'related_user_id' => $relatedUserId,
            'related_transaction_id' => $relatedTransactionId,
        ]);
    }
}
