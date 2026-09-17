<?php

namespace App\Http\Controllers\Api\User;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\PaymentGateway;
use App\Models\Transaction;
use App\Services\EmailTemplateMailer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class UserDepositApiController extends Controller
{
    public function index()
    {
        $gateways = PaymentGateway::with(['accounts' => function ($q) {
            $q->where('is_active', true)->orderBy('priority_order', 'asc');
        }])->where('is_active', true)->get();

        return response()->json([
            'gateways' => $gateways,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
            'game_id' => 'nullable|exists:games,id',
            'gateway_id' => 'required|exists:payment_gateways,id',
            'gateway_account_id' => 'nullable|exists:payment_gateway_accounts,id',
            'deposit_proof' => 'nullable|file|mimes:jpg,jpeg,png,pdf,webp|max:10240',
            'proof_url' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $gateway = PaymentGateway::findOrFail($validated['gateway_id']);
        if ((float) $validated['amount'] < (float) $gateway->minimum_amount) {
            return response()->json(['message' => "Minimum deposit for {$gateway->name} is \${$gateway->minimum_amount}"], 422);
        }

        // Ignore an account id that doesn't actually belong to the selected gateway (defensive
        // only — this field is informational/reporting, not used in the balance calculation).
        if (!empty($validated['gateway_account_id'])) {
            $belongsToGateway = $gateway->accounts()->where('id', $validated['gateway_account_id'])->exists();
            if (!$belongsToGateway) {
                $validated['gateway_account_id'] = null;
            }
        }

        if (!$request->hasFile('deposit_proof') && empty($validated['proof_url'])) {
            throw ValidationException::withMessages([
                'deposit_proof' => ['Please upload a deposit proof image.'],
            ]);
        }

        $proofUrl = null;
        if ($request->hasFile('deposit_proof')) {
            $path = $request->file('deposit_proof')->store('deposit_proofs', 'public');
            $proofUrl = Storage::url($path);
        } else {
            $proofUrl = $validated['proof_url'];
        }

        $transaction = Transaction::create([
            'user_id' => $request->user()->id,
            'game_id' => $validated['game_id'] ?? null,
            'gateway_id' => $gateway->id,
            'gateway_account_id' => $validated['gateway_account_id'] ?? null,
            'type' => 'deposit',
            'amount' => $validated['amount'],
            'status' => 'pending',
            'deposit_proof_url' => $proofUrl,
            'notes' => $validated['notes'] ?? null,
        ]);

        // Best-effort "we received your request" email — matches the transaction_{status}_{type}
        // naming AdminTransactionApiController::review() uses for approve/reject, so an admin can
        // enable it from the Email Templates page. No-ops silently if no template is configured.
        EmailTemplateMailer::fireTrigger('transaction_pending_deposit', $request->user(), [
            'amount' => number_format((float) $validated['amount'], 2), 'type' => 'deposit', 'status' => 'Pending',
        ]);

        $submitter = $request->user()->username ?? $request->user()->name ?? 'A user';
        Notification::notifyAdmins(
            'New Deposit Request',
            "{$submitter} submitted a deposit of \$" . number_format((float) $validated['amount'], 2) . '.',
            'info',
            'deposit'
        );

        return response()->json([
            'message' => 'Deposit request submitted successfully. Waiting for admin approval.',
            'transaction' => $transaction,
        ], 201);
    }
}
