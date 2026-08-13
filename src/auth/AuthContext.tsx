import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthSession } from "../api/auth";
import { setCsrfToken, subscribeToUnauthorized } from "./auth-store";

type AuthContextValue = {
  loading: boolean;
  session: AuthSession | null;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);

  const applySession = useCallback((nextSession: AuthSession | null) => {
    setCsrfToken(nextSession?.csrfToken ?? null);
    setSession(nextSession);
  }, []);

  useEffect(() => subscribeToUnauthorized(() => applySession(null)), [applySession]);

  useEffect(() => {
    const controller = new AbortController();
    authApi.session(controller.signal)
      .then(applySession)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("No se pudo restaurar la sesión", error);
          applySession(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySession]);

  const login = useCallback(async (username: string, password: string) => {
    applySession(await authApi.login(username, password));
  }, [applySession]);

  const logout = useCallback(async () => {
    await authApi.logout();
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({ loading, session, login, logout }),
    [loading, session, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
