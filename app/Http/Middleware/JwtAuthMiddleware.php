<?php

namespace App\Http\Middleware;

use App\Services\JwtAuthService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class JwtAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['message' => 'Unauthenticated. JWT token missing.'], 401);
        }

        $user = JwtAuthService::validateToken($token);

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Invalid or expired JWT token.'], 401);
        }

        Auth::setUser($user);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
