import assert from "node:assert/strict";
import {test} from "node:test";
import {resolveSignedAvatarUrl} from "../src/lib/avatar-url.ts";

const HOST = "https://example.supabase.co";
const REL = "/object/sign/heavyuser-avatars/user-1/photo.png?token=abc123";

test("storage signed path is relative to /storage/v1, not the domain root", () => {
  assert.equal(resolveSignedAvatarUrl(HOST, REL),
    "https://example.supabase.co/storage/v1/object/sign/heavyuser-avatars/user-1/photo.png?token=abc123");
});
test("handles absolute storage-prefix path without duplicating prefix", () => {
  assert.equal(resolveSignedAvatarUrl(HOST, "/storage/v1" + REL),
    "https://example.supabase.co/storage/v1/object/sign/heavyuser-avatars/user-1/photo.png?token=abc123");
});
test("accepts correctly scoped absolute signed URLs", () => {
  assert.equal(resolveSignedAvatarUrl(HOST, HOST + "/storage/v1" + REL),
    "https://example.supabase.co/storage/v1/object/sign/heavyuser-avatars/user-1/photo.png?token=abc123");
});
test("rejects external or different-bucket URLs", () => {
  assert.throws(() => resolveSignedAvatarUrl(HOST, "https://attacker.com/storage/v1" + REL));
  assert.throws(() => resolveSignedAvatarUrl(HOST, REL.replace("heavyuser-avatars","other")));
  assert.throws(() => resolveSignedAvatarUrl(HOST, REL.replace("?token=abc123","")));
});
