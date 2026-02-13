/**
 * Supabase Server Client
 * For use in Server Components, Route Handlers, and Server Actions
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

/** Stable mock user for E2E tests — avoids hitting real Supabase auth */
export const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "mock@vibestack.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as const;

/**
 * Get the current user, with mock mode bypass.
 * Returns MOCK_USER when MOCK_MODE is enabled.
 */
export async function getUser() {
  if (MOCK_MODE) {
    return MOCK_USER;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Service Role Client (for admin operations)
 * Use with caution - bypasses RLS
 */
export async function createServiceClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Ignore errors in Server Components
          }
        },
      },
    }
  );
}
