<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\Request;

class AdminSiteSettingsApiController extends Controller
{
    public function index()
    {
        $settings = SiteSetting::firstOrCreate(
            ['id' => 1],
            ['site_name' => 'Horizon Players']
        );

        return response()->json(['settings' => $settings]);
    }

    /**
     * Public/unauthenticated site-settings read — used for branding + the contact widget
     * on the public site. Deliberately excludes provider API secrets, SMTP credentials, etc.
     * (those previously leaked to any anonymous visitor via this same route — see SiteSetting::PUBLIC_FIELDS).
     */
    public function publicSettings()
    {
        $settings = SiteSetting::firstOrCreate(
            ['id' => 1],
            ['site_name' => 'Horizon Players']
        );

        return response()->json(['settings' => $settings->publicPayload()]);
    }

    public function update(Request $request)
    {
        $settings = SiteSetting::firstOrCreate(
            ['id' => 1],
            ['site_name' => 'Horizon Players']
        );

        $validated = $request->validate([
            'site_name' => 'nullable|string',
            'logo_url' => 'nullable|string',
            'favicon_url' => 'nullable|string',
            'custom_css' => 'nullable|string',
            'colors' => 'nullable|array',
            'fonts' => 'nullable|array',
            'nav_links' => 'nullable|array',
            'landing_page_config' => 'nullable|array',
            'seo_title' => 'nullable|string',
            'seo_description' => 'nullable|string',
            'seo_keywords' => 'nullable|string',
            'header_scripts' => 'nullable|string',
            'body_scripts' => 'nullable|string',
            'footer_scripts' => 'nullable|string',
            'whatsapp_number' => 'nullable|string',
            'telegram_link' => 'nullable|string',
            'messenger_link' => 'nullable|string',
            'ghl_api_key' => 'nullable|string',
            'ghl_location_id' => 'nullable|string',
            'ghl_assigned_user_id' => 'nullable|string',
            'ghl_conversation_mode' => 'nullable|string',
            'fast_payment_base_url' => 'nullable|string',
            'fast_payment_merchant_id' => 'nullable|string',
            'fast_payment_key' => 'nullable|string',
            // game_agent_*, orion_stars_*, fast_api_*, river_pay_* intentionally no longer
            // accepted here — configure those providers in Admin > Game API Providers instead.
            // infobip_* likewise intentionally no longer accepted here — replaced by Brevo,
            // configured via Admin > Site Settings > API Keys & Secrets, which writes directly
            // to VerificationSetting through AdminVerificationApiController::updateSettings()
            // rather than through this endpoint. The columns themselves stay (legacy dispatch/
            // the game-api:migrate-* commands still read the game provider ones), this endpoint
            // just no longer lets the old Site Settings UI write to any of them.
            'smtp_host' => 'nullable|string',
            'smtp_port' => 'nullable|integer',
            'smtp_email' => 'nullable|string',
            'smtp_password' => 'nullable|string',
            'contact_display_mode' => 'nullable|in:icons_only,icons_with_text',
            'contact_button_label' => 'nullable|string|max:50',
            'contact_header_title' => 'nullable|string|max:100',
            'contact_widget_position' => 'nullable|string|max:500',
            'contact_button_color' => 'nullable|string|max:20',
            'contact_text_color' => 'nullable|string|max:20',
        ]);

        // Smart validation: a copy-pasted API key/ID/URL with a stray leading/trailing space or
        // newline is invisible in a text input and indistinguishable from "wrong credential"
        // once sent to GHL/FAST — the exact bug class a live debugging session for the Game API
        // Provider credentials just turned up (same fix applied there in
        // AdminGameApiProviderController). These are opaque secrets an admin can't eyeball for
        // whitespace, so trimming here matters even more than it does for a visible username.
        foreach (['ghl_api_key', 'ghl_location_id', 'ghl_assigned_user_id', 'fast_payment_base_url', 'fast_payment_merchant_id', 'fast_payment_key'] as $field) {
            if (isset($validated[$field]) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }
        if (!empty($validated['fast_payment_base_url'])) {
            $validated['fast_payment_base_url'] = rtrim($validated['fast_payment_base_url'], '/');
        }

        $settings->update($validated);

        // Also sync VerificationSetting model singleton
        $vSettings = \App\Models\VerificationSetting::instance();
        $vData = array_filter([
            'smtp_host' => $validated['smtp_host'] ?? null,
            'smtp_port' => $validated['smtp_port'] ?? null,
            'smtp_username' => $validated['smtp_email'] ?? null,
            'smtp_password' => $validated['smtp_password'] ?? null,
            'mail_from_address' => $validated['smtp_email'] ?? null,
        ], fn($val) => !is_null($val));

        if (!empty($vData)) {
            $vSettings->update($vData);
        }

        return response()->json(['message' => 'Site settings updated successfully.', 'settings' => $settings]);
    }
}
