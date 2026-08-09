"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSafeSameOriginPath } from "@/lib/security/redirect";
import { getAppPath, getAppUrl } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getSignedAvatarUrl,
  type ProfileDraft,
  updateUserProfile,
} from "@/lib/supabase/profile";
import {
  clearLegacySettings,
  DEFAULT_USER_SETTINGS,
  getUserSettings,
  normalizeUserSettings,
  readLegacySettings,
  type UserSettings,
  updateUserSettings,
} from "@/lib/supabase/settings";

export type AuthStatus = "loading" | "signed_out" | "signed_in";
export type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  avatarUrl: string | null;
  settings: UserSettings;
  sendMagicLink: (email: string, nextPath?: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  updateProfile: (draft: ProfileDraft) => Promise<AuthResult>;
  updateSettings: (settings: UserSettings) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isE2EAuthEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_HEAVYUSER_E2E === "1";
const e2eUser = {
  id: "e2e-user-00000000",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@heavyuser.test",
  email_confirmed_at: "2026-08-01T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-08-01T00:00:00.000Z",
  last_sign_in_at: "2026-08-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "E2E Tester" },
  identities: [],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
} as User;

function getMagicLinkErrorMessage(error: { code?: string; message?: string; status?: number } | null) {
  const code = error?.code?.toLowerCase() ?? "";
  const details = error?.message?.toLowerCase() ?? "";

  if (details.includes("redirect") || details.includes("redirect_to") || details.includes("not allowed")) {
    return "Supabase rejected the callback URL. Add http://localhost:3000/auth/confirm to your Supabase Auth redirect URLs.";
  }

  if (code === "over_email_send_rate_limit" || details.includes("email send rate limit")) {
    return "Supabase has temporarily reached its email limit. Wait for it to reset or configure custom SMTP in Supabase.";
  }

  if (code === "over_request_rate_limit" || error?.status === 429 || details.includes("rate limit") || details.includes("too many")) {
    return "Too many sign-in requests came from this browser. Wait a few minutes, then try once.";
  }

  if (details.includes("smtp") || details.includes("email provider") || details.includes("email")) {
    return "Supabase could not send the email. Check the Auth email provider or SMTP settings.";
  }

  return "We could not send the link. Check your Supabase Auth settings and try again.";
}

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<AuthStatus>(isE2EAuthEnabled ? "signed_in" : client ? "loading" : "signed_out");
  const [user, setUser] = useState<User | null>(isE2EAuthEnabled ? e2eUser : null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_USER_SETTINGS });

  const applyUser = useCallback(
    (nextUser: User | null) => {
      setUser(nextUser);
      setStatus(nextUser ? "signed_in" : "signed_out");

      if (!client || !nextUser) {
        setAvatarUrl(null);
        if (!nextUser) {
          setSettings({ ...DEFAULT_USER_SETTINGS });
        }
        return;
      }

      setSettings(getUserSettings(nextUser) ?? readLegacySettings() ?? { ...DEFAULT_USER_SETTINGS });
      void getSignedAvatarUrl(client, nextUser).then(setAvatarUrl);
    },
    [client],
  );

  useEffect(() => {
    if (isE2EAuthEnabled) {
      return;
    }

    if (!client) {
      return;
    }

    let isMounted = true;
    let clientSessionResolved = false;
    let serverCheckResolved = false;
    let serverUser: User | null = null;
    const fallbackTimer = window.setTimeout(() => {
      if (isMounted && !clientSessionResolved && !serverUser) {
        applyUser(null);
      }
    }, 4_000);

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (session?.user) {
        clientSessionResolved = true;
        applyUser(session.user);
        return;
      }

      // Do not let an INITIAL_SESSION event with no browser-readable session
      // hide a verified server session while the cookie-backed client catches
      // up. Explicit sign-out events still clear the user immediately.
      if (_event === "INITIAL_SESSION" && (!serverCheckResolved || serverUser)) {
        return;
      }

      clientSessionResolved = true;
      applyUser(null);
    });

    void fetch(getAppPath("/api/auth/session"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const body = (await response.json().catch(() => null)) as { user?: User | null } | null;
        return body?.user ?? null;
      })
      .then((nextUser) => {
        serverCheckResolved = true;
        if (!isMounted || clientSessionResolved) {
          return;
        }

        if (nextUser) {
          serverUser = nextUser;
          applyUser(nextUser);
        } else {
          clientSessionResolved = true;
          applyUser(null);
        }
      })
      .catch(() => {
        serverCheckResolved = true;
        if (isMounted && !clientSessionResolved && !serverUser) {
          // Let the browser session check decide whether the user is signed
          // in when the server fallback itself is temporarily unavailable.
          return;
        }
      });

    void client.auth.getSession()
      .then(({ data }) => {
        if (isMounted) {
          if (data.session?.user) {
            clientSessionResolved = true;
            applyUser(data.session.user);
          } else if (serverCheckResolved && !serverUser) {
            clientSessionResolved = true;
            applyUser(data.session?.user ?? null);
          }
        }
      })
      .catch(() => {
        if (isMounted && serverCheckResolved && !serverUser) {
          clientSessionResolved = true;
          applyUser(null);
        }
      });

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [applyUser, client]);

  useEffect(() => {
    if (!client || !user || status !== "signed_in") {
      return;
    }

    let isCancelled = false;
    const remoteSettings = getUserSettings(user);

    if (remoteSettings) {
      return () => {
        isCancelled = true;
      };
    }

    const legacySettings = readLegacySettings();
    if (!legacySettings) {
      return () => {
        isCancelled = true;
      };
    }

    void updateUserSettings(client, user, legacySettings).then((result) => {
      if (isCancelled || !result.user) {
        return;
      }

      clearLegacySettings();
      applyUser(result.user);
    });

    return () => {
      isCancelled = true;
    };
  }, [applyUser, client, status, user]);

  const sendMagicLink = useCallback(
    async (email: string, nextPath?: string): Promise<AuthResult> => {
      if (!client) {
        return { ok: false, message: "Authentication is not configured for this deployment." };
      }

      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        return { ok: false, message: "Enter your email address." };
      }

      const callbackUrl = new URL(getAppUrl("/auth/confirm"), window.location.origin);
      const safeNextPath = getSafeSameOriginPath(nextPath ?? null, callbackUrl.href, getAppPath("/"));
      callbackUrl.searchParams.set("next", safeNextPath);

      const { error } = await client.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: callbackUrl.href,
        },
      });

      return error ? { ok: false, message: getMagicLinkErrorMessage(error) } : { ok: true };
    },
    [client],
  );

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!client) {
      return { ok: false, message: "Authentication is not configured for this deployment." };
    }

    const { error } = await client.auth.signOut();
    return error ? { ok: false, message: "You could not be signed out. Try again." } : { ok: true };
  }, [client]);

  const updateProfile = useCallback(
    async (draft: ProfileDraft): Promise<AuthResult> => {
      if (!client || !user) {
        return { ok: false, message: "Your session has ended. Sign in again." };
      }

      const result = await updateUserProfile(client, user, draft);
      if (!result.user) {
        return { ok: false, message: result.errorMessage ?? "Your profile could not be saved." };
      }

      applyUser(result.user);
      return { ok: true };
    },
    [applyUser, client, user],
  );

  const updateSettings = useCallback(
    async (nextSettings: UserSettings): Promise<AuthResult> => {
      if (isE2EAuthEnabled) {
        setSettings(normalizeUserSettings(nextSettings));
        return { ok: true };
      }
      if (!client || !user) {
        return { ok: false, message: "Your session has ended. Sign in again." };
      }

      const result = await updateUserSettings(client, user, nextSettings);
      if (!result.user) {
        return { ok: false, message: result.errorMessage ?? "Your settings could not be saved." };
      }

      const normalizedSettings = normalizeUserSettings(nextSettings);
      const schedulerSettingsChanged = normalizedSettings.nightOwlMode !== settings.nightOwlMode
        || normalizedSettings.dayStartTime !== settings.dayStartTime;
      setSettings(normalizedSettings);
      applyUser(result.user);
      // Night Owl changes the boundary used by All day scheduling. Re-run the
      // planner after the account setting is saved so existing flexible blocks
      // follow the new logical day immediately.
      if (schedulerSettingsChanged) {
        void fetch(getAppPath("/api/scheduler/run"), { method: "POST" }).catch(() => undefined);
      }
      return { ok: true };
    },
    [applyUser, client, settings, user],
  );

  const value = useMemo(
    () => ({ status, user, avatarUrl, settings, sendMagicLink, signOut, updateProfile, updateSettings }),
    [avatarUrl, sendMagicLink, settings, signOut, status, updateProfile, updateSettings, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
