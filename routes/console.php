<?php

use App\Models\ExportRequest;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Housekeeping sweep for the Export Requests feature — the "Sweep expired"
// admin button covers this manually; this just keeps the status column
// accurate even if nobody clicks it. Harmless if `schedule:run` isn't
// wired into a live cron (isApprovedAndUnexpired() already time-gates
// downloads regardless of whether this has run).
Schedule::call(function () {
    ExportRequest::where('status', 'approved')
        ->where('approved_expires_at', '<=', now())
        ->update(['status' => 'expired']);
})->hourly();

// Failure & Recovery: FAST Payment webhook delivery is the only way a deposit is confirmed
// automatically — if it never arrives (their outage, ours, a dropped delivery), this is what
// stops the deposit from sitting 'pending' forever. Same idempotent apply() the live webhook
// uses, so a webhook that shows up late can never double-credit what this already resolved.
// Harmless if `schedule:run` isn't wired into a live cron, same as the sweep above.
Schedule::command('fast-payment:reconcile')->everyTenMinutes();
