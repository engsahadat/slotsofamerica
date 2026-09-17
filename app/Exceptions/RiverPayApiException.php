<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when River Pay API returns a non-zero STATUS value.
 */
class RiverPayApiException extends Exception
{
    public function __construct(
        public readonly int $status,
        public readonly ?string $errorMessage = null
    ) {
        $message = "River Pay API error [STATUS: {$status}]";
        if ($errorMessage !== null && $errorMessage !== '') {
            $message .= ": {$errorMessage}";
        }

        parent::__construct($message, $status);
    }
}
