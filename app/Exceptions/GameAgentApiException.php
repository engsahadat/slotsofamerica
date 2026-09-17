<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when the upstream Game Agent API returns a non-zero status code.
 * $code carries the provider's own status code (see their "Project Status
 * Code Dictionary" appendix), not an HTTP status code.
 */
class GameAgentApiException extends Exception
{
    /** Provider status code => human-readable meaning. */
    public const STATUS_MESSAGES = [
        1 => 'Invalid agent ID',
        2 => 'Invalid request parameters',
        3 => 'Invalid token',
        4 => 'Token expired',
        5 => 'Access ip is not white ip',
        6 => 'Insufficient agent balance',
        7 => 'Insufficient user balance',
        8 => 'Invalid user ID',
        9 => 'User account frozen',
        10 => 'User is in game',
        11 => 'Invalid amount',
        12 => 'Recharge failed, please try again later',
        13 => 'Recharge permission denied',
        14 => 'Withdrawal failed, please try again later',
        15 => 'Withdrawal amount exceeds daily limit',
        16 => 'Withdrawal under review',
        17 => 'Withdrawal permission denied',
        18 => 'Account name format error, contain letters, numbers, and underscores',
        19 => 'Agent no register user permission',
        20 => 'Account name already exists',
        21 => 'System failed',
        22 => 'Num of register ip exceeds the upper limit',
        23 => 'Password digits 6 to 32 characters',
        400 => 'Parameter error',
    ];

    public function __construct(public readonly int $providerCode, ?string $providerMessage = null)
    {
        $meaning = self::STATUS_MESSAGES[$providerCode] ?? 'Unknown error';
        $text = $providerMessage ? "{$meaning} ({$providerMessage})" : $meaning;

        parent::__construct("Game Agent API error [{$providerCode}]: {$text}", $providerCode);
    }
}
