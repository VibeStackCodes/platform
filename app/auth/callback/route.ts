/**
 * Auth Callback Route Handler
 * Handles OAuth callback from Supabase and exchanges code for session
 */

import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();

    try {
      // Exchange the code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Auth callback error:", error);
        return NextResponse.redirect(`${origin}/?error=${error.message}`);
      }
    } catch (error) {
      console.error("Unexpected auth error:", error);
      return NextResponse.redirect(`${origin}/?error=authentication_failed`);
    }
  }

  // URL to redirect to after successful sign in
  return NextResponse.redirect(`${origin}/dashboard`);
}
