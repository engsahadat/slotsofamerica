<?php

namespace App\Services\GameApiProvider;

use App\Models\GameApiProvider;

class ProviderPasswordResolver
{
    /**
     * Resolve the agent password for a provider: DB-stored secret first
     * (admin-managed, encrypted at rest), then a legacy .env fallback keyed
     * by the provider's `secret_name` — mirrors the reference's two-tier
     * getProviderPassword() resolution.
     */
    public function resolve(GameApiProvider $provider): ?string
    {
        $secret = $provider->secret()->first();
        if ($secret && !empty($secret->agent_password)) {
            return $secret->agent_password;
        }

        if (!empty($provider->secret_name)) {
            $v = env($provider->secret_name);
            if (!empty($v)) {
                return $v;
            }
        }

        return null;
    }
}
