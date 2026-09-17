<?php

namespace App\Services;

use App\Models\User;
use Exception;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class JwtAuthService
{
    private static function getSecretKey(): string
    {
        $key = config('app.key');
        if (str_starts_with($key, 'base64:')) {
            return base64_decode(substr($key, 7));
        }
        return $key ?: 'horizon-secret-jwt-key-2026';
    }

    public static function generateToken(User $user): string
    {
        $issuedAt = time();
        $expirationTime = $issuedAt + (60 * 60 * 24 * 7); // 7 days
        $jti = (string) Str::uuid();

        $payload = [
            'iss' => config('app.url', 'http://localhost'),
            'iat' => $issuedAt,
            'exp' => $expirationTime,
            'jti' => $jti,
            'sub' => (string) $user->id,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ];

        return JWT::encode($payload, self::getSecretKey(), 'HS256');
    }

    public static function validateToken(string $token): ?User
    {
        try {
            $decoded = JWT::decode($token, new Key(self::getSecretKey(), 'HS256'));
            if (!$decoded || !isset($decoded->sub)) {
                return null;
            }

            // Check if specific token JTI is blacklisted
            if (isset($decoded->jti) && Cache::has(self::getBlacklistCacheKey($decoded->jti))) {
                return null;
            }

            $user = User::find($decoded->sub);
            if (!$user || $user->is_flagged) {
                return null;
            }

            // Check if all tokens for this user were globally revoked (e.g. password reset or suspension)
            $revokedAt = Cache::get(self::getUserRevocationCacheKey($user->id));
            if ($revokedAt && isset($decoded->iat) && $decoded->iat <= $revokedAt) {
                return null;
            }

            return $user;
        } catch (Exception $e) {
            return null;
        }
    }

    /**
     * Revoke a single token by adding its JTI to the Cache blacklist.
     */
    public static function revokeToken(string $token): bool
    {
        try {
            $decoded = JWT::decode($token, new Key(self::getSecretKey(), 'HS256'));
            if ($decoded && isset($decoded->jti) && isset($decoded->exp)) {
                $ttl = max(1, $decoded->exp - time());
                Cache::put(self::getBlacklistCacheKey($decoded->jti), true, $ttl);
                return true;
            }
        } catch (Exception $e) {
            // Invalid token
        }
        return false;
    }

    /**
     * Globally revoke all existing tokens issued for a specific user ID.
     */
    public static function revokeAllUserTokens(int $userId): void
    {
        Cache::put(self::getUserRevocationCacheKey($userId), time(), 60 * 60 * 24 * 7);
    }

    private static function getBlacklistCacheKey(string $jti): string
    {
        return 'jwt_blacklist_' . $jti;
    }

    private static function getUserRevocationCacheKey(int $userId): string
    {
        return 'jwt_user_revoked_at_' . $userId;
    }
}

