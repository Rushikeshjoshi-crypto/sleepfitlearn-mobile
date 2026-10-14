import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getIdToken, signOut as cognitoSignOut } from "./cognito";
import { cognitoStorageReady } from "./syncStorage";
import { clearBackgroundSyncAllowed } from "../syncGate";

type AuthState = {
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  async function refresh() {
    const token = await getIdToken().catch(() => null);
    setIsAuthenticated(token !== null);
  }

  useEffect(() => {
    cognitoStorageReady.then(refresh).finally(() => setLoading(false));
  }, []);

  function signOut() {
    // Signed out → no background sync (screen time, Health Connect) until
    // the next account passes ProfileGate (lib/syncGate.ts).
    clearBackgroundSyncAllowed();
    cognitoSignOut();
    setIsAuthenticated(false);
  }

  const value = useMemo(() => ({ loading, isAuthenticated, refresh, signOut }), [loading, isAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
