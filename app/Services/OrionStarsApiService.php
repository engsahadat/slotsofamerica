<?php

namespace App\Services;

use App\Exceptions\OrionStarsApiException;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Client for Orion Stars OS Terminal API v1.2 (https://orionstars.vip:8033/ws/service.ashx)
 * 
 * Rules:
 * 1. Sign calculation: md5(agentName.toLower() + time.toString() + agentKey.toLower())
 * 2. String length must not exceed 63 characters.
 * 3. Passwords must be MD5 encrypted strings (32-character hex).
 */
class OrionStarsApiService
{
    /**
     * 1. Agent Login
     * URL: /ws/service.ashx?action=agentLogin
     *
     * @param string|null $agentName
     * @param string|null $agentPasswd MD5 encrypted password (or raw text to be MD5 hashed)
     * @return array Response payload containing 'agentKey', 'Balance', etc.
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function agentLogin(?string $agentName = null, ?string $agentPasswd = null, ?string $baseUrl = null): array
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $agentName = $agentName ?? $siteSetting?->orion_stars_agent_name ?: config('services.orion_stars.agent_name');
        $agentPasswd = $agentPasswd ?? $siteSetting?->orion_stars_agent_password ?: config('services.orion_stars.agent_password');

        if (empty($agentName) || empty($agentPasswd)) {
            throw new Exception('Orion Stars API agentName and agentPasswd must be provided or configured in Admin Site Settings.');
        }

        self::validateStringLength($agentName, 'agentName');

        $time = self::getTimestamp();
        $formattedPasswd = self::formatPassword($agentPasswd);

        $params = [
            'agentName' => $agentName,
            'agentPasswd' => $formattedPasswd,
            'time' => $time,
        ];

        $response = self::request('agentLogin', $params, $baseUrl);

        if (!empty($response['agentKey'])) {
            self::cacheAgentKey($agentName, $response['agentKey']);
        }

        return $response;
    }

    /**
     * 2. Register User Account
     * URL: /ws/service.ashx?action=registerUser
     *
     * @param string $account Player account name (6 to 32 chars)
     * @param string $passwd Player password (MD5 encrypted or raw text)
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function registerUser(
        string $account,
        string $passwd,
        ?string $agentName = null,
        ?string $agentKey = null,
        ?string $baseUrl = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $formattedPasswd = self::formatPassword($passwd);
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('registerUser', [
            'account' => $account,
            'passwd' => $formattedPasswd,
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ], $baseUrl);
    }

    /**
     * 3. Query User Information
     * URL: /ws/service.ashx?action=queryInfo
     *
     * @param string $account Player account name
     * @param string $passwd Player password
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array Response contains 'agentBalance', 'gameId', 'userbalance', 'webLoginUrl'
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function queryInfo(
        string $account,
        string $passwd,
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $formattedPasswd = self::formatPassword($passwd);
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('queryInfo', [
            'account' => $account,
            'passwd' => $formattedPasswd,
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * 4. Change The Password Of User
     * URL: /ws/service.ashx?action=changePasswd
     *
     * @param string $account Player account name
     * @param string $passwd Old password
     * @param string $passwdNew New password
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function changePasswd(
        string $account,
        string $passwd,
        string $passwdNew,
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $formattedPasswd = self::formatPassword($passwd);
        $formattedPasswdNew = self::formatPassword($passwdNew);
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('changePasswd', [
            'account' => $account,
            'passwd' => $formattedPasswd,
            'passwdNew' => $formattedPasswdNew,
            'passwdnew' => $formattedPasswdNew, // Send both keys for spec compatibility
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * 5. Recharge
     * URL: /ws/service.ashx?action=recharge
     *
     * @param string $account Player account name
     * @param int $amount Amount to recharge
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function recharge(
        string $account,
        int $amount,
        ?string $agentName = null,
        ?string $agentKey = null,
        ?string $baseUrl = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('recharge', [
            'account' => $account,
            'amount' => $amount,
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ], $baseUrl);
    }

    /**
     * 6. Redeem
     * URL: /ws/service.ashx?action=redeem
     *
     * @param string $account Player account name
     * @param int $amount Amount to redeem
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function redeem(
        string $account,
        int $amount,
        ?string $agentName = null,
        ?string $agentKey = null,
        ?string $baseUrl = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('redeem', [
            'account' => $account,
            'amount' => $amount,
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ], $baseUrl);
    }

    /**
     * 7. Get download code
     * URL: /ws/service.ashx?action=getDownloadCode
     *
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array Response contains 'downloadCode'
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function getDownloadCode(
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('getDownloadCode', [
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * 8. Get trade record
     * URL: /ws/service.ashx?action=getTradeRecord
     *
     * @param string $account Player account name
     * @param string $fromDate Start date (e.g. '2023-04-01 00:00:00')
     * @param string $toDate End date (e.g. '2023-05-01 00:00:00')
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array Response contains 'data' array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function getTradeRecord(
        string $account,
        string $fromDate,
        string $toDate,
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('getTradeRecord', [
            'account' => $account,
            'agentName' => $agentName,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'fromdate' => $fromDate, // Compatibility key
            'todate' => $toDate,     // Compatibility key
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * 9. Get Jp record
     * URL: /ws/service.ashx?action=getJpRecord
     *
     * @param string $account Player account name
     * @param string $fromDate Start date
     * @param string $toDate End date
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array Response contains 'data' array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function getJpRecord(
        string $account,
        string $fromDate,
        string $toDate,
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('getJpRecord', [
            'account' => $account,
            'agentName' => $agentName,
            'fromDate' => $fromDate,
            'toDate' => $toDate,
            'fromdate' => $fromDate, // Compatibility key
            'todate' => $toDate,     // Compatibility key
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * 10. Get game record
     * URL: /ws/service.ashx?action=getGameRecord
     *
     * @param string $account Player account name
     * @param string|null $agentName
     * @param string|null $agentKey
     * @return array Response contains 'data' array
     * @throws OrionStarsApiException
     * @throws Exception
     */
    public static function getGameRecord(
        string $account,
        ?string $agentName = null,
        ?string $agentKey = null
    ): array {
        self::validateAccount($account);
        $agentName = $agentName ?? self::getAgentName();
        $time = self::getTimestamp();
        $sign = self::generateSign($agentName, $time, $agentKey);

        return self::request('getGameRecord', [
            'account' => $account,
            'agentName' => $agentName,
            'time' => $time,
            'sign' => $sign,
        ]);
    }

    /**
     * Calculate sign according to OS Terminal API rule:
     * sign = md5(agentName.toLower() + time.toString() + agentKey.toLower())
     *
     * @param string $agentName
     * @param string $time
     * @param string|null $agentKey
     * @return string 32-character hex lowercase MD5 string
     * @throws Exception
     */
    public static function generateSign(string $agentName, string $time, ?string $agentKey = null): string
    {
        $resolvedAgentKey = $agentKey ?? self::getOrFetchAgentKey($agentName);

        if (empty($resolvedAgentKey)) {
            throw new Exception("Unable to calculate sign: agentKey is missing for agent [{$agentName}].");
        }

        $raw = strtolower($agentName) . $time . strtolower($resolvedAgentKey);
        return md5($raw);
    }

    /**
     * Format password: if it's already a 32-char hex MD5 string, return it lowercased,
     * otherwise compute lowercased md5($passwd).
     */
    public static function formatPassword(string $passwd): string
    {
        if (preg_match('/^[a-fA-F0-9]{32}$/', $passwd)) {
            return strtolower($passwd);
        }

        return md5($passwd);
    }

    /**
     * Retrieve cached agentKey or perform agentLogin to fetch a fresh one.
     */
    public static function getOrFetchAgentKey(string $agentName): string
    {
        $cacheKey = self::getCacheKey($agentName);
        $cachedKey = Cache::get($cacheKey);

        if ($cachedKey) {
            return $cachedKey;
        }

        $loginResult = self::agentLogin($agentName);
        return $loginResult['agentKey'] ?? '';
    }

    /**
     * Store agentKey in Laravel cache.
     */
    public static function cacheAgentKey(string $agentName, string $agentKey, int $ttlSeconds = 86400): void
    {
        Cache::put(self::getCacheKey($agentName), $agentKey, $ttlSeconds);
    }

    /**
     * Clear cached agentKey for an agent.
     */
    public static function clearAgentKey(string $agentName): void
    {
        Cache::forget(self::getCacheKey($agentName));
    }

    /**
     * Validate string length according to API Note 2 (<= 63 bits/chars).
     */
    private static function validateStringLength(string $val, string $paramName): void
    {
        if (strlen($val) > 63) {
            throw new Exception("Parameter [{$paramName}] length must not exceed 63 characters.");
        }
    }

    /**
     * Validate player account string length (6 to 32 chars).
     */
    private static function validateAccount(string $account): void
    {
        self::validateStringLength($account, 'account');

        $len = strlen($account);
        if ($len < 6 || $len > 32) {
            throw new Exception("Account length must be between 6 and 32 characters.");
        }
    }

    private static function getAgentName(): string
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $name = $siteSetting?->orion_stars_agent_name ?: config('services.orion_stars.agent_name');
        if (empty($name)) {
            throw new Exception('Orion Stars agent_name is not configured. Please enter Agent Name in Admin Site Settings.');
        }
        return $name;
    }

    private static function getTimestamp(): string
    {
        return (string) round(microtime(true) * 1000);
    }

    private static function getCacheKey(string $agentName): string
    {
        return 'orion_stars_agent_key_' . strtolower($agentName);
    }

    /**
     * Execute HTTP POST request to Orion Stars endpoint and parse response.
     *
     * @throws OrionStarsApiException
     * @throws Exception
     */
    private static function request(string $action, array $params = [], ?string $overrideBaseUrl = null): array
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $baseUrl = $overrideBaseUrl ?: ($siteSetting?->orion_stars_base_url ?: config('services.orion_stars.base_url', 'https://orionstars.vip:8033'));
        $endpointUrl = rtrim($baseUrl, '/') . '/ws/service.ashx?action=' . urlencode($action);

        $response = Http::asForm()
            ->timeout(15)
            ->post($endpointUrl, $params);

        if ($response->failed()) {
            throw new Exception("Orion Stars API request to [{$action}] failed: " . $response->status() . ' ' . $response->body());
        }

        $body = $response->json();

        if (!is_array($body) || !array_key_exists('code', $body)) {
            throw new Exception("Orion Stars API returned invalid response for [{$action}]: " . $response->body());
        }

        $code = (int) $body['code'];
        if ($code !== 200) {
            throw new OrionStarsApiException($code, $body['msg'] ?? null);
        }

        return $body;
    }
}
