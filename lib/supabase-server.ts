// lib/supabase-server.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

export const supabaseServer = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
