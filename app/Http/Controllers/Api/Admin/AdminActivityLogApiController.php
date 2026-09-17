<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AdminActivityLogApiController extends Controller
{
    public function index(Request $request)
    {
        $query = AuditLog::with('admin')->latest();

        if ($request->filled('action')) {
            $query->where('action', $request->string('action'));
        }

        if ($request->filled('admin_id')) {
            $query->where('admin_id', $request->integer('admin_id'));
        }

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->date('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->date('date_to')->endOfDay());
        }

        $perPage = min(200, max(1, $request->integer('per_page', 25)));

        return response()->json($query->paginate($perPage));
    }

    public function destroy($id)
    {
        $log = AuditLog::findOrFail($id);
        $log->delete();

        return response()->json(['message' => 'Log entry deleted successfully.']);
    }

    public function clear()
    {
        AuditLog::truncate();

        return response()->json(['message' => 'Activity logs cleared successfully.']);
    }
}
