<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UploadApiController extends Controller
{
    private const ALLOWED_FOLDERS = [
        'avatars',
        'game-images',
        'gateway-qr',
        'brand-assets',
        'landing-images',
        'chat-images',
        'withdraw-proof',
        'deposit-proof',
    ];

    public function store(Request $request)
    {
        $validated = $request->validate([
            // 'ico' added for favicons (Site Settings -> Brand) — classic .ico files are still
            // the most common favicon format admins have on hand.
            'file' => 'required|file|mimes:jpg,jpeg,png,gif,webp,svg,ico|max:5120',
            'folder' => 'required|string|in:' . implode(',', self::ALLOWED_FOLDERS),
        ]);

        $path = $request->file('file')->store($validated['folder'], 'public');

        return response()->json([
            'message' => 'File uploaded successfully.',
            'url' => Storage::url($path),
            'path' => $path,
        ], 201);
    }
}
