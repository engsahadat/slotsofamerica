<?php

namespace App\Services;

use App\Models\Game;
use App\Models\GameAccount;

/**
 * Single source of truth for building a player's game-specific username —
 * used by every registration path (instant self-service, admin manual
 * approve, Game API Providers auto-create) instead of each one rolling its
 * own logic. The result is decided BEFORE any provider API call is made, so
 * the provider always receives (and is expected to accept) a username our
 * own system already committed to, rather than us adopting whatever it
 * hands back — see the "no-overwrite" comments at each call site.
 *
 * Format: {cleaned application username}{game's configured suffix}
 * e.g. "john123" on "Game Vault" (suffix "GV") -> "john123GV".
 */
class GameUsernameGenerator
{
    /** Conservative ceiling that satisfies every provider we integrate with (FastAPI's 3-16 is the tightest). */
    private const MAX_LENGTH = 16;
    private const MIN_BASE_LENGTH = 3;

    /**
     * Generate + validate (format/length) + de-duplicate (against existing GameAccount rows
     * for this game) a username for $appUsername on $game, in one call.
     */
    public static function generate(string $appUsername, Game $game): string
    {
        $suffix = self::suffixFor($game);
        $candidate = self::cleanBase($appUsername, strlen($suffix)) . $suffix;

        if (!self::exists((int) $game->id, $candidate)) {
            return $candidate;
        }

        // Same app username registering on the same game again after their original
        // GameAccount row was deleted/reassigned, or an unlucky collision with a
        // manually-typed admin pool account — stay deterministic-first and only fall
        // back to a numeric disambiguator, never a random one.
        for ($i = 2; $i <= 99; $i++) {
            $attempt = self::cleanBase($appUsername, strlen($suffix) + strlen((string) $i)) . $suffix . $i;
            if (!self::exists((int) $game->id, $attempt)) {
                return $attempt;
            }
        }

        // Astronomically unlikely to be reached (98 collisions on one app-username+game
        // pair), but never loop forever — fall back to a short random tail.
        return self::cleanBase($appUsername, strlen($suffix) + 4) . $suffix . random_int(1000, 9999);
    }

    /**
     * The game's admin-configured suffix (Admin -> Games), or a short derived fallback
     * if one was never set — so an unconfigured game still gets a stable, game-specific
     * suffix instead of breaking registration.
     */
    public static function suffixFor(Game $game): string
    {
        $configured = strtoupper(preg_replace('/[^a-zA-Z0-9]/', '', (string) ($game->username_suffix ?? '')));
        if ($configured !== '') {
            return substr($configured, 0, 5);
        }

        $words = preg_split('/\s+/', trim((string) $game->name), -1, PREG_SPLIT_NO_EMPTY);
        $derived = count($words) > 1
            ? implode('', array_map(fn ($w) => strtoupper(substr($w, 0, 1)), $words))
            : strtoupper(substr((string) $game->name, 0, 2));
        $derived = preg_replace('/[^A-Z0-9]/', '', $derived);

        return $derived !== '' ? substr($derived, 0, 4) : 'GM';
    }

    private static function cleanBase(string $appUsername, int $suffixLength): string
    {
        $clean = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $appUsername));
        if ($clean === '') {
            $clean = 'player';
        }
        if (strlen($clean) < self::MIN_BASE_LENGTH) {
            $clean = str_pad($clean, self::MIN_BASE_LENGTH, '0', STR_PAD_RIGHT);
        }

        $maxBase = max(self::MIN_BASE_LENGTH, self::MAX_LENGTH - $suffixLength);

        return substr($clean, 0, $maxBase);
    }

    private static function exists(int $gameId, string $username): bool
    {
        return GameAccount::where('game_id', $gameId)->where('username', $username)->exists();
    }
}
