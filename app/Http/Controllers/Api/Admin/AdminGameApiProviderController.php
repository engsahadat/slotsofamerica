<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Game;
use App\Models\GameApiLog;
use App\Models\GameApiProvider;
use App\Models\GameApiProviderSecret;
use App\Models\GameProviderAssignment;
use App\Models\GameUnlockRequest;
use App\Services\GameApiProvider\ApiLogger;
use App\Services\GameApiProvider\E2eTester;
use App\Services\GameApiProvider\HealthChecker;
use App\Services\GameApiProvider\ProviderHttpClient;
use App\Services\GameApiProvider\ProviderPasswordResolver;
use App\Services\GameApiProvider\Protocols\ProtocolResolver;
use App\Services\GameApiProvider\Provisioner;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminGameApiProviderController extends Controller
{
    public function __construct(
        private ProviderHttpClient $http,
        private ProviderPasswordResolver $passwords,
        private HealthChecker $healthChecker,
        private E2eTester $e2eTester,
        private Provisioner $provisioner,
        private ApiLogger $apiLogger,
        private ProtocolResolver $protocols,
    ) {
    }

    public function index()
    {
        $providers = GameApiProvider::orderByDesc('created_at')->get();
        $providerIdsWithPassword = GameApiProviderSecret::pluck('provider_id')->all();
        $providers->each(fn (GameApiProvider $p) => $p->setAttribute('has_password', in_array($p->id, $providerIdsWithPassword)));

        return response()->json([
            'providers' => $providers,
            'games' => Game::orderBy('name')->get(['id', 'name']),
            'assignments' => GameProviderAssignment::all(),
            // Time-bounded (not row-count-bounded): the frontend's computeHealth() only ever
            // looks at the last 24h per provider, so a flat top-100-across-all-providers cap
            // could push a quieter provider's genuinely-recent successful check out of the
            // window whenever another provider is noisy (heavy Run Safe Test / e2e usage).
            'logs' => GameApiLog::where('created_at', '>=', now()->subDay())->orderByDesc('created_at')->limit(1000)->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateProvider($request);
        $provider = GameApiProvider::create($validated);

        AuditLog::record($request, 'created_game_api_provider', 'GameApiProvider', $provider->id, [
            'name' => $provider->name, 'protocol' => $provider->protocol,
        ]);

        return response()->json(['message' => 'Provider created.', 'provider' => $provider], 201);
    }

    public function update(Request $request, $id)
    {
        $provider = GameApiProvider::findOrFail($id);
        $validated = $this->validateProvider($request, $provider->id, true);
        $provider->update($validated);

        AuditLog::record($request, 'updated_game_api_provider', 'GameApiProvider', $provider->id, [
            'fields' => array_keys($validated),
        ]);

        return response()->json(['message' => 'Provider updated.', 'provider' => $provider]);
    }

    public function destroy(Request $request, $id)
    {
        $provider = GameApiProvider::findOrFail($id);
        GameProviderAssignment::where('provider_id', $provider->id)->delete();
        $name = $provider->name;
        $provider->delete();

        AuditLog::record($request, 'deleted_game_api_provider', 'GameApiProvider', $id, ['name' => $name]);

        return response()->json(['message' => 'Provider deleted.']);
    }

    public function toggleField(Request $request, $id)
    {
        $validated = $request->validate([
            'field' => ['required', Rule::in(['is_active', 'automate_create_account', 'automate_deposit', 'automate_withdraw'])],
            'value' => ['required', 'boolean'],
        ]);
        $provider = GameApiProvider::findOrFail($id);
        $provider->update([$validated['field'] => $validated['value']]);

        AuditLog::record($request, "toggled_game_api_provider_{$validated['field']}", 'GameApiProvider', $provider->id, [
            'name' => $provider->name, 'value' => $validated['value'],
        ]);

        return response()->json(['message' => 'Updated.', 'provider' => $provider]);
    }

    public function setPassword(Request $request, $id)
    {
        $validated = $request->validate(['password' => 'required|string|min:1']);
        $provider = GameApiProvider::findOrFail($id);

        // Trim — a pasted password with a stray leading/trailing space or
        // newline is indistinguishable from "wrong password" once sent to
        // the provider, and is a common source of confusing test failures.
        $password = trim($validated['password']);
        if ($password === '') {
            return response()->json(['message' => 'Password cannot be empty.'], 422);
        }

        GameApiProviderSecret::updateOrCreate(
            ['provider_id' => $provider->id],
            ['agent_password' => $password, 'updated_by' => $request->user()->id]
        );

        // Never log the password itself — only that it was changed.
        AuditLog::record($request, 'set_game_api_provider_password', 'GameApiProvider', $provider->id, [
            'name' => $provider->name,
        ]);

        return response()->json(['message' => 'Agent password saved.']);
    }

    /**
     * Regression: this used to duplicate a subset of HealthChecker::checkOne()'s logic
     * (call the protocol, log it) but skipped the persistence step — last_health_status/
     * last_health_checked_at on the provider row were never updated by this button, only by
     * HealthChecker (used by "Try Alternative Formats" / scheduled checks). The status badge
     * is 24h-log-windowed, so once that window passed with no OTHER check having run, a
     * provider the admin had just verified as working would silently revert to "Checking" /
     * "Never checked" — confusing, and wrong. Delegating to HealthChecker here makes "Test
     * Connection" persist exactly like every other health-check entry point.
     */
    public function testConnection($id)
    {
        $provider = GameApiProvider::findOrFail($id);
        $result = $this->healthChecker->checkOne($provider);

        return response()->json([
            'success' => $result['success'],
            'message' => $result['status'] === 'connected'
                ? 'Provider connection verified successfully.'
                : ($result['message'] ?? 'Connection failed.'),
            'latency_ms' => $result['latency_ms'],
        ]);
    }

    public function healthCheck(Request $request, $id)
    {
        $provider = GameApiProvider::findOrFail($id);
        $contentTypeOverride = $request->input('content_type_override');
        $dryRun = (bool) $request->boolean('dry_run');

        $result = $this->healthChecker->checkOne($provider, $contentTypeOverride, $dryRun);

        return response()->json(['success' => $result['success'], 'results' => [$result]]);
    }

    public function e2eTest($id)
    {
        $provider = GameApiProvider::findOrFail($id);
        $result = $this->e2eTester->run($provider);

        return response()->json($result);
    }

    public function providerLogs(Request $request, $id)
    {
        $provider = GameApiProvider::findOrFail($id);
        $query = GameApiLog::where('provider_name', $provider->name)->orderByDesc('created_at');

        if ($before = $request->query('before')) {
            $query->where('created_at', '<', $before);
        }

        $logs = $query->limit(50)->get();

        return response()->json(['logs' => $logs, 'has_more' => $logs->count() === 50]);
    }

    public function setAssignment(Request $request)
    {
        $validated = $request->validate([
            'game_id' => 'required|exists:games,id',
            'provider_id' => 'nullable|exists:game_api_providers,id',
        ]);

        $existing = GameProviderAssignment::where('game_id', $validated['game_id'])->first();

        if (empty($validated['provider_id'])) {
            $existing?->delete();
        } elseif ($existing) {
            $existing->update(['provider_id' => $validated['provider_id']]);
        } else {
            GameProviderAssignment::create($validated);
        }

        AuditLog::record($request, 'updated_game_provider_assignment', 'Game', $validated['game_id'], [
            'provider_id' => $validated['provider_id'] ?? null,
        ]);

        return response()->json(['message' => 'Assignment saved.']);
    }

    public function manualOverride(Request $request)
    {
        $validated = $request->validate([
            'request_id' => 'required|exists:game_unlock_requests,id',
            'action' => ['required', Rule::in(['create', 'sync'])],
        ]);

        if ($validated['action'] === 'create') {
            $result = $this->provisioner->createAccount((int) $validated['request_id'], $request->user()->id);
            AuditLog::record($request, 'manual_override_game_api_provider', 'GameUnlockRequest', $validated['request_id'], [
                'action' => 'create', 'success' => $result['success'] ?? false,
            ]);

            return response()->json($result);
        }

        $req = GameUnlockRequest::findOrFail($validated['request_id']);
        $assignment = GameProviderAssignment::where('game_id', $req->game_id)->first();
        if (!$assignment) {
            return response()->json(['success' => false, 'message' => 'No provider assigned to this game.']);
        }

        $result = $this->provisioner->syncAccount($assignment->provider_id, $req->username);
        AuditLog::record($request, 'manual_override_game_api_provider', 'GameUnlockRequest', $validated['request_id'], [
            'action' => 'sync', 'success' => $result['success'] ?? false,
        ]);

        return response()->json($result);
    }

    /**
     * Smart validation: a pasted Agent Username, Base URL, etc. with a stray leading/trailing
     * space or newline is indistinguishable from "wrong value" once sent to the provider —
     * exactly the kind of thing that produced a real, hours-long live debugging session for
     * this integration (a provider rejecting every request with "Invalid request parameters").
     * Same fix already applied to the agent password in setPassword() below; extended here to
     * every free-text field an admin might copy-paste from a provider's own dashboard.
     */
    private function normalizeProviderInput(Request $request): void
    {
        $trim = ['name', 'display_name', 'base_url', 'agent_username', 'secret_name', 'proxy_url', 'health_check_path', 'docs_url'];
        $updates = [];
        foreach ($trim as $field) {
            if ($request->has($field) && is_string($request->input($field))) {
                $updates[$field] = trim($request->input($field));
            }
        }
        // Trailing slashes cause double-slash URLs once a path is appended (base_url . '/api/...')
        // — a second, equally silent source of "works everywhere except this one provider" bugs.
        if (isset($updates['base_url'])) {
            $updates['base_url'] = rtrim($updates['base_url'], '/');
        }
        if ($updates) {
            $request->merge($updates);
        }
    }

    private function validateProvider(Request $request, $ignoreId = null, bool $partial = false): array
    {
        $this->normalizeProviderInput($request);

        $required = $partial ? 'sometimes' : 'required';
        $rules = [
            'name' => [$required, 'string', 'max:100', 'regex:/^\S+$/', Rule::unique('game_api_providers', 'name')->ignore($ignoreId)],
            'display_name' => [$required, 'string', 'max:150'],
            'protocol' => ['sometimes', Rule::in(['agent_login', 'external_signed', 'orion_stars_signed', 'fast_api_signed', 'river_pay_simple'])],
            'base_url' => [$required, 'string', 'max:255', 'url'],
            'agent_username' => [$required, 'string', 'max:150'],
            'secret_name' => 'nullable|string|max:150',
            'is_active' => 'sometimes|boolean',
            'automate_create_account' => 'sometimes|boolean',
            'automate_deposit' => 'sometimes|boolean',
            'automate_withdraw' => 'sometimes|boolean',
            'notes' => 'nullable|string',
            'request_content_type' => ['sometimes', Rule::in(['multipart/form-data', 'application/x-www-form-urlencoded', 'application/json'])],
            'request_method' => ['sometimes', Rule::in(['GET', 'POST'])],
            'custom_headers' => 'sometimes|array',
            'proxy_url' => 'nullable|string|max:255',
            'requires_ip_whitelist' => 'sometimes|boolean',
            'health_check_path' => 'sometimes|string|max:255',
            'whitelist_ip_note' => 'nullable|string',
            'docs_url' => 'nullable|string|max:255',
            'last_health_status' => 'sometimes|string|max:50',
            'last_health_message' => 'sometimes|nullable|string',
        ];

        return $request->validate($rules);
    }
}
