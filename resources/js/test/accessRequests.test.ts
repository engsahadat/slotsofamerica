import { describe, it, expect } from "vitest";
import { buildAccessRequestMap } from "@/lib/accessRequests";

// Customer-reported bug: a game showed "Request Access" on their dashboard even though a
// GameAccount was genuinely assigned to them backend-side — because the dashboard only ever
// read `unlock_requests`, never `active_accounts`, for a game's per-user status.
describe("buildAccessRequestMap", () => {
  it("maps each unlock request to its game_id, keeping only the newest per game", () => {
    const requests = [
      { id: "r2", game_id: "g1", status: "approved", username: "u1", game_password: "pw2" },
      { id: "r1", game_id: "g1", status: "rejected", username: "u1", game_password: null },
    ];
    const map = buildAccessRequestMap(requests);
    expect(Object.keys(map)).toEqual(["g1"]);
    expect(map.g1.status).toBe("approved");
    expect(map.g1.id).toBe("r2");
  });

  it("backfills a game from active_accounts when it has no unlock_request at all", () => {
    const map = buildAccessRequestMap([], "player1", [
      { id: "acc9", game_id: "cash-machine", username: "player1GR", password_hash: "9NAALPEJM", web_login_url: null },
    ]);
    expect(map["cash-machine"]).toMatchObject({
      status: "approved",
      username: "player1GR",
      game_password: "9NAALPEJM",
      game_account_id: "acc9",
    });
  });

  it("never lets an active_account override a game that already has an unlock_request", () => {
    // Even a rejected request represents the admin's actual, current decision for that game and
    // must win — active_accounts is only a fallback for games with no unlock_request row at all.
    const requests = [{ id: "r1", game_id: "g1", status: "rejected", username: "u1", game_password: null }];
    const map = buildAccessRequestMap(requests, undefined, [
      { id: "acc1", game_id: "g1", username: "u1", password_hash: "secret" },
    ]);
    expect(map.g1.status).toBe("rejected");
    expect(map.g1.id).toBe("r1");
  });

  it("falls back to the given username when the account has none set", () => {
    const map = buildAccessRequestMap([], undefined, [
      { id: "acc1", game_id: "g1", username: null, password_hash: "secret" },
    ]);
    expect(map.g1.username).toBeUndefined();

    const mapWithFallback = buildAccessRequestMap([], "fallbackUser", [
      { id: "acc1", game_id: "g1", username: null, password_hash: "secret" },
    ]);
    expect(mapWithFallback.g1.username).toBe("fallbackUser");
  });

  it("is unaffected when active_accounts is not provided at all", () => {
    const requests = [{ id: "r1", game_id: "g1", status: "approved", username: "u1", game_password: "pw" }];
    expect(() => buildAccessRequestMap(requests)).not.toThrow();
    expect(buildAccessRequestMap(requests).g1.status).toBe("approved");
  });
});
