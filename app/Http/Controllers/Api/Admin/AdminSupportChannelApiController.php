<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\SupportChannel;
use Illuminate\Http\Request;

class AdminSupportChannelApiController extends Controller
{
    public function index()
    {
        $channels = SupportChannel::orderBy('sort_order', 'asc')->get();

        return response()->json(['channels' => $channels]);
    }

    /** Public/unauthenticated read for the floating contact widget — active channels only. */
    public function publicIndex()
    {
        $channels = SupportChannel::where('is_active', true)->orderBy('sort_order', 'asc')->get();

        return response()->json(['channels' => $channels]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'icon' => 'required|string',
            'link' => 'required|string',
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ]);

        if (str_starts_with(strtolower(trim($validated['link'])), 'javascript:')) {
            return response()->json(['message' => 'Invalid link.'], 422);
        }

        $channel = SupportChannel::create($validated);

        return response()->json(['message' => 'Support channel added.', 'channel' => $channel], 201);
    }

    public function update(Request $request, $id)
    {
        $channel = SupportChannel::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'icon' => 'sometimes|required|string',
            'link' => 'sometimes|required|string',
            'sort_order' => 'sometimes|integer',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($validated['link']) && str_starts_with(strtolower(trim($validated['link'])), 'javascript:')) {
            return response()->json(['message' => 'Invalid link.'], 422);
        }

        $channel->update($validated);

        return response()->json(['message' => 'Support channel updated.', 'channel' => $channel->fresh()]);
    }

    public function destroy($id)
    {
        $channel = SupportChannel::findOrFail($id);
        $channel->delete();

        return response()->json(['message' => 'Support channel deleted.']);
    }
}
