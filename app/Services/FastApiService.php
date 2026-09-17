<?php

namespace App\Services;

use App\Exceptions\FastApiException;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Client for FastAPI third-party integration (account creation, deposits, withdrawals, balances, trade logs).
 */
class FastApiService
{
    /**
     * 1. Agent Login
     * Path: /fast/agent/login
     *
     * @param string|null $account
     * @param string|null $passwd
     * @param string|null $requestid
     * @return array
     * @throws FastApiException
     * @throws Exception
     */
    public static function agentLogin(
        ?string $account = null,
        ?string $passwd = null,
        ?string $requestid = null,
        ?string $baseUrl = null
    ): array {
        $siteSetting = \App\Models\SiteSetting::first();
        $account = $account ?? $siteSetting?->fast_api_agent_account ?: config('services.fast_api.agent_account');
        $passwd = $passwd ?? $siteSetting?->fast_api_agent_password ?: config('services.fast_api.agent_password');

        if (empty($account) || empty($passwd)) {
            throw new Exception('FastAPI agent account and password must be provided or configured in Admin Site Settings.');
        }

        $requestid = $requestid ?? self::generateRequestId();
        $timestamp = self::getTimestamp();
        $secretKey = $siteSetting?->fast_api_app_secret ?: (config('services.fast_api.appsecret') ?: $passwd);

        $params = [
            'requestid' => $requestid,
            'timestamp' => $timestamp,
            'account' => $account,
            'passwd' => $passwd,
        ];

        $params['sign'] = self::sign($params, $secretKey);

        $response = self::request('/fast/agent/login', $params, $baseUrl);
        $data = $response['data'] ?? [];

        if (!empty($data['appid']) && !empty($data['appsecret_encrypted'])) {
            $decryptedSecret = self::aesDecrypt($data['appsecret_encrypted'], $passwd);
            if ($decryptedSecret) {
                self::cacheAppCredentials($data['appid'], $decryptedSecret);
                $data['appsecret_decrypted'] = $decryptedSecret;
            }
        }

        return $data;
    }

    /**
     * 2. Create Player
     * Path: /fast/user/create
     */
    public static function createUser(
        string $account,
        string $passwd,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null,
        ?string $baseUrl = null
    ): array {
        self::validateAccount($account);
        self::validatePassword($passwd);

        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'passwd' => $passwd,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/create', $params, $baseUrl);
        return $res['data'] ?? [];
    }

    /**
     * 3. Deposit
     * Path: /fast/user/deposit
     */
    public static function deposit(
        string $account,
        string $amount,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null,
        ?string $baseUrl = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'amount' => $amount,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/deposit', $params, $baseUrl);
        return $res['data'] ?? [];
    }

    /**
     * 4. Withdrawal
     * Path: /fast/user/withdrawal
     */
    public static function withdrawal(
        string $account,
        string $amount,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null,
        ?string $baseUrl = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'amount' => $amount,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/withdrawal', $params, $baseUrl);
        return $res['data'] ?? [];
    }

    /**
     * 5. Get Balance
     * Path: /fast/user/balance
     */
    public static function getBalance(
        string $account,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null,
        ?string $baseUrl = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/balance', $params, $baseUrl);
        return $res['data'] ?? [];
    }

    /**
     * 6. Get Balance (With Password)
     * Path: /fast/user/balanceWithPasswd
     */
    public static function getBalanceWithPasswd(
        string $account,
        string $passwd,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'passwd' => $passwd,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/balanceWithPasswd', $params);
        return $res['data'] ?? [];
    }

    /**
     * 7. Change Password
     * Path: /fast/user/updatePasswd
     */
    public static function updatePasswd(
        string $account,
        string $passwd,
        string $newPasswd,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null
    ): array {
        self::validateAccount($account);
        self::validatePassword($newPasswd);

        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'passwd' => $passwd,
            'new_passwd' => $newPasswd,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        return self::request('/fast/user/updatePasswd', $params);
    }

    /**
     * 8. Get Trade List
     * Path: /fast/user/tradeList
     */
    public static function tradeList(
        string $account,
        string $startDate,
        string $endDate,
        int $page = 0,
        int $pageNum = 20,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'page' => (string) $page,
            'page_num' => (string) $pageNum,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/tradeList', $params);
        return $res['data'] ?? [];
    }

    /**
     * 9. Get Gamelog List
     * Path: /fast/user/gameLogList
     */
    public static function gameLogList(
        string $account,
        ?string $appid = null,
        ?string $appSecret = null,
        ?string $requestid = null
    ): array {
        $appid = $appid ?? self::getAppId();
        $appSecret = $appSecret ?? self::getAppSecret();

        $params = [
            'requestid' => $requestid ?? self::generateRequestId(),
            'appid' => $appid,
            'timestamp' => self::getTimestamp(),
            'account' => $account,
        ];

        $params['sign'] = self::sign($params, $appSecret);

        $res = self::request('/fast/user/gameLogList', $params);
        return $res['data'] ?? [];
    }

    /**
     * Signature Code Example implementation:
     * 1. Exclude the sign field from parameters.
     * 2. Format values (arrays -> json_encode, bool -> var_export).
     * 3. Sort remaining fields in ascending order by parameter name.
     * 4. Concatenate key=value using &.
     * 5. Append appSecret and generate MD5 hash.
     */
    public static function sign(array $data, string $appSecret): string
    {
        unset($data['sign']);

        $params = array_map(function ($value) {
            if (is_array($value)) {
                return json_encode($value);
            } elseif (is_bool($value)) {
                return var_export($value, true);
            }
            return (string) $value;
        }, $data);

        ksort($params);

        $strArr = [];
        foreach ($params as $key => $value) {
            $strArr[] = $key . '=' . $value;
        }

        return md5(implode('&', $strArr) . $appSecret);
    }

    /**
     * AES Decryption of appsecret_encrypted:
     * 1. base64_decode appsecret_encrypted.
     * 2. Extract first 16 bytes as IV, rest as encrypted data.
     * 3. Convert agent password to lowercase, apply MD5 hashing twice to generate key: md5(md5(strtolower($passwd))).
     * 4. AES-256-CBC decrypt.
     */
    public static function aesDecrypt(string $encryptedBase64, string $agentPassword): ?string
    {
        $key = md5(md5(strtolower($agentPassword)));
        $data = base64_decode($encryptedBase64);

        if (strlen($data) <= 16) {
            return null;
        }

        $iv = substr($data, 0, 16);
        $encrypted = substr($data, 16);

        $decrypted = openssl_decrypt($encrypted, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        return $decrypted !== false ? rtrim($decrypted, "\0..\32") : null;
    }

    public static function cacheAppCredentials(string $appid, string $appSecret, int $ttl = 86400): void
    {
        Cache::put('fast_api_app_id', $appid, $ttl);
        Cache::put('fast_api_app_secret', $appSecret, $ttl);
    }

    private static function getAppId(): string
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $id = Cache::get('fast_api_app_id') ?? $siteSetting?->fast_api_app_id ?: config('services.fast_api.appid');
        if (empty($id)) {
            throw new Exception('FastAPI appid is not set. Run agentLogin() first or configure in Admin Site Settings.');
        }
        return $id;
    }

    private static function getAppSecret(): string
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $secret = Cache::get('fast_api_app_secret') ?? $siteSetting?->fast_api_app_secret ?: config('services.fast_api.appsecret');
        if (empty($secret)) {
            throw new Exception('FastAPI appsecret is not set. Run agentLogin() first or configure in Admin Site Settings.');
        }
        return $secret;
    }

    /**
     * The spec requires "up to 64 alphanumeric characters" — Str::uuid() looks unique
     * enough but its hyphens violate that format, so use Str::random() instead (Laravel's
     * default charset is already letters+digits only).
     */
    private static function generateRequestId(): string
    {
        return Str::random(32);
    }

    private static function getTimestamp(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    private static function validateAccount(string $account): void
    {
        if (!preg_match('/^[a-zA-Z0-9]{3,16}$/', $account)) {
            throw new Exception('Player account must be 3–16 characters containing only letters and numbers.');
        }
    }

    private static function validatePassword(string $passwd): void
    {
        if (strlen($passwd) < 6 || strlen($passwd) > 16) {
            throw new Exception('Player password must be between 6 and 16 characters.');
        }
    }

    /**
     * Send HTTP POST request to FastAPI endpoint.
     *
     * @throws FastApiException
     * @throws Exception
     */
    private static function request(string $path, array $params = [], ?string $overrideBaseUrl = null): array
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $baseUrl = $overrideBaseUrl ?: ($siteSetting?->fast_api_base_url ?: config('services.fast_api.base_url', ''));
        if (empty($baseUrl)) {
            throw new Exception('FastAPI base_url is not configured in Admin Site Settings.');
        }

        $url = rtrim($baseUrl, '/') . '/' . ltrim($path, '/');

        $response = Http::asForm()
            ->timeout(15)
            ->post($url, $params);

        if ($response->failed()) {
            throw new Exception("FastAPI request to [{$path}] failed: " . $response->status() . ' ' . $response->body());
        }

        $body = $response->json();

        if (!is_array($body) || !array_key_exists('code', $body)) {
            throw new Exception("FastAPI returned invalid response for [{$path}]: " . $response->body());
        }

        $code = (int) $body['code'];
        if ($code !== 200 && $code !== 0) {
            throw new FastApiException($code, $body['message'] ?? $body['msg'] ?? null);
        }

        return $body;
    }
}
