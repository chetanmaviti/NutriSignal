import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your Supabase credentials from https://supabase.com
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
