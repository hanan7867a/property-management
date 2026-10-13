import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type UserRole = "accountant" | "owner" | "admin";

type AuthState = {
  user: User | null;
  role: UserRole | null;
  fullName: string;
  ownerId: string | null;
  error: string;
};

const signedOut: AuthState = { user: null, role: null, fullName: "", ownerId: null, error: "" };
const roles: UserRole[] = ["accountant", "owner", "admin"];

export function useAuth() {
  const [state, setState] = useState<AuthState>(signedOut);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let latest = 0;

    async function apply(session: Session | null) {
      const request = ++latest;
      if (!session?.user) {
        setState(signedOut);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, full_name, is_active")
        .eq("id", session.user.id)
        .maybeSingle();
      if (request !== latest) return;

      const role = roles.find((candidate) => candidate === profile?.role) ?? null;
      let message = "";
      if (error) message = `Your profile could not be read: ${error.message}`;
      else if (!profile) message = "No profile exists for this account yet. Ask the administrator to set up your access.";
      else if (profile.is_active === false) message = "This account has been deactivated.";
      else if (!role) message = "This account has no valid role assigned.";

      const metadataOwnerId = session.user.app_metadata?.owner_id;
      setState({
        user: session.user,
        role: message ? null : role,
        fullName: profile?.full_name ?? "",
        ownerId: typeof metadataOwnerId === "string" ? metadataOwnerId : null,
        error: message,
      });
      setLoading(false);
    }

    // Do not await Supabase calls inside this callback (supabase-js can deadlock); defer instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void apply(session), 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await createClient().auth.signOut();
  }, []);

  return { ...state, loading, login, logout };
}
