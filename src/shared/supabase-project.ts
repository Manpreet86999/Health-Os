export interface SupabaseProjectConfig {
  url: string;
  publishableKey: string;
}

/**
 * Pre-configured Supabase Project settings for Health OS.
 * Keeping this configured here hides the URL and Key from end users,
 * allowing them to simply enter their Email and Password to sign in or create an account.
 */
export const DEFAULT_SUPABASE_CONFIG: SupabaseProjectConfig = {
  url: 'https://lphlihwyrcqgmdiwlvuq.supabase.co',
  publishableKey: 'sb_publishable_T9xPf3Q60Q1aTilqiLvOww_d0Wnwx49',
};

export function getEffectiveSupabaseConfig(
  saved?: Partial<SupabaseProjectConfig> | null
): SupabaseProjectConfig {
  return {
    url: (saved?.url || DEFAULT_SUPABASE_CONFIG.url || '').trim(),
    publishableKey: (saved?.publishableKey || DEFAULT_SUPABASE_CONFIG.publishableKey || '').trim(),
  };
}

export function isSupabaseConfigured(config?: Partial<SupabaseProjectConfig> | null): boolean {
  const effective = getEffectiveSupabaseConfig(config);
  return Boolean(effective.url && effective.publishableKey);
}
