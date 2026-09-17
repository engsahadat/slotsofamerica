<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\SiteSetting;
use Illuminate\Http\Request;

class AdminRedeemSettingsApiController extends Controller
{
    public function index()
    {
        $settings = SiteSetting::instance();

        return response()->json([
            'settings' => [
                'min_amount' => $settings->redeem_min_amount ?? (float) config('redeem.min_amount'),
                'max_amount' => $settings->redeem_max_amount ?? (float) config('redeem.max_amount'),
            ],
        ]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'min_amount' => 'required|numeric|min:0',
            'max_amount' => 'required|numeric|gt:min_amount',
        ]);

        $settings = SiteSetting::instance();
        $settings->update([
            'redeem_min_amount' => $validated['min_amount'],
            'redeem_max_amount' => $validated['max_amount'],
        ]);

        AuditLog::record($request, 'updated_redeem_settings', 'SiteSetting', $settings->id, $validated);

        return response()->json([
            'message' => 'Redeem limits updated.',
            'settings' => [
                'min_amount' => (float) $settings->redeem_min_amount,
                'max_amount' => (float) $settings->redeem_max_amount,
            ],
        ]);
    }
}
