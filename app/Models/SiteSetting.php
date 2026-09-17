<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SiteSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'site_name',
        'logo_url',
        'favicon_url',
        'custom_css',
        'colors',
        'fonts',
        'nav_links',
        'landing_page_config',
        'seo_title',
        'seo_description',
        'seo_keywords',
        'header_scripts',
        'body_scripts',
        'footer_scripts',
        'whatsapp_number',
        'telegram_link',
        'messenger_link',
        'ghl_api_key',
        'ghl_location_id',
        'ghl_assigned_user_id',
        'ghl_conversation_mode',
        'game_agent_base_url',
        'game_agent_id',
        'game_agent_secret_key',
        'orion_stars_base_url',
        'orion_stars_agent_name',
        'orion_stars_agent_password',
        'fast_api_base_url',
        'fast_api_app_id',
        'fast_api_app_secret',
        'fast_api_agent_account',
        'fast_api_agent_password',
        'river_pay_base_url',
        'river_pay_login',
        'river_pay_password',
        'fast_payment_base_url',
        'fast_payment_merchant_id',
        'fast_payment_key',
        'contact_display_mode',
        'contact_button_label',
        'contact_header_title',
        'contact_widget_position',
        'contact_button_color',
        'contact_text_color',
        'redeem_min_amount',
        'redeem_max_amount',
        'withdraw_daily_limit',
    ];

    /** Fields the public/unauthenticated site-settings endpoint may expose — everything else
     * (provider API secrets, SMTP credentials, etc.) is admin-only. See publicPayload(). */
    public const PUBLIC_FIELDS = [
        'id',
        'site_name', 'logo_url', 'favicon_url', 'colors', 'fonts',
        'seo_title', 'seo_description', 'seo_keywords',
        'header_scripts', 'body_scripts', 'footer_scripts', 'custom_css', 'nav_links',
        'landing_page_config',
        'whatsapp_number', 'telegram_link', 'messenger_link',
        'contact_display_mode', 'contact_button_label', 'contact_header_title',
        'contact_widget_position', 'contact_button_color', 'contact_text_color',
    ];

    public function publicPayload(): array
    {
        return $this->only(self::PUBLIC_FIELDS);
    }

    protected $casts = [
        'colors' => 'array',
        'fonts' => 'array',
        'nav_links' => 'array',
        'landing_page_config' => 'array',
        'redeem_min_amount' => 'float',
        'redeem_max_amount' => 'float',
        'withdraw_daily_limit' => 'float',
    ];

    public static function instance(): self
    {
        return static::firstOrCreate(['id' => 1], [
            'site_name' => 'Horizon Players',
        ]);
    }
}
