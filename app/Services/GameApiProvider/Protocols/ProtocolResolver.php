<?php

namespace App\Services\GameApiProvider\Protocols;

use App\Models\GameApiProvider;
use Illuminate\Contracts\Container\Container;

class ProtocolResolver
{
    public function __construct(private Container $container)
    {
    }

    public function resolve(GameApiProvider $provider): ProviderProtocolInterface
    {
        return match ($provider->protocol) {
            'external_signed' => $this->container->make(ExternalSignedProtocol::class),
            'orion_stars_signed' => $this->container->make(OrionStarsAgentProtocol::class),
            'fast_api_signed' => $this->container->make(FastApiSignedProtocol::class),
            'river_pay_simple' => $this->container->make(RiverPaySimpleProtocol::class),
            default => $this->container->make(AgentLoginProtocol::class),
        };
    }
}
