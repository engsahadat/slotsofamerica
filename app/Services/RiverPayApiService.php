<?php

namespace App\Services;

use App\Exceptions\RiverPayApiException;
use Exception;
use Illuminate\Support\Facades\Http;

/**
 * Client for River Pay API (http://river-pay.com/api).
 */
class RiverPayApiService
{
    /**
     * 1. Create account
     * URL: /api/create
     *
     * @param string $amount Mandatory initial amount
     * @param int $bounceback Optional (1 or 0, default 0)
     * @param string|null $login Agent login
     * @param string|null $password Agent password
     * @return array Response data containing 'code'
     * @throws RiverPayApiException
     * @throws Exception
     */
    public static function createAccount(
        string $amount,
        int $bounceback = 0,
        ?string $login = null,
        ?string $password = null,
        ?string $baseUrl = null
    ): array {
        $login = $login ?? self::getLogin();
        $password = $password ?? self::getPassword();

        $params = [
            'login' => $login,
            'password' => $password,
            'amount' => $amount,
            'bounceback' => $bounceback,
        ];

        return self::request('create', $params, $baseUrl);
    }

    /**
     * 2. Deposit account
     * URL: /api/deposit
     *
     * @param string $code Account code
     * @param string $amount Deposit amount
     * @param int $bounceback Optional (1 or 0, default 0)
     * @param string|null $login
     * @param string|null $password
     * @return array Response data containing 'code' and updated 'balance'
     * @throws RiverPayApiException
     * @throws Exception
     */
    public static function deposit(
        string $code,
        string $amount,
        int $bounceback = 0,
        ?string $login = null,
        ?string $password = null,
        ?string $baseUrl = null
    ): array {
        $login = $login ?? self::getLogin();
        $password = $password ?? self::getPassword();

        $params = [
            'login' => $login,
            'password' => $password,
            'code' => $code,
            'amount' => $amount,
            'bounceback' => $bounceback,
        ];

        return self::request('deposit', $params, $baseUrl);
    }

    /**
     * 3. Withdraw from account
     * URL: /api/withdrawal
     *
     * @param string $code Account code
     * @param string $amount Withdrawal amount
     * @param string|null $login
     * @param string|null $password
     * @return array Response data containing 'code' and updated 'balance'
     * @throws RiverPayApiException
     * @throws Exception
     */
    public static function withdrawal(
        string $code,
        string $amount,
        ?string $login = null,
        ?string $password = null,
        ?string $baseUrl = null
    ): array {
        $login = $login ?? self::getLogin();
        $password = $password ?? self::getPassword();

        $params = [
            'login' => $login,
            'password' => $password,
            'code' => $code,
            'amount' => $amount,
        ];

        return self::request('withdrawal', $params, $baseUrl);
    }

    /**
     * 4. Close account
     * URL: /api/close
     *
     * @param string $code Account code
     * @param string|null $login
     * @param string|null $password
     * @return array Response data containing 'code'
     * @throws RiverPayApiException
     * @throws Exception
     */
    public static function closeAccount(
        string $code,
        ?string $login = null,
        ?string $password = null
    ): array {
        $login = $login ?? self::getLogin();
        $password = $password ?? self::getPassword();

        $params = [
            'login' => $login,
            'password' => $password,
            'code' => $code,
        ];

        return self::request('close', $params);
    }

    /**
     * 5. Get account balance
     * URL: /api/balance
     *
     * @param string $code Account code
     * @param string|null $login
     * @param string|null $password
     * @return array Response data containing 'balance'
     * @throws RiverPayApiException
     * @throws Exception
     */
    public static function getBalance(
        string $code,
        ?string $login = null,
        ?string $password = null,
        ?string $baseUrl = null
    ): array {
        $login = $login ?? self::getLogin();
        $password = $password ?? self::getPassword();

        $params = [
            'login' => $login,
            'password' => $password,
            'code' => $code,
        ];

        return self::request('balance', $params, $baseUrl);
    }

    private static function getLogin(): string
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $login = $siteSetting?->river_pay_login ?: config('services.river_pay.login');
        if (empty($login)) {
            throw new Exception('River Pay login is not configured. Set login in Admin Site Settings.');
        }
        return $login;
    }

    private static function getPassword(): string
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $pass = $siteSetting?->river_pay_password ?: config('services.river_pay.password');
        if (empty($pass)) {
            throw new Exception('River Pay password is not configured. Set password in Admin Site Settings.');
        }
        return $pass;
    }

    /**
     * Execute HTTP request to River Pay API.
     *
     * @throws RiverPayApiException
     * @throws Exception
     */
    private static function request(string $action, array $params = [], ?string $overrideBaseUrl = null): array
    {
        $siteSetting = \App\Models\SiteSetting::first();
        $baseUrl = $overrideBaseUrl ?: ($siteSetting?->river_pay_base_url ?: config('services.river_pay.base_url', 'http://river-pay.com'));
        $url = rtrim($baseUrl, '/') . '/api/' . ltrim($action, '/');

        $response = Http::timeout(15)->get($url, $params);

        if ($response->failed()) {
            throw new Exception("River Pay API request to [{$action}] failed: " . $response->status() . ' ' . $response->body());
        }

        $body = $response->json();

        if (!is_array($body) || !array_key_exists('STATUS', $body)) {
            throw new Exception("River Pay API returned invalid response format for [{$action}]: " . $response->body());
        }

        $status = (int) $body['STATUS'];
        if ($status !== 0) {
            $errorMessage = $body['data']['message'] ?? null;
            throw new RiverPayApiException($status, $errorMessage);
        }

        return $body['data'] ?? [];
    }
}
