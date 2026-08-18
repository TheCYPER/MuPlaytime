import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const publicConfigSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(20),
  schemaVersion: z.string().min(1),
  normalizationVersion: z.string().min(1),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

let client: SupabaseClient | null = null;

export function loadPublicConfig(): PublicConfig | null {
  const candidate = {
    url: import.meta.env.VITE_SUPABASE_URL,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    schemaVersion: import.meta.env.VITE_SCHEMA_VERSION ?? "2026081801",
    normalizationVersion: import.meta.env.VITE_NORMALIZATION_VERSION,
  };
  const result = publicConfigSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function getSupabase(config: PublicConfig): SupabaseClient {
  client ??= createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "muplaytime.auth.v1",
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

export async function ensureAnonymousSession(
  supabase: SupabaseClient,
): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return;
  const signIn = await supabase.auth.signInAnonymously();
  if (signIn.error) throw signIn.error;
}
