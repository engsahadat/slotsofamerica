<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ExportRequest;
use App\Models\GameUnlockRequest;
use App\Models\PasswordRequest;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as RouteFacade;
use Illuminate\Support\Str;
use ReflectionClass;
use Throwable;

/**
 * Ported from the reference (Supabase/Postgres) project's "RLS Diagnostics" admin page.
 * Postgres Row-Level Security has no MySQL/Eloquent equivalent, so rather than fabricate
 * numbers this reproduces the same UI contract (coverage report + sample counts) using
 * Laravel-native signals instead of a literal port:
 *   - per-table "policy coverage" -> mass-assignment guarding on the Eloquent model
 *     ($fillable declared = Protected, $guarded = [] explicitly = wide open / the "RLS off"
 *     equivalent, neither declared = framework-default-safe but undocumented = "No Policies"),
 *   - the SEL/INS/UPD/DEL columns -> count of admin API routes (grouped by HTTP verb) whose
 *     URI matches this table *and* require this app's own auth middleware — that's the real
 *     access-control mechanism here in place of declarative RLS policies.
 */
class AdminRlsDiagnosticsApiController extends Controller
{
    /** Laravel's own bookkeeping tables — never app-modeled, so shown as "Framework" rather
     *  than lumped in with genuinely unprotected app tables. */
    private const FRAMEWORK_TABLES = [
        'migrations', 'sessions', 'cache', 'cache_locks', 'jobs', 'job_batches',
        'failed_jobs', 'password_reset_tokens', 'notifications',
    ];

    public function index(Request $request)
    {
        if (!$request->user()->isAdmin()) {
            return response()->json(['message' => 'Admins only.'], 403);
        }

        $dbName = DB::connection()->getDatabaseName();
        $schemaRows = DB::select(
            'SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.tables WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
            [$dbName]
        );

        $modelMap = $this->buildModelMap();
        $routeCoverage = $this->buildRouteCoverage();

        $tableReports = [];
        $protected = 0;
        $noPolicies = 0;
        $rlsOff = 0;
        $viewCount = 0;

        foreach ($schemaRows as $row) {
            if ($row->type === 'VIEW') {
                $viewCount++;
                continue;
            }

            $table = $row->name;

            if (in_array($table, self::FRAMEWORK_TABLES, true)) {
                $status = 'framework';
            } elseif (isset($modelMap[$table])) {
                [$fillable, $guarded] = $modelMap[$table];
                if (!empty($fillable)) {
                    $status = 'protected';
                    $protected++;
                } elseif ($guarded === []) {
                    $status = 'rls_off';
                    $rlsOff++;
                } else {
                    $status = 'no_policies';
                    $noPolicies++;
                }
            } else {
                $status = 'no_policies';
                $noPolicies++;
            }

            // array_merge, not `??` — a table can have SOME verbs covered (e.g. SEL+INS) and
            // be missing others (e.g. UPD), and `??` only catches a *fully* absent table key.
            $cov = array_merge(['SEL' => 0, 'INS' => 0, 'UPD' => 0, 'DEL' => 0], $routeCoverage[$table] ?? []);

            $tableReports[] = [
                'table' => $table,
                'status' => $status,
                'sel' => $cov['SEL'],
                'ins' => $cov['INS'],
                'upd' => $cov['UPD'],
                'del' => $cov['DEL'],
                'total' => $cov['SEL'] + $cov['INS'] + $cov['UPD'] + $cov['DEL'],
            ];
        }

        return response()->json([
            'summary' => [
                'tables' => count($tableReports),
                'protected' => $protected,
                'no_policies' => $noPolicies,
                'rls_off' => $rlsOff,
                'views' => $viewCount,
            ],
            'sample_counts' => [
                'total_profiles' => User::count(),
                'admins' => User::where('role', 'admin')->count(),
                'managers' => User::where('role', 'manager')->count(),
                'regular_users' => User::where('role', 'user')->count(),
                'flagged' => User::where('is_flagged', true)->count(),
                'audit_logs' => AuditLog::count(),
                'tx_pending' => Transaction::where('status', 'pending')->count(),
                'tx_completed' => Transaction::where('status', 'approved')->count(),
                'tx_rejected' => Transaction::where('status', 'rejected')->count(),
                'access_pending' => GameUnlockRequest::where('status', 'pending')->count(),
                'pw_requests_pending' => PasswordRequest::where('status', 'pending')->count(),
                'exports_pending' => ExportRequest::where('status', 'pending')->count(),
            ],
            'tables_report' => $tableReports,
        ]);
    }

    /** table_name => [fillable[], guarded[]] for every concrete Eloquent model in app/Models. */
    private function buildModelMap(): array
    {
        $map = [];
        foreach (glob(app_path('Models') . '/*.php') ?: [] as $file) {
            $class = 'App\\Models\\' . basename($file, '.php');
            if (!class_exists($class)) {
                continue;
            }
            try {
                $ref = new ReflectionClass($class);
                if ($ref->isAbstract() || !$ref->isSubclassOf(Model::class)) {
                    continue;
                }
                /** @var Model $instance */
                $instance = $ref->newInstance();
                $map[$instance->getTable()] = [$instance->getFillable(), $instance->getGuarded()];
            } catch (Throwable) {
                continue;
            }
        }
        return $map;
    }

    /** table_name => ['SEL'=>n,'INS'=>n,'UPD'=>n,'DEL'=>n], counting *authenticated* API routes
     *  whose URI has a segment matching that table name (kebab or snake). Bogus keys (a route
     *  segment that doesn't correspond to any real table) are harmless — the caller only ever
     *  reads back keys for tables it already knows exist. */
    private function buildRouteCoverage(): array
    {
        $verbFor = ['GET' => 'SEL', 'HEAD' => 'SEL', 'POST' => 'INS', 'PUT' => 'UPD', 'PATCH' => 'UPD', 'DELETE' => 'DEL'];
        $coverage = [];

        foreach (RouteFacade::getRoutes() as $route) {
            $uri = ltrim($route->uri(), '/');
            if (!str_starts_with($uri, 'api/')) {
                continue;
            }

            $middleware = $route->gatherMiddleware();
            $isAuthed = collect($middleware)->contains(
                fn ($m) => str_contains($m, 'JwtAuthMiddleware') || str_contains($m, 'AdminMiddleware')
            );
            if (!$isAuthed) {
                continue;
            }

            $method = $route->methods()[0] ?? 'GET';
            $bucket = $verbFor[$method] ?? null;
            if (!$bucket) {
                continue;
            }

            $segments = array_filter(explode('/', $uri), fn ($s) => $s !== '' && !str_starts_with($s, '{'));
            foreach ($segments as $segment) {
                $table = str_replace('-', '_', Str::snake($segment));
                if (strlen($table) < 3) {
                    continue;
                }
                $coverage[$table][$bucket] = ($coverage[$table][$bucket] ?? 0) + 1;
            }
        }

        return $coverage;
    }
}
