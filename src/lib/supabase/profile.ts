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

function getAvatarPath(user: User) {
  const avatarPath = user.user_metadata?.avatar_path;
  return typeof avatarPath === "string" && avatarPath ? avatarPath : null;
}

function getAvatarExtension(file: File) {
  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function getProfileName(user: User | null) {
  if (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) {
    return user.user_metadata.full_name.trim();
  }

  return user?.email?.split("@")[0] ?? "HeavyUser";
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

  if (draft.avatarFile) {
    if (!avatarConstraints.acceptedTypes.includes(draft.avatarFile.type as (typeof avatarConstraints.acceptedTypes)[number])) {
      return { user: null, errorMessage: "Choose a JPG, PNG, or WebP image." };
    }

    if (draft.avatarFile.size > avatarConstraints.maxBytes) {
      return { user: null, errorMessage: "Choose an image smaller than 2 MB." };
    }
  }

  const oldAvatarPath = getAvatarPath(user);
  let nextAvatarPath = oldAvatarPath;
  let uploadedAvatarPath: string | null = null;

  if (draft.avatarFile) {
    uploadedAvatarPath = `${user.id}/${crypto.randomUUID()}.${getAvatarExtension(draft.avatarFile)}`;
    const { error } = await client.storage.from("avatars").upload(uploadedAvatarPath, draft.avatarFile, {
      cacheControl: "3600",
      contentType: draft.avatarFile.type,
      upsert: false,
    });

    if (error) {
      return { user: null, errorMessage: "The image could not be uploaded. Try again." };
    }

    nextAvatarPath = uploadedAvatarPath;
  } else if (draft.removeAvatar) {
    nextAvatarPath = null;
  }

  const { data, error } = await client.auth.updateUser({
    data: {
      ...user.user_metadata,
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

