import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-loaded Supabase admin client
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) {
    return _supabaseAdmin;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase server config missing:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    });
    throw new Error(
      `Supabase 服务端配置缺失: URL=${supabaseUrl ? '已配置' : '缺失'}, ServiceKey=${supabaseServiceKey ? '已配置' : '缺失'}`
    );
  }

  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _supabaseAdmin;
}

// Export as getter to ensure lazy initialization
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient];
  },
});

// Fixed user ID for this device (personal use)
// In a multi-user scenario, this would come from authentication
export const DEVICE_USER_ID = '00000000-0000-0000-0000-000000000001';
