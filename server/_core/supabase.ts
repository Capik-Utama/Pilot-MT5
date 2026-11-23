import { createClient, type SupabaseClient, type User as SupabaseUser } from "@supabase/supabase-js";

let authClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function supabaseUrl(): string {
  const value = process.env.SUPABASE_URL?.trim();
  if (!value) throw new Error("SUPABASE_URL is not configured");
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL must use HTTPS in production");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("SUPABASE_URL must be an origin without credentials or path");
  }
  return url.origin;
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  } as const;
}

export function getSupabaseAuthClient(): SupabaseClient {
  if (authClient) return authClient;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  if (!key) throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  authClient = createClient(supabaseUrl(), key, clientOptions());
  return authClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("Supabase Auth Admin key is not configured");
  adminClient = createClient(supabaseUrl(), key, clientOptions());
  return adminClient;
}

export async function verifySupabaseAccessToken(
  token: string
): Promise<SupabaseUser | null> {
  if (token.length < 20 || token.length > 8192) return null;
  const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
  if (error || !data.user || !isUuid(data.user.id)) return null;
  return data.user;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
