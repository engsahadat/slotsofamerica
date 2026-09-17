<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\RewardsConfig;
use Illuminate\Http\Request;

class AdminRewardsApiController extends Controller
{
    public function index()
    {
        $rewards = RewardsConfig::all();

        return response()->json(['rewards' => $rewards]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'key' => 'required|string|max:100|unique:rewards_config',
            'value' => 'required|numeric|min:0',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $reward = RewardsConfig::create($validated);
        AuditLog::record($request, 'created_reward', 'RewardsConfig', $reward->id, ['key' => $reward->key]);

        return response()->json(['message' => 'Reward configured successfully.', 'reward' => $reward], 201);
    }

    public function update(Request $request, $id)
    {
        $reward = RewardsConfig::findOrFail($id);

        $validated = $request->validate([
            'key' => "sometimes|string|max:100|unique:rewards_config,key,{$id}",
            'value' => 'sometimes|numeric|min:0',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $reward->update($validated);
        AuditLog::record($request, 'updated_reward', 'RewardsConfig', $reward->id, ['key' => $reward->key]);

        return response()->json(['message' => 'Reward rule updated.', 'reward' => $reward]);
    }

    public function destroy(Request $request, $id)
    {
        $reward = RewardsConfig::findOrFail($id);
        AuditLog::record($request, 'deleted_reward', 'RewardsConfig', $reward->id, ['key' => $reward->key]);
        $reward->delete();

        return response()->json(['message' => 'Reward rule deleted successfully.']);
    }
}
