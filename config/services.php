<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services & Integration Settings
    |--------------------------------------------------------------------------
    |
    | Note: Credentials for Infobip, Game Agent, Orion Stars, Fast API, and
    | River Pay are dynamically fetched from the Database (SiteSetting &
    | VerificationSetting models) managed via the Admin Dashboard.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Brevo (SMS + Email OTP delivery) credentials are managed entirely through
    // VerificationSetting (Admin Dashboard -> Site Settings -> API Keys & Secrets) — no static
    // .env fallback here, matching FAST Payment's pattern elsewhere in this file.

    // Managed dynamically in Admin Dashboard -> Game API Secrets
    'game_agent' => [
        'base_url' => null,
        'agent_id' => null,
        'secret_key' => null,
    ],

    // Managed dynamically in Admin Dashboard -> Game API Secrets
    'orion_stars' => [
        'base_url' => 'https://orionstars.vip:8033',
        'agent_name' => null,
        'agent_password' => null,
    ],

    // Managed dynamically in Admin Dashboard -> Game API Secrets
    'fast_api' => [
        'base_url' => null,
        'appid' => null,
        'appsecret' => null,
        'agent_account' => null,
        'agent_password' => null,
    ],

    // Managed dynamically in Admin Dashboard -> Game API Secrets
    'river_pay' => [
        'base_url' => 'http://river-pay.com',
        'login' => null,
        'password' => null,
    ],

];
