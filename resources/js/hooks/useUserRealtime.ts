import { useEffect } from "react";

export interface UserRealtimeHandlers {
  onProfile?: (p?: any) => void;
  onTransaction?: (p?: any) => void;
  onGameAccess?: (p?: any) => void;
  onPasswordRequest?: (p?: any) => void;
  onNotification?: (p?: any) => void;
  channelKey?: string;
}

export function useUserRealtime(userId: string | number | undefined, handlers: UserRealtimeHandlers) {
  useEffect(() => {
    if (!userId) return;
  }, [userId]);
}
