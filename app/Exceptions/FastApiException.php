<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when the FastApi platform API returns an error response code.
 */
class FastApiException extends Exception
{
    /** Provider status code => human-readable description. */
    public const STATUS_MESSAGES = [
        200 => 'Success',
        0 => 'Success',
        1 => 'New User Is Created',
        2 => 'User Does Not Exist',
        3 => 'Parameter Error',
        4 => 'Invalid Signature',
        5 => 'Agent Ban',
        6 => 'Account length error',
        7 => 'Account format error',
        8 => 'Password length error',
        9 => 'Password format error',
        10 => 'Requestid Used',
        11 => 'Unknown Database Error',
        12 => 'User Already Exist',
        13 => 'Top Up Fail',
        14 => 'Insufficient Credit',
        15 => 'Withdrawal Failed',
        16 => 'Get Balance Failed',
        17 => 'Operations are Not Allowed In The Game',
        18 => 'System Is Under Maintenance',
        19 => 'The Requested Address Does Not Exist',
        20 => 'Password error',
        21 => 'Agent Name Or Password error',
        22 => 'Platform Not Configured',
    ];

    public function __construct(
        public readonly int $responseCode,
        public readonly ?string $responseMessage = null
    ) {
        $meaning = self::STATUS_MESSAGES[$responseCode] ?? 'Unknown Error';
        $text = $responseMessage ? "{$meaning} ({$responseMessage})" : $meaning;

        parent::__construct("FastApi error [{$responseCode}]: {$text}", $responseCode);
    }
}
