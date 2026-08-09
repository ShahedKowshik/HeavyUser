import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type SettingsClient = SupabaseClient<Database>;

export type UserSettings = {
  nightOwlMode: boolean;
  dayStartTime: string;
  customTaskOrder: boolean;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  nightOwlMode: false,
  dayStartTime: "04:00",
  customTaskOrder: false,
};

export const LEGACY_SETTINGS_STORAGE_KEY = "heavyuser:settings:v2";

function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeUserSettings(value: unknown): UserSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_USER_SETTINGS };
  }

  const candidate = value as Partial<UserSettings>;
  return {
    nightOwlMode: candidate.nightOwlMode === true,
    dayStartTime: isTimeValue(candidate.dayStartTime)
      ? candidate.dayStartTime
      : DEFAULT_USER_SETTINGS.dayStartTime,
    customTaskOrder: candidate.customTaskOrder === true,
  };
}

export function getUserSettings(user: User | null): UserSettings | null {
  if (!user || !Object.prototype.hasOwnProperty.call(user.user_metadata ?? {}, "heavyuser_settings")) {
    return null;
  }

  return normalizeUserSettings(user.user_metadata.heavyuser_settings);
}

export function readLegacySettings(): UserSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const savedSettings = window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    return savedSettings ? normalizeUserSettings(JSON.parse(savedSettings)) : null;
  } catch {
    return null;
  }
}

export function clearLegacySettings() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
  } catch {
    // The cloud setting remains the source of truth if storage is unavailable.
  }
}

export async function updateUserSettings(client: SettingsClient, user: User, settings: UserSettings) {
  const nextSettings = normalizeUserSettings(settings);
  const { data, error } = await client.auth.updateUser({
    data: {
      ...user.user_metadata,
      heavyuser_settings: nextSettings,
    },
  });

  return {
    user: data.user ?? null,
    errorMessage: error ? "Your settings could not be saved. Try again." : null,
  };
}
