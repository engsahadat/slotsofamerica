<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ExportRequest;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Manager-requests / admin-approves workflow for transaction data exports.
 * Ported from the reference project's `export_requests` table +
 * `process_export_request` RPC (see supabase/migrations), extended with
 * the 24-hour approval-expiry mechanic the frontend already expects
 * (approved_expires_at / "Sweep expired" / consume-on-download) — that
 * extension has no reference SQL to port from, it's designed fresh here
 * to match the UI contract.
 */
class AdminExportRequestApiController extends Controller
{
    private const APPROVAL_WINDOW_HOURS = 24;

    public function index(Request $request)
    {
        $query = ExportRequest::with(['manager:id,name,username,email', 'reviewer:id,name,username'])
            ->orderByDesc('created_at');

        if (!$request->user()->isAdmin()) {
            $query->where('manager_id', $request->user()->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        return response()->json(['requests' => $query->limit(200)->get()]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'export_type' => 'sometimes|string|max:50',
            'filters' => 'required|array',
            'reason' => 'nullable|string|max:1000',
            'row_count' => 'nullable|integer|min:0',
        ]);

        $req = ExportRequest::create([
            'manager_id' => $request->user()->id,
            'export_type' => $validated['export_type'] ?? 'transactions',
            'filters' => $validated['filters'],
            'reason' => $validated['reason'] ?? null,
            'row_count' => $validated['row_count'] ?? null,
            'status' => 'pending',
            'created_at' => now(),
        ]);

        // Notify admins — mirrors the reference's notify_admin_export_request trigger.
        Notification::notifyAdmins(
            'New Export Request',
            ($request->user()->username ?? $request->user()->name ?? 'A manager') . ' requested a transaction export.',
            'info',
            'system'
        );

        return response()->json(['success' => true, 'message' => 'Export request submitted.', 'request' => $req], 201);
    }

    public function approve(Request $request, $id)
    {
        if (!$request->user()->isAdmin()) {
            return response()->json(['message' => 'Only admins can approve export requests.'], 403);
        }

        $req = ExportRequest::where('status', 'pending')->find($id);
        if (!$req) {
            return response()->json(['success' => false, 'message' => 'Request not found or already processed.'], 404);
        }

        $note = $request->input('note');
        $req->update([
            'status' => 'approved',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'admin_note' => $note,
            'approved_expires_at' => now()->addHours(self::APPROVAL_WINDOW_HOURS),
        ]);

        Notification::notify(
            $req->manager_id,
            'Export Request Approved',
            'Your transaction export request has been approved. You can now download it for the next ' . self::APPROVAL_WINDOW_HOURS . ' hours.',
            'success',
            'system'
        );
        AuditLog::record($request, 'approved_export_request', 'ExportRequest', $req->id, ['manager_id' => $req->manager_id]);

        return response()->json(['success' => true, 'message' => 'Export request approved.', 'request' => $req->fresh()]);
    }

    public function reject(Request $request, $id)
    {
        if (!$request->user()->isAdmin()) {
            return response()->json(['message' => 'Only admins can reject export requests.'], 403);
        }

        $validated = $request->validate(['note' => 'required|string|max:1000']);

        $req = ExportRequest::where('status', 'pending')->find($id);
        if (!$req) {
            return response()->json(['success' => false, 'message' => 'Request not found or already processed.'], 404);
        }

        $req->update([
            'status' => 'rejected',
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'admin_note' => $validated['note'],
        ]);

        Notification::notify(
            $req->manager_id,
            'Export Request Rejected',
            'Your transaction export request was rejected. Reason: ' . $validated['note'],
            'warning',
            'system'
        );
        AuditLog::record($request, 'rejected_export_request', 'ExportRequest', $req->id, ['manager_id' => $req->manager_id]);

        return response()->json(['success' => true, 'message' => 'Export request rejected.', 'request' => $req->fresh()]);
    }

    public function destroy(Request $request, $id)
    {
        if (!$request->user()->isAdmin()) {
            return response()->json(['message' => 'Only admins can delete export requests.'], 403);
        }

        $req = ExportRequest::findOrFail($id);
        $req->delete();

        AuditLog::record($request, 'deleted_export_request', 'ExportRequest', $id);

        return response()->json(['success' => true, 'message' => 'Export request deleted.']);
    }

    public function sweepExpired(Request $request)
    {
        if (!$request->user()->isAdmin()) {
            return response()->json(['message' => 'Only admins can sweep expired requests.'], 403);
        }

        $count = ExportRequest::where('status', 'approved')
            ->where('approved_expires_at', '<=', now())
            ->update(['status' => 'expired']);

        AuditLog::record($request, 'swept_expired_export_requests', 'ExportRequest', null, ['count' => $count]);

        return response()->json(['success' => true, 'count' => $count]);
    }

    /** Re-validates an approval right before the manager downloads — mirrors consume_export_approval. */
    public function consumeApproval(Request $request, $id)
    {
        $req = ExportRequest::find($id);
        if (!$req) {
            return response()->json(['success' => false, 'message' => 'Export request not found.'], 404);
        }
        if (!$request->user()->isAdmin() && $req->manager_id !== $request->user()->id) {
            return response()->json(['success' => false, 'message' => 'This export request does not belong to you.'], 403);
        }
        if (!$req->isApprovedAndUnexpired()) {
            return response()->json(['success' => false, 'message' => 'This approval has expired or is no longer valid. Submit a new request.'], 422);
        }

        return response()->json(['success' => true]);
    }
}
