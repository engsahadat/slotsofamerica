<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PaymentGateway;
use App\Models\PaymentGatewayAccount;
use Illuminate\Http\Request;

class AdminPaymentGatewayApiController extends Controller
{
    public function index()
    {
        $gateways = PaymentGateway::with('accounts')->get();

        return response()->json(['gateways' => $gateways]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'address' => 'nullable|string',
            'minimum_amount' => 'required|numeric|min:0',
            'logo_url' => 'nullable|string',
            'qr_code_url' => 'nullable|string',
            'deep_link' => 'nullable|string',
            'instructions' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $gateway = PaymentGateway::create($validated);
        AuditLog::record($request, 'created_payment_gateway', 'PaymentGateway', $gateway->id, ['name' => $gateway->name]);

        return response()->json(['message' => 'Payment Gateway created successfully.', 'gateway' => $gateway], 201);
    }

    public function update(Request $request, $id)
    {
        $gateway = PaymentGateway::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'address' => 'nullable|string',
            'minimum_amount' => 'sometimes|numeric|min:0',
            'logo_url' => 'nullable|string',
            'qr_code_url' => 'nullable|string',
            'deep_link' => 'nullable|string',
            'instructions' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $gateway->update($validated);
        AuditLog::record($request, 'updated_payment_gateway', 'PaymentGateway', $gateway->id, ['name' => $gateway->name]);

        return response()->json(['message' => 'Payment Gateway updated.', 'gateway' => $gateway]);
    }

    public function destroy(Request $request, $id)
    {
        $gateway = PaymentGateway::findOrFail($id);
        AuditLog::record($request, 'deleted_payment_gateway', 'PaymentGateway', $gateway->id, ['name' => $gateway->name]);
        $gateway->delete();

        return response()->json(['message' => 'Payment Gateway deleted.']);
    }

    public function storeAccount(Request $request, $gatewayId)
    {
        $gateway = PaymentGateway::findOrFail($gatewayId);

        $validated = $request->validate([
            'account_name' => 'required|string|max:255',
            'account_number' => 'required|string|max:255',
            'priority_order' => 'integer',
            'is_active' => 'boolean',
            'qr_code_url' => 'nullable|string',
            'deep_link' => 'nullable|string',
        ]);

        $account = PaymentGatewayAccount::create(array_merge($validated, ['gateway_id' => $gateway->id]));
        AuditLog::record($request, 'added_payment_gateway_account', 'PaymentGateway', $gateway->id, ['account_name' => $account->account_name]);

        return response()->json(['message' => 'Account added to gateway.', 'account' => $account], 201);
    }

    public function updateAccount(Request $request, $gatewayId, $accountId)
    {
        $account = PaymentGatewayAccount::where('gateway_id', $gatewayId)->findOrFail($accountId);

        $validated = $request->validate([
            'account_name' => 'sometimes|string|max:255',
            'account_number' => 'sometimes|string|max:255',
            'priority_order' => 'integer',
            'is_active' => 'boolean',
            'qr_code_url' => 'nullable|string',
            'deep_link' => 'nullable|string',
        ]);

        $account->update($validated);
        AuditLog::record($request, 'updated_payment_gateway_account', 'PaymentGateway', $gatewayId, ['account_name' => $account->account_name]);

        return response()->json(['message' => 'Account updated.', 'account' => $account]);
    }

    public function destroyAccount(Request $request, $gatewayId, $accountId)
    {
        $account = PaymentGatewayAccount::where('gateway_id', $gatewayId)->findOrFail($accountId);
        $account->delete();
        AuditLog::record($request, 'removed_payment_gateway_account', 'PaymentGateway', $gatewayId, ['account_name' => $account->account_name]);

        return response()->json(['message' => 'Account removed.']);
    }
}
