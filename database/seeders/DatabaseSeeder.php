<?php

namespace Database\Seeders;

use App\Models\Game;
use App\Models\GameAccount;
use App\Models\PaymentGateway;
use App\Models\PaymentGatewayAccount;
use App\Models\RewardsConfig;
use App\Models\SiteSetting;
use App\Models\SupportChannel;
use App\Models\User;
use App\Models\WithdrawMethod;
use App\Models\WithdrawMethodField;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed Admin & Default Users
        $admin = User::firstOrCreate(
            ['email' => 'admin@horizon.gg'],
            [
                'name' => 'Admin Manager',
                'username' => 'admin',
                'password' => Hash::make('password'),
                'role' => 'admin',
                'balance' => 5000.00,
                'email_verified_at' => now(),
            ]
        );

        $user = User::firstOrCreate(
            ['email' => 'player@horizon.gg'],
            [
                'name' => 'John Player',
                'username' => 'player1',
                'password' => Hash::make('password'),
                'role' => 'user',
                'balance' => 250.00,
                'email_verified_at' => now(),
            ]
        );

        // 2. Seed All 9 Games Catalog
        $gamesData = [
          [
            'name' => 'Cash Machine',
            'description' => 'Fast-paced reel action with instant multipliers and big jackpots.',
            'image_url' => 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop',
            'download_url' => 'https://cashmachine777.com',
            'web_url' => 'https://cashmachine777.com/play',
            'android_url' => 'https://cashmachine777.com/apk',
            'ios_url' => 'https://cashmachine777.com/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Fire Kirin',
            'description' => 'Popular fish hunter game with huge jackpots and bonus rounds.',
            'image_url' => 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop',
            'download_url' => 'https://firekirin.xyz',
            'web_url' => 'https://firekirin.xyz/play',
            'android_url' => 'https://firekirin.xyz/apk',
            'ios_url' => 'https://firekirin.xyz/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Game Room',
            'description' => 'All-in-one arcade gaming hub featuring slots, fish tables, and keno.',
            'image_url' => 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop',
            'download_url' => 'https://gameroom777.com',
            'web_url' => 'https://gameroom777.com/play',
            'android_url' => 'https://gameroom777.com/apk',
            'ios_url' => 'https://gameroom777.com/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Game Vault',
            'description' => 'High payouts and exciting bonus multipliers for top players.',
            'image_url' => 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&auto=format&fit=crop',
            'download_url' => 'https://gamevault999.com',
            'web_url' => 'https://gamevault999.com/web',
            'android_url' => 'https://gamevault999.com/apk',
            'ios_url' => 'https://gamevault999.com/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Juwa',
            'description' => 'Classic sweepstakes slots & fish tables with daily rewards.',
            'image_url' => 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop',
            'download_url' => 'https://juwa777.com',
            'web_url' => 'https://juwa777.com/web',
            'android_url' => 'https://juwa777.com/android',
            'ios_url' => 'https://juwa777.com/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Milky Way',
            'description' => 'Intergalactic sweepstakes gaming experience with high multipliers.',
            'image_url' => 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop',
            'download_url' => 'https://milkywayapp.xyz',
            'web_url' => 'https://milkywayapp.xyz/play',
            'android_url' => 'https://milkywayapp.xyz/apk',
            'ios_url' => 'https://milkywayapp.xyz/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Orion Star',
            'description' => 'Fast-paced action slots, reel games and interactive fish tables.',
            'image_url' => 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop',
            'download_url' => 'https://orionstars.vip',
            'web_url' => 'https://orionstars.vip/play',
            'android_url' => 'https://orionstars.vip/apk',
            'ios_url' => 'https://orionstars.vip/ios',
            'is_active' => true,
          ],
          [
            'name' => 'Panda Master',
            'description' => 'Vibrant graphics, progressive jackpots, and instant prizes.',
            'image_url' => 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop',
            'download_url' => 'https://pandamaster.vip',
            'web_url' => 'https://pandamaster.vip/web',
            'android_url' => 'https://pandamaster.vip/apk',
            'ios_url' => 'https://pandamaster.vip/ios',
            'is_active' => true,
          ],
          [
            'name' => 'River Sweeps',
            'description' => 'Premier sweepstakes casino games with spinning reels and bonus wins.',
            'image_url' => 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop',
            'download_url' => 'https://riversweeps.org',
            'web_url' => 'https://riversweeps.org/play',
            'android_url' => 'https://riversweeps.org/apk',
            'ios_url' => 'https://riversweeps.org/ios',
            'is_active' => true,
          ],
        ];

        foreach ($gamesData as $gData) {
            $game = Game::firstOrCreate(['name' => $gData['name']], $gData);

            // Create 3 demo accounts for each game
            for ($i = 1; $i <= 3; $i++) {
                GameAccount::firstOrCreate(
                    [
                        'game_id' => $game->id,
                        'username' => strtolower(str_replace(' ', '', $game->name)) . "_user{$i}"
                    ],
                    [
                        'password_hash' => 'pass1234',
                        'status' => $i === 1 ? 'assigned' : 'available',
                        'assigned_to' => $i === 1 ? $user->id : null,
                    ]
                );
            }
        }

        // 3. Seed Payment Gateways
        $gateways = [
            [
                'name' => 'Cash App',
                'address' => '$HorizonPay',
                'minimum_amount' => 10.00,
                'logo_url' => 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=200&auto=format&fit=crop',
                'instructions' => 'Send payment to our Cash App tag. Upload screenshot as deposit proof.',
                'is_active' => true,
            ],
            [
                'name' => 'Zelle',
                'address' => 'pay@horizon.gg',
                'minimum_amount' => 20.00,
                'logo_url' => 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=200&auto=format&fit=crop',
                'instructions' => 'Send payment via Zelle to pay@horizon.gg.',
                'is_active' => true,
            ],
            [
                'name' => 'Venmo',
                'address' => '@HorizonPay',
                'minimum_amount' => 10.00,
                'logo_url' => 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200&auto=format&fit=crop',
                'instructions' => 'Send payment via Venmo. Include your username in payment note.',
                'is_active' => true,
            ],
        ];

        foreach ($gateways as $gwData) {
            $gw = PaymentGateway::firstOrCreate(['name' => $gwData['name']], $gwData);
            PaymentGatewayAccount::firstOrCreate(
                ['gateway_id' => $gw->id, 'account_number' => $gwData['address']],
                [
                    'account_name' => $gwData['name'] . ' Official Account',
                    'priority_order' => 1,
                    'is_active' => true,
                ]
            );
        }

        // 4. Seed Withdraw Methods
        $withdrawMethods = [
            [
                'name' => 'Cash App Withdrawal',
                'code' => 'cashapp',
                'minimum_amount' => 20.00,
                'maximum_amount' => 2000.00,
                'fee_fixed' => 0.00,
                'fee_percentage' => 0.00,
                'processing_time' => 'Instant - 15 mins',
                'is_active' => true,
                'sort_order' => 1,
                'fields' => [
                    ['field_name' => 'cashtag', 'field_label' => 'Cash App Tag ($Cashtag)', 'field_type' => 'text', 'placeholder' => '$yourcashtag', 'is_required' => true],
                ]
            ],
            [
                'name' => 'Zelle Transfer',
                'code' => 'zelle',
                'minimum_amount' => 20.00,
                'maximum_amount' => 5000.00,
                'fee_fixed' => 0.00,
                'fee_percentage' => 0.00,
                'processing_time' => '10 - 30 mins',
                'is_active' => true,
                'sort_order' => 2,
                'fields' => [
                    ['field_name' => 'zelle_contact', 'field_label' => 'Zelle Email or Phone', 'field_type' => 'text', 'placeholder' => 'email@example.com or phone', 'is_required' => true],
                    ['field_name' => 'account_name', 'field_label' => 'Full Account Name', 'field_type' => 'text', 'placeholder' => 'John Doe', 'is_required' => true],
                ]
            ],
            [
                'name' => 'Venmo Transfer',
                'code' => 'venmo',
                'minimum_amount' => 20.00,
                'maximum_amount' => 2000.00,
                'fee_fixed' => 0.00,
                'fee_percentage' => 0.00,
                'processing_time' => '10 - 30 mins',
                'is_active' => true,
                'sort_order' => 3,
                'fields' => [
                    ['field_name' => 'venmo_handle', 'field_label' => 'Venmo Handle (@username)', 'field_type' => 'text', 'placeholder' => '@username', 'is_required' => true],
                ]
            ],
        ];

        foreach ($withdrawMethods as $wmData) {
            $fields = $wmData['fields'];
            unset($wmData['fields']);
            $wm = WithdrawMethod::firstOrCreate(['code' => $wmData['code']], $wmData);

            foreach ($fields as $idx => $f) {
                WithdrawMethodField::firstOrCreate(
                    ['method_id' => $wm->id, 'field_name' => $f['field_name']],
                    array_merge($f, ['sort_order' => $idx + 1])
                );
            }
        }

        // 5. Seed Rewards Config
        $rewards = [
            ['key' => 'welcome_bonus', 'value' => 10.00, 'description' => 'Free $10 sign up bonus for new players', 'is_active' => true],
            ['key' => 'daily_checkin', 'value' => 5.00, 'description' => 'Daily $5 free play login reward', 'is_active' => true],
            ['key' => 'referral_reward', 'value' => 15.00, 'description' => 'Refer a friend and get $15 bonus credit', 'is_active' => true],
        ];

        foreach ($rewards as $r) {
            RewardsConfig::firstOrCreate(['key' => $r['key']], $r);
        }

        // 6. Seed Site Settings & Game API Secrets Data
        SiteSetting::updateOrCreate(
            ['id' => 1],
            [
                'site_name' => 'Horizon Players',
                'seo_title' => 'Horizon Players - #1 Trusted Gaming Platform',
                'seo_description' => 'Sweepstakes, fish games, slots & more — all in one place. Register now and start winning today.',
                'whatsapp_number' => '+1234567890',
                'telegram_link' => 'https://t.me/horizon_support',
                'messenger_link' => 'https://m.me/horizon',
                'game_agent_base_url' => 'https://agent.gameprovider.com',
                'game_agent_id' => '10045',
                'game_agent_secret_key' => 'secret_key_12345',
                'orion_stars_base_url' => 'https://orionstars.vip:8033',
                'orion_stars_agent_name' => 'horizon_agent',
                'orion_stars_agent_password' => 'horizon_pass123',
                'fast_api_base_url' => 'https://api.fastprovider.com',
                'fast_api_app_id' => 'app_123456',
                'fast_api_app_secret' => 'app_secret_123456',
                'fast_api_agent_account' => 'agent_account',
                'fast_api_agent_password' => 'agent_password',
                'river_pay_base_url' => 'http://river-pay.com',
                'river_pay_login' => 'river_login',
                'river_pay_password' => 'river_password',
                'ghl_api_key' => 'ghl_key_12345',
                'ghl_location_id' => 'loc_12345',
                'ghl_assigned_user_id' => 'usr_12345',
            ]
        );

        // 7. Seed Support Channels
        $channels = [
            ['name' => 'Live Chat Support', 'icon' => 'message-square', 'link' => '#', 'sort_order' => 1, 'is_active' => true],
            ['name' => 'Telegram Official', 'icon' => 'send', 'link' => 'https://t.me/horizon_support', 'sort_order' => 2, 'is_active' => true],
            ['name' => 'WhatsApp Support', 'icon' => 'phone', 'link' => 'https://wa.me/1234567890', 'sort_order' => 3, 'is_active' => true],
        ];

        foreach ($channels as $ch) {
            SupportChannel::firstOrCreate(['name' => $ch['name']], $ch);
        }

        // 8. Seed Game API Providers module (needs the games seeded in step 2)
        $this->call(GameApiProviderSeeder::class);
    }
}
