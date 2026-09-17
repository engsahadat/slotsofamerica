<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FastPaymentTransaction;
use App\Services\FastPaymentReconciler;
use App\Services\FastPaymentService;
use Illuminate\Http\Request;

/**
 * Public (unauthenticated) endpoint FAST Payment (DollarPayWallet/Kashuuu) POSTs to when a
 * deposit's status changes — one of two places a FAST Payment deposit's balance is ever
 * credited (the other being the fast-payment:reconcile console command, for a webhook that
 * never arrives — same idempotent FastPaymentReconciler::apply() either way, so the two paths
 * can never diverge or double-credit). A frontend redirect back from checkout NEVER credits
 * balance by itself; see FastPaymentApiController for the session-creation side of this flow.
 *
 * Per §1.1 of the doc: on successful processing we must return the literal plain-text string
 * "SUCCESS" (not JSON, not HTML) — anything else is treated as a failed delivery and retried.
 */
class FastPaymentWebhookController extends Controller
{
    public function __construct(private FastPaymentReconciler $reconciler)
    {
    }

    public function notify(Request $request)
    {
        $payload = $request->all();

        // The ONLY thing that makes this callback trustworthy — anyone on the internet can
        // POST to this public URL, so pay_status is never acted on without a verified sign.
        if (!FastPaymentService::verifySignature($payload)) {
            $this->reconciler->log('webhook_notify', $payload, false, 'Invalid or missing signature.');

            return response('FAIL', 400)->header('Content-Type', 'text/plain');
        }

        $orderSn = $payload['outer_order_sn'] ?? null;
        if (!$orderSn) {
            $this->reconciler->log('webhook_notify', $payload, false, 'Missing outer_order_sn.', null, true);

            return response('FAIL', 400)->header('Content-Type', 'text/plain');
        }

        $fastPayment = FastPaymentTransaction::where('order_sn', $orderSn)->first();
        if (!$fastPayment) {
            // Ask FAST to retry rather than silently dropping an event for an order we don't
            // (yet) know about — could be a delivery racing ahead of our own DB write.
            report(new \Exception("FAST Payment webhook for unknown order_sn: {$orderSn}"));
            $this->reconciler->log('webhook_notify', $payload, false, "Unknown order_sn: {$orderSn}", null, true);

            return response('FAIL', 404)->header('Content-Type', 'text/plain');
        }

        $this->reconciler->apply($fastPayment->id, $payload, 'webhook_notify');

        return response('SUCCESS', 200)->header('Content-Type', 'text/plain');
    }
}
