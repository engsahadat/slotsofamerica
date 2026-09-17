<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when the Orion Stars OS Terminal API returns a non-200 status code (e.g., 201: failure).
 */
class OrionStarsApiException extends Exception
{
    public function __construct(
        public readonly int $resultCode,
        public readonly ?string $errorMessage = null
    ) {
        $message = "Orion Stars API error [{$resultCode}]";
        if ($errorMessage !== null && $errorMessage !== '') {
            $message .= ": {$errorMessage}";
        }

        parent::__construct($message, $resultCode);
    }
}
