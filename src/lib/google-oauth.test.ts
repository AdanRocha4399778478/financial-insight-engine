import { expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { googleOAuthCredentials } from "./google-oauth";

test("Google OAuth usa o authorize do Supabase e preserva a origem atual", async () => {
  const currentOrigin = "https://financial-insight-preview.vercel.app";
  const credentials = googleOAuthCredentials(currentOrigin);
  const client = createClient("https://example-project.supabase.co", "sb_publishable_test", {
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.signInWithOAuth({
    ...credentials,
    options: { ...credentials.options, skipBrowserRedirect: true },
  });

  expect(error).toBeNull();
  expect(data.url).not.toBeNull();

  const authorizeUrl = new URL(data.url!);
  expect(authorizeUrl.origin).toBe("https://example-project.supabase.co");
  expect(authorizeUrl.pathname).toBe("/auth/v1/authorize");
  expect(authorizeUrl.searchParams.get("provider")).toBe("google");
  expect(authorizeUrl.searchParams.get("redirect_to")).toBe(`${currentOrigin}/auth`);
  expect(data.url).not.toContain("/~oauth/");
});
