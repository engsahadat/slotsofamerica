<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\EmailTemplate;
use App\Services\EmailTemplateMailer;
use Exception;
use Illuminate\Http\Request;

class AdminEmailTemplateApiController extends Controller
{
    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes|required' : 'required';

        return [
            'name' => "{$req}|string|max:255",
            'category' => "{$req}|string|max:50",
            'transaction_type' => 'nullable|string|max:50',
            'trigger_event' => 'nullable|string|max:100',
            'subject' => "{$req}|string|max:255",
            'body_html' => "{$req}|string",
            'is_active' => 'sometimes|boolean',
        ];
    }

    public function index()
    {
        $templates = EmailTemplate::latest()->get();

        return response()->json(['templates' => $templates]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate($this->rules());
        $validated['transaction_type'] = $validated['transaction_type'] ?? $validated['category'];
        $validated['trigger_event'] = $validated['trigger_event'] ?? 'manual';
        $validated['is_active'] = true;

        $template = EmailTemplate::create($validated);
        AuditLog::record($request, 'created_email_template', 'EmailTemplate', $template->id, ['name' => $template->name]);

        return response()->json(['message' => 'Template created.', 'template' => $template], 201);
    }

    public function update(Request $request, $id)
    {
        $template = EmailTemplate::findOrFail($id);
        $validated = $request->validate($this->rules(partial: true));
        $template->update($validated);

        AuditLog::record($request, 'updated_email_template', 'EmailTemplate', $template->id, ['name' => $template->name]);

        return response()->json(['message' => 'Template saved.', 'template' => $template->fresh()]);
    }

    public function destroy(Request $request, $id)
    {
        $template = EmailTemplate::findOrFail($id);
        $name = $template->name;
        $template->delete();

        AuditLog::record($request, 'deleted_email_template', 'EmailTemplate', $id, ['name' => $name]);

        return response()->json(['message' => 'Template deleted.']);
    }

    public function duplicate(Request $request, $id)
    {
        $template = EmailTemplate::findOrFail($id);
        $copy = $template->replicate();
        $copy->name = $template->name . ' (Copy)';
        $copy->is_active = false;
        $copy->save();

        AuditLog::record($request, 'duplicated_email_template', 'EmailTemplate', $copy->id, ['from' => $template->id]);

        return response()->json(['message' => 'Template duplicated.', 'template' => $copy], 201);
    }

    public function sendTest(Request $request)
    {
        $validated = $request->validate([
            'to' => 'required|email',
            'subject' => 'required|string|max:255',
            'body_html' => 'required|string',
        ]);

        try {
            EmailTemplateMailer::sendTest($validated['to'], $validated['subject'], $validated['body_html']);
        } catch (Exception $e) {
            return response()->json(['success' => false, 'message' => 'Failed to send: ' . $e->getMessage()], 500);
        }

        return response()->json(['success' => true, 'message' => "Test email sent to {$validated['to']}."]);
    }
}
