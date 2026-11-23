import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};
type AuthUser = {
  id: string;
  openId: string;
  email: string;
  name: string;
};

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    id: user.id,
    openId: user.id,
    email: user.email ?? "",
    name: typeof metadataName === "string" ? metadataName : user.email ?? "User",
  };
}

export function useAuth(options?: UseAuthOptions) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    const { data, error: sessionError } = await supabase.auth.getSession();
    setError(sessionError);
    setUser(data.session?.user ? toAuthUser(data.session.user) : null);
    setLoading(false);
    return data.session;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setError(sessionError);
      setUser(data.session?.user ? toAuthUser(data.session.user) : null);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError(new Error("Sesi tidak dapat diperiksa. Silakan coba lagi."));
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ? toAuthUser(session.user) : null);
      setError(null);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  useEffect(() => {
    if (options?.redirectOnUnauthenticated && !loading && !user && typeof window !== "undefined") {
      window.location.assign(options.redirectPath ?? "/");
    }
  }, [options?.redirectOnUnauthenticated, options?.redirectPath, loading, user]);

  return { user, loading, error, isAuthenticated: Boolean(user), refresh, logout };
}
