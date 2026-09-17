<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\FastPaymentTransaction;
use App\Models\Transaction;
use App\Services\FastPaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * "FAST Payment" automated deposit (Google Pay / Cash App / Apple Pay via DollarPayWallet /
 * Kashuuu) — a second, independent deposit path alongside the existing manual gateway flow
 * in UserDepositApiController. Nothing here touches payment_gateways/payment_gateway_accounts
 * or the manual deposit endpoint; both remain fully separate and fully operational.
 */
class FastPaymentApiController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'provider' => 'required|in:cashapp,applepay,googlepay',
            'amount' => 'required|numeric',
        ]);

        // Never trust an amount sent only from React — validated against the gateway's own
        // fixed, documented list of supported amounts, not just a min/max range.
        $amount = round((float) $validated['amount'], 2);
        if (!FastPaymentService::isAmountSupported($amount)) {
            return response()->json([
                'message' => 'That amount is not supported for Instant Deposit. Please choose one of the listed amounts.',
            ], 422);
        }

        $user = $request->user();
        $orderSn = 'FP' . now()->format('YmdHis') . random_int(1000, 9999);

        // Call the gateway FIRST, before writing anything — if it can't even start a checkout
        // session, nothing should show up in the user's transaction history at all.
        $result = FastPaymentService::createPayment([
            'order_sn' => $orderSn,
            'user_name' => $user->username ?? $user->name,
            'provider' => $validated['provider'],
            'amount' => $amount,
            'notify_url' => rtrim(config('app.url'), '/') . '/api/webhooks/fast-payment',
            'ip' => $request->ip(),
            'device_id' => $request->header('X-Device-Id'),
            'user_id' => $user->id,
        ]);

        $payUrl = $result['success'] ? ($result['body']['pay_url'] ?? null) : null;
        if (!$result['success'] || !$payUrl) {
            // Deliberately NOT $result['error'] here — that can be the gateway's own raw text
            // (misconfiguration detail, a risk-engine message, provider jargon), which both
            // reads as unprofessional to a paying customer and can hint at which third-party
            // processor is behind this. The real reason is already captured in
            // fast_payment_api_logs (FastPaymentService::log()) for admin troubleshooting.
            return response()->json([
                'message' => 'Instant Deposit could not be started right now. Please try Manual Deposit or try again shortly.',
            ], 422);
        }

        $ipAddress = $request->ip();
        $deviceId = $request->header('X-Device-Id');

        [$transaction] = DB::transaction(function () use ($user, $amount, $orderSn, $validated, $payUrl, $ipAddress, $deviceId) {
            $transaction = Transaction::create([
                'user_id' => $user->id,
                'type' => 'deposit',
                'amount' => $amount,
                'status' => 'pending',
                'notes' => 'FAST Payment (' . $validated['provider'] . ') — order ' . $orderSn,
            ]);

            $fastPayment = FastPaymentTransaction::create([
                'transaction_id' => $transaction->id,
                'user_id' => $user->id,
                'order_sn' => $orderSn,
                'provider' => $validated['provider'],
                'requested_amount' => $amount,
                'payment_status' => 'pending',
                'pay_url' => $payUrl,
                'ip_address' => $ipAddress,
                'device_id' => $deviceId,
            ]);

            return [$transaction, $fastPayment];
        });

        return response()->json([
            'message' => 'Redirecting to checkout.',
            'pay_url' => $payUrl,
            'transaction_id' => $transaction->id,
            'order_sn' => $orderSn,
        ], 201);
    }

    /** Lets the frontend re-check status if the user returns from checkout before the webhook lands. */
    public function status(Request $request, string $orderSn)
    {
        $fastPayment = FastPaymentTransaction::where('order_sn', $orderSn)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json([
            'status' => $fastPayment->payment_status,
            'confirmed_amount' => $fastPayment->confirmed_amount,
        ]);
    }
}
