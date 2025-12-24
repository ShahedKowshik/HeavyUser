
import { createClient } from '@supabase/supabase-js';

// If env vars are provided by the build system, use them, otherwise fallback to the hardcoded values.
// Note: In Vite, these might be import.meta.env.VITE_SUPABASE_URL but we stick to the provided pattern or defaults.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnmcputlagkizovngsid.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_zOQXFjmOrWrWEyzjBeI2Eg_fqTZzTA2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
