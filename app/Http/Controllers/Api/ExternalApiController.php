<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ExternalApiController extends Controller
{
    /**
     * Validate global parameters: agent_id, timestamp, token
     * Token = MD5(agent_id:timestamp:secret_key).ToUpper
     */
    private function validateGlobalParams(Request $request): ?JsonResponse
    {
        $siteSetting = SiteSetting::first();
        $expectedAgentId = (string) ($siteSetting?->game_agent_id ?: config('services.game_agent.agent_id', '10045'));
        $secretKey = (string) ($siteSetting?->game_agent_secret_key ?: config('services.game_agent.secret_key', 'secret_key_12345'));

        $agentId = (string) $request->input('agent_id');
        $timestamp = (string) $request->input('timestamp');
        $token = (string) $request->input('token');

        if (empty($agentId) || $agentId !== $expectedAgentId) {
            return response()->json([
                'code' => 1,
                'msg' => 'Invalid agent ID',
            ]);
        }

        if (empty($timestamp) || empty($token)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        $expectedToken = strtoupper(md5("{$agentId}:{$timestamp}:{$secretKey}"));

        if (strtoupper($token) !== $expectedToken) {
            return response()->json([
                'code' => 3,
                'msg' => 'Invalid token',
            ]);
        }

        return null;
    }

    /**
     * Helper to find user by user_id or username
     */
    private function findUser(string $identifier): ?User
    {
        return User::where('id', $identifier)
            ->orWhere('username', $identifier)
            ->first();
    }

    /**
     * Helper to get total agent balance
     */
    private function getAgentBalance(): string
    {
        $admin = User::where('role', 'admin')->first();
        return number_format($admin?->balance ?? 50000.00, 2, '.', '');
    }

    /**
     * 2.1.1 Add Player Account
     * Route: /api/external/addUser
     */
    public function addUser(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $account = trim((string) $request->input('account'));
        $loginPwd = (string) $request->input('login_pwd');

        if (empty($account) || empty($loginPwd)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        if (strlen($account) < 3 || strlen($account) > 32 || !preg_match('/^[a-zA-Z0-9_]+$/', $account)) {
            return response()->json([
                'code' => 18,
                'msg' => 'Account name format error,contain letters, numbers, and underscores',
            ]);
        }

        if (strlen($loginPwd) < 6 || strlen($loginPwd) > 32) {
            return response()->json([
                'code' => 23,
                'msg' => 'Password digits 6 to 32 characters',
            ]);
        }

        if (User::where('username', $account)->exists()) {
            return response()->json([
                'code' => 20,
                'msg' => 'Account name already exists',
            ]);
        }

        $user = User::create([
            'name' => $account,
            'username' => $account,
            'email' => strtolower($account) . '@horizon.gg',
            'password' => Hash::make($loginPwd),
            'role' => 'user',
            'balance' => 0.00,
        ]);

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'account_name' => $user->username,
                'user_id' => (string) $user->id,
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.2 Recharge
     * Route: /api/external/recharge
     */
    public function recharge(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $userId = trim((string) $request->input('user_id'));
        $amount = (float) $request->input('amount');
        $orderId = trim((string) $request->input('order_id'));

        if (empty($userId) || empty($orderId)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        if ($amount <= 0) {
            return response()->json([
                'code' => 11,
                'msg' => 'Invalid amount',
            ]);
        }

        $user = $this->findUser($userId);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        if ($user->is_flagged) {
            return response()->json([
                'code' => 9,
                'msg' => 'User account frozen',
            ]);
        }

        $txnId = 'pay:' . $orderId;
        $idempotencyKey = "external_recharge:{$orderId}";

        // Idempotency: an external agent panel may retry the same order_id (network timeout,
        // "did this go through?" resend) — never credit the same order twice.
        $existing = Transaction::where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            return response()->json([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'agent_balance' => $this->getAgentBalance(),
                    'amount' => (string) $existing->amount,
                    'pay_order_id' => $txnId,
                    'transaction_id' => $txnId,
                    'transaction_time' => (string) $existing->created_at->timestamp,
                    'user_balance' => (string) $existing->user?->balance,
                ],
                'count' => 0,
            ]);
        }

        try {
            $user = DB::transaction(function () use ($user, $amount, $orderId, $idempotencyKey) {
                // Locked for the balance read-modify-write, matching every other financial flow.
                $locked = User::where('id', $user->id)->lockForUpdate()->first();
                $balanceBefore = (float) $locked->balance;
                $locked->balance = $balanceBefore + $amount;
                $locked->save();

                Transaction::create([
                    'user_id' => $locked->id,
                    'type' => 'deposit',
                    'amount' => $amount,
                    'status' => 'approved',
                    'provider' => 'External Agent API',
                    'provider_reference' => $orderId,
                    'idempotency_key' => $idempotencyKey,
                    'balance_before' => $balanceBefore,
                    'balance_after' => $locked->balance,
                    'reviewed_at' => now(),
                    'notes' => "External API Recharge Order: {$orderId}",
                ]);

                return $locked;
            });
        } catch (QueryException $e) {
            // A genuinely simultaneous duplicate delivery won this race — treat it the same as
            // the idempotent-replay case above rather than crediting a second time.
            if (str_contains($e->getMessage(), 'idempotency_key')) {
                $existing = Transaction::where('idempotency_key', $idempotencyKey)->first();

                return response()->json([
                    'code' => 0,
                    'msg' => 'Success',
                    'data' => [
                        'agent_balance' => $this->getAgentBalance(),
                        'amount' => (string) ($existing->amount ?? $amount),
                        'pay_order_id' => $txnId,
                        'transaction_id' => $txnId,
                        'transaction_time' => (string) time(),
                        'user_balance' => (string) $existing?->user?->balance,
                    ],
                    'count' => 0,
                ]);
            }
            throw $e;
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'agent_balance' => $this->getAgentBalance(),
                'amount' => (string) $amount,
                'pay_order_id' => $txnId,
                'transaction_id' => $txnId,
                'transaction_time' => (string) time(),
                'user_balance' => (string) $user->balance,
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.3 Withdraw
     * Route: /api/external/withdraw
     */
    public function withdraw(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $userId = trim((string) $request->input('user_id'));
        $amount = (float) $request->input('amount');
        $orderId = trim((string) $request->input('order_id'));

        if (empty($userId) || empty($orderId)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        if ($amount <= 0) {
            return response()->json([
                'code' => 11,
                'msg' => 'Invalid amount',
            ]);
        }

        $user = $this->findUser($userId);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        if ($user->is_flagged) {
            return response()->json([
                'code' => 9,
                'msg' => 'User account frozen',
            ]);
        }

        $txnId = 'wdw:' . $orderId;
        $idempotencyKey = "external_withdraw:{$orderId}";

        // Idempotency: an external agent panel may retry the same order_id — never debit the
        // same order twice.
        $existing = Transaction::where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            return response()->json([
                'code' => 0,
                'msg' => 'Success',
                'data' => [
                    'agent_balance' => $this->getAgentBalance(),
                    'amount' => (string) $existing->amount,
                    'transaction_id' => $txnId,
                    'transaction_time' => (string) $existing->created_at->timestamp,
                    'user_balance' => (string) $existing->user?->balance,
                    'wdw_order_id' => $txnId,
                ],
                'count' => 0,
            ]);
        }

        try {
            $result = DB::transaction(function () use ($user, $amount, $orderId, $idempotencyKey) {
                // Locked for the check-then-decrement below — without this, two concurrent
                // withdraw callbacks could both pass the balance check and jointly overdraw it.
                $locked = User::where('id', $user->id)->lockForUpdate()->first();
                $balanceBefore = (float) $locked->balance;
                if ($balanceBefore < $amount) {
                    return ['ok' => false];
                }

                $locked->balance = $balanceBefore - $amount;
                $locked->save();

                Transaction::create([
                    'user_id' => $locked->id,
                    'type' => 'withdraw',
                    'amount' => $amount,
                    'status' => 'approved',
                    'provider' => 'External Agent API',
                    'provider_reference' => $orderId,
                    'idempotency_key' => $idempotencyKey,
                    'balance_before' => $balanceBefore,
                    'balance_after' => $locked->balance,
                    'reviewed_at' => now(),
                    'notes' => "External API Withdraw Order: {$orderId}",
                ]);

                return ['ok' => true, 'user' => $locked];
            });
        } catch (QueryException $e) {
            if (str_contains($e->getMessage(), 'idempotency_key')) {
                $existing = Transaction::where('idempotency_key', $idempotencyKey)->first();

                return response()->json([
                    'code' => 0,
                    'msg' => 'Success',
                    'data' => [
                        'agent_balance' => $this->getAgentBalance(),
                        'amount' => (string) ($existing->amount ?? $amount),
                        'transaction_id' => $txnId,
                        'transaction_time' => (string) time(),
                        'user_balance' => (string) $existing?->user?->balance,
                        'wdw_order_id' => $txnId,
                    ],
                    'count' => 0,
                ]);
            }
            throw $e;
        }

        if (!$result['ok']) {
            return response()->json([
                'code' => 7,
                'msg' => 'Insufficient user balance',
            ]);
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'agent_balance' => $this->getAgentBalance(),
                'amount' => (string) $amount,
                'transaction_id' => $txnId,
                'transaction_time' => (string) time(),
                'user_balance' => (string) $result['user']->balance,
                'wdw_order_id' => $txnId,
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.4 Get Player Balance
     * Route: /api/external/userBalance
     */
    public function userBalance(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $userId = trim((string) $request->input('user_id'));
        if (empty($userId)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        $user = $this->findUser($userId);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'user_balance' => (string) $user->balance,
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.5 Get Agent Balance
     * Route: /api/external/agentBalance
     */
    public function agentBalance(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'agent_balance' => $this->getAgentBalance(),
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.6 Login name to get player ID
     * Route: /api/external/getUserID
     */
    public function getUserID(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $accountName = trim((string) $request->input('account_name'));
        if (empty($accountName)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        $user = $this->findUser($accountName);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => [
                'user_id' => (string) $user->id,
            ],
            'count' => 0,
        ]);
    }

    /**
     * 2.1.7 Getting low-balance users
     * Route: /api/external/getLowDepositUsers
     * Route: /api/external/external/getLowDepositUsers
     */
    public function getLowDepositUsers(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $page = max(1, (int) $request->input('page', 1));
        $pageSize = max(1, min(100, (int) $request->input('page_size', 20)));

        $query = User::where('role', 'user')->where('balance', '<=', 50.00);
        $total = $query->count();
        $users = $query->forPage($page, $pageSize)->get();

        $data = $users->map(function ($u) {
            $dayRecharge = Transaction::where('user_id', $u->id)
                ->where('type', 'deposit')
                ->where('status', 'approved')
                ->whereDate('created_at', now()->toDateString())
                ->sum('amount');

            return [
                'account_name' => $u->username,
                'agent_id' => 10045,
                'day_recharge' => (float) $dayRecharge,
                'user_balance' => (string) $u->balance,
                'user_id' => (string) $u->id,
            ];
        });

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => $data,
            'count' => $total,
        ]);
    }

    /**
     * 2.1.8 Reset Player Password
     * Route: /api/external/resetPassword
     */
    public function resetPassword(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $userId = trim((string) $request->input('user_id'));
        $loginPwd = (string) $request->input('login_pwd');

        if (empty($userId) || empty($loginPwd)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        if (strlen($loginPwd) < 6 || strlen($loginPwd) > 32) {
            return response()->json([
                'code' => 23,
                'msg' => 'Password digits 6 to 32 characters',
            ]);
        }

        $user = $this->findUser($userId);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        $user->update([
            'password' => Hash::make($loginPwd),
        ]);

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => null,
            'count' => 0,
        ]);
    }

    /**
     * 2.1.9 Force Player Offline
     * Route: /api/external/playerOffline
     */
    public function playerOffline(Request $request): JsonResponse
    {
        if ($err = $this->validateGlobalParams($request)) {
            return $err;
        }

        $userId = trim((string) $request->input('user_id'));
        if (empty($userId)) {
            return response()->json([
                'code' => 2,
                'msg' => 'Invalid request parameters',
            ]);
        }

        $user = $this->findUser($userId);
        if (!$user) {
            return response()->json([
                'code' => 8,
                'msg' => 'Invalid user ID',
            ]);
        }

        try {
            if (method_exists($user, 'tokens')) {
                $user->tokens()->delete();
            }
        } catch (\Throwable $e) {
            // Ignore if personal_access_tokens table is not present
        }

        return response()->json([
            'code' => 0,
            'msg' => 'Success',
            'data' => null,
            'count' => 0,
        ]);
    }
}
