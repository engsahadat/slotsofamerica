<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\SiteSetting;
use App\Models\WithdrawMethod;
use App\Models\WithdrawMethodField;
use Illuminate\Http\Request;

class AdminWithdrawMethodApiController extends Controller
{
    public function index()
    {
        $methods = WithdrawMethod::with('fields')->orderBy('sort_order', 'asc')->get();

        return response()->json(['methods' => $methods]);
    }

    public function dailyLimit()
    {
        $settings = SiteSetting::instance();

        return response()->json([
            'daily_limit' => $settings->withdraw_daily_limit ?? 100.0,
        ]);
    }

    public function updateDailyLimit(Request $request)
    {
        $validated = $request->validate([
            'daily_limit' => 'required|numeric|min:0.01',
        ]);

        $settings = SiteSetting::instance();
        $settings->update(['withdraw_daily_limit' => $validated['daily_limit']]);

        AuditLog::record($request, 'updated_withdraw_daily_limit', 'SiteSetting', $settings->id, $validated);

        return response()->json([
            'message' => 'Daily withdraw limit updated.',
            'daily_limit' => (float) $settings->withdraw_daily_limit,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:100|unique:withdraw_methods',
            'logo_url' => 'nullable|string',
            'minimum_amount' => 'required|numeric|min:0',
            'maximum_amount' => 'required|numeric|min:0',
            'fee_percentage' => 'numeric|min:0|max:100',
            'fee_fixed' => 'numeric|min:0',
            'processing_time' => 'string',
            'instructions' => 'nullable|string',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $method = WithdrawMethod::create($validated);
        AuditLog::record($request, 'created_withdraw_method', 'WithdrawMethod', $method->id, ['name' => $method->name]);

        return response()->json(['message' => 'Withdraw method created.', 'method' => $method], 201);
    }

    public function update(Request $request, $id)
    {
        $method = WithdrawMethod::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'code' => "sometimes|string|max:100|unique:withdraw_methods,code,{$id}",
            'logo_url' => 'nullable|string',
            'minimum_amount' => 'sometimes|numeric|min:0',
            'maximum_amount' => 'sometimes|numeric|min:0',
            'fee_percentage' => 'numeric|min:0|max:100',
            'fee_fixed' => 'numeric|min:0',
            'processing_time' => 'string',
            'instructions' => 'nullable|string',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $method->update($validated);
        AuditLog::record($request, 'updated_withdraw_method', 'WithdrawMethod', $method->id, ['name' => $method->name]);

        return response()->json(['message' => 'Withdraw method updated.', 'method' => $method]);
    }

    public function destroy(Request $request, $id)
    {
        $method = WithdrawMethod::findOrFail($id);
        AuditLog::record($request, 'deleted_withdraw_method', 'WithdrawMethod', $method->id, ['name' => $method->name]);
        $method->delete();

        return response()->json(['message' => 'Withdraw method deleted.']);
    }

    public function storeField(Request $request, $methodId)
    {
        $validated = $request->validate([
            'field_name' => 'required|string|max:255',
            'field_label' => 'required|string|max:255',
            'field_type' => 'required|in:text,number,email,textarea,select',
            'placeholder' => 'nullable|string',
            'is_required' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $field = WithdrawMethodField::create(array_merge($validated, ['method_id' => $methodId]));
        AuditLog::record($request, 'added_withdraw_method_field', 'WithdrawMethod', $methodId, ['field_label' => $field->field_label]);

        return response()->json(['message' => 'Dynamic field added.', 'field' => $field], 201);
    }

    public function updateField(Request $request, $methodId, $fieldId)
    {
        $field = WithdrawMethodField::where('method_id', $methodId)->findOrFail($fieldId);

        $validated = $request->validate([
            'field_name' => 'sometimes|string|max:255',
            'field_label' => 'sometimes|string|max:255',
            'field_type' => 'sometimes|in:text,number,email,textarea,select',
            'placeholder' => 'nullable|string',
            'is_required' => 'boolean',
            'sort_order' => 'integer',
        ]);

        $field->update($validated);
        AuditLog::record($request, 'updated_withdraw_method_field', 'WithdrawMethod', $methodId, ['field_label' => $field->field_label]);

        return response()->json(['message' => 'Field updated.', 'field' => $field]);
    }

    public function destroyField(Request $request, $methodId, $fieldId)
    {
        $field = WithdrawMethodField::where('method_id', $methodId)->findOrFail($fieldId);
        $field->delete();
        AuditLog::record($request, 'removed_withdraw_method_field', 'WithdrawMethod', $methodId, ['field_label' => $field->field_label]);

        return response()->json(['message' => 'Field removed.']);
    }
}
