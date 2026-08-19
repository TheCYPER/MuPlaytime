/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SCHEMA_VERSION?: string;
  readonly VITE_NORMALIZATION_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
