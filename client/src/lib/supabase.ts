import { createClient } from "@supabase/supabase-js";

// Publishable key only: database access is denied to browser roles by RLS.
export const SUPABASE_URL = "https://qqdsultliybypiuvihli.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Kfj9_n9hWcuexbpXuPWGDQ_SiUzDaH2";
export const MT5_API_URL = `${SUPABASE_URL}/functions/v1/mt5-api`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
