import type { GameAccessRequest } from "@/components/GameCard";

/**
 * Builds a game_id -> latest access request map from a user's unlock requests.
 * The backend returns requests newest-first (GameUnlockRequest::latest()), so once a
 * game_id is seen the first time it's already the most recent one — later (older)
 * duplicates for the same game (e.g. after "Request Again" following a rejection)
 * must be skipped rather than overwriting it.
 *
 * `activeAccounts` (the dashboard's `active_accounts` — real GameAccount rows assigned to
 * this user) is an optional safety net: it only fills in a game that has NO unlock_request
 * row at all. A GameAccount row is only ever created alongside a matching approved
 * GameUnlockRequest by this app's own flows, so the two should never disagree — but a
 * customer once had a real GameAccount for a game with nothing showing on their dashboard
 * ("no game acc for it" from their side, "but backend have" one) after it was set up
 * outside that normal flow. Games that DO have an unlock_request (pending/approved/rejected)
 * are left alone — that row is the admin's actual, current decision and must win.
 */
export function buildAccessRequestMap(
  unlockRequests: any[],
  fallbackUsername?: string,
  activeAccounts?: any[]
): Record<string, GameAccessRequest> {
  const map: Record<string, GameAccessRequest> = {};
  for (const a of unlockRequests) {
    if (map[a.game_id]) continue;
    map[a.game_id] = {
      id: a.id,
      status: a.status,
      admin_note: a.admin_note,
      username: a.username || fallbackUsername,
      game_password: a.game_password,
      game_account_id: a.game_account_id,
    };
  }
  if (activeAccounts) {
    for (const acc of activeAccounts) {
      if (map[acc.game_id]) continue;
      map[acc.game_id] = {
        id: `account-${acc.id}`,
        status: "approved",
        admin_note: null,
        username: acc.username || fallbackUsername,
        game_password: acc.password_hash,
        game_account_id: acc.id,
        web_login_url: acc.web_login_url,
      };
    }
  }
  return map;
}
