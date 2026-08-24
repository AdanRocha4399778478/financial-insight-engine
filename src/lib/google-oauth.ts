export function googleOAuthCredentials(origin: string) {
  return {
    provider: "google" as const,
    options: {
      redirectTo: new URL("/auth", origin).toString(),
    },
  };
}
