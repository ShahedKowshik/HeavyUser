import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ProfileClient = SupabaseClient<Database>;

export type ProfileDraft = {
  fullName: string;
  avatarFile: File | null;
  removeAvatar: boolean;
};

export const avatarConstraints = {
  maxBytes: 2 * 1024 * 1024,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
};
const MAX_PROFILE_NAME_LENGTH = 80;

function getAvatarPath(user: User) {
  const avatarPath = user.user_metadata?.avatar_path;
  return typeof avatarPath === "string" && avatarPath ? avatarPath : null;
}

type AvatarFormat = {
  extension: "jpg" | "png" | "webp";
  contentType: (typeof avatarConstraints.acceptedTypes)[number];
};

async function detectAvatarFormat(file: File): Promise<AvatarFormat | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith(0xff, 0xd8, 0xff)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { extension: "png", contentType: "image/png" };
  }
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF";
  const webp = String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return riff && webp ? { extension: "webp", contentType: "image/webp" } : null;
}

export function getProfileName(user: User | null) {
  if (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) {
    return user.user_metadata.full_name.trim();
  }

  return user?.email?.split("@")[0] ?? "HeavyUser";
}

const publicUserIdAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const publicUserIdLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function getPublicUserId(user: Pick<User, "id">) {
  let firstHash = 2166136261;
  let secondHash = 2246822519;

  for (const character of user.id.replaceAll("-", "").toUpperCase()) {
    const code = character.charCodeAt(0);
    firstHash = Math.imul(firstHash ^ code, 16777619) >>> 0;
    secondHash = Math.imul(secondHash ^ code, 3266489917) >>> 0;
  }

  const letter = publicUserIdLetters[firstHash % publicUserIdLetters.length];
  const number = String(Math.floor(firstHash / publicUserIdLetters.length) % 1000).padStart(3, "0");
  let suffixSeed = secondHash;
  let suffix = "";

  for (let index = 0; index < 4; index += 1) {
    suffix += publicUserIdAlphabet[suffixSeed % publicUserIdAlphabet.length];
    suffixSeed = Math.imul(suffixSeed ^ (firstHash >>> (index + 1)), 16777619) >>> 0;
  }

  return `#${letter}${number}-${suffix}`;
}

export async function getSignedAvatarUrl(client: ProfileClient, user: User | null) {
  const avatarPath = user ? getAvatarPath(user) : null;
  if (!avatarPath) {
    return null;
  }

  const { data, error } = await client.storage.from("avatars").createSignedUrl(avatarPath, 60 * 60);
  return error ? null : data.signedUrl;
}

export async function updateUserProfile(client: ProfileClient, user: User, draft: ProfileDraft) {
  const fullName = draft.fullName.trim();
  if (!fullName) {
    return { user: null, errorMessage: "Add a name before saving." };
  }
  if (fullName.length > MAX_PROFILE_NAME_LENGTH) {
    return { user: null, errorMessage: `Keep your display name under ${MAX_PROFILE_NAME_LENGTH} characters.` };
  }

  let avatarFormat: AvatarFormat | null = null;
  if (draft.avatarFile) {
    if (!avatarConstraints.acceptedTypes.includes(draft.avatarFile.type as (typeof avatarConstraints.acceptedTypes)[number])) {
      return { user: null, errorMessage: "Choose a JPG, PNG, or WebP image." };
    }

    if (draft.avatarFile.size > avatarConstraints.maxBytes) {
      return { user: null, errorMessage: "Choose an image smaller than 2 MB." };
    }

    try {
      avatarFormat = await detectAvatarFormat(draft.avatarFile);
    } catch {
      avatarFormat = null;
    }
    if (!avatarFormat) {
      return { user: null, errorMessage: "That file is not a valid JPG, PNG, or WebP image." };
    }
  }

  const oldAvatarPath = getAvatarPath(user);
  let nextAvatarPath = oldAvatarPath;
  let uploadedAvatarPath: string | null = null;

  if (draft.avatarFile) {
    uploadedAvatarPath = `${user.id}/${crypto.randomUUID()}.${avatarFormat!.extension}`;
    const { error } = await client.storage.from("avatars").upload(uploadedAvatarPath, draft.avatarFile, {
      cacheControl: "3600",
      contentType: avatarFormat!.contentType,
      upsert: false,
    });

    if (error) {
      return { user: null, errorMessage: "The image could not be uploaded. Try again." };
    }

    nextAvatarPath = uploadedAvatarPath;
  } else if (draft.removeAvatar) {
    nextAvatarPath = null;
  }

  const { data: latestUserData } = await client.auth.getUser();
  const latestMetadata = latestUserData.user?.id === user.id ? latestUserData.user.user_metadata : user.user_metadata;
  const { data, error } = await client.auth.updateUser({
    data: {
      ...latestMetadata,
      full_name: fullName,
      avatar_path: nextAvatarPath,
    },
  });

  if (error || !data.user) {
    if (uploadedAvatarPath) {
      await client.storage.from("avatars").remove([uploadedAvatarPath]);
    }
    return { user: null, errorMessage: "Your profile could not be saved. Try again." };
  }

  if (oldAvatarPath && oldAvatarPath !== nextAvatarPath) {
    await client.storage.from("avatars").remove([oldAvatarPath]);
  }

  return { user: data.user, errorMessage: null };
}
