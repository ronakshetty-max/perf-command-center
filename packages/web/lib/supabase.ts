import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
      _client = createClient(url, key);
    }
    return (_client as any)[prop];
  }
});

export function getServerSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
  return createClient(url, key);
}
