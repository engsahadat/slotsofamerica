import { useAuth } from "@/contexts/AuthContext";

/**
 * Regression: this used to query a dead Supabase `profiles` table stub, whose `.maybeSingle()`
 * always resolved to no data — so `isVerified` never left its `true` default and this gate
 * silently did nothing for every user, in every one of Deposit/Withdraw/Redeem/Transfer.
 * `useAuth()`'s `user` already carries the real verification fields (same ones VerificationBanner
 * uses), so this just reads them directly — no network call needed at all.
 */
export function useVerificationCheck() {
  const { user, loading: authLoading } = useAuth();

  const isVerified = !user
    ? true
    : !!(user.email_verified_at || user.email_verified_by_admin || user.phone_verified);

  return { isVerified, loading: authLoading };
}
