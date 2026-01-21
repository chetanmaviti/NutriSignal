import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://rizdgojxupskihtcpsem.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpemRnb2p4dXBza2lodGNwc2VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTU5OTAsImV4cCI6MjA4NDA5MTk5MH0.yvEpKlprUd61TyTHxgoUpYsC-t246vpzT7CmSB4yUOg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function createUserProfile(userId: string, email: string, firstName?: string, lastName?: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{
          id: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
        },
      ])
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('first_name, last_name, email, height_cm, weight_kg, onboarding_completed')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(userId: string, updates: any) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select();
  if (error) throw error;
  return data;
}

export async function saveFoodScan(
  userId: string,
  foodLabel: string,
  signal: string,
  score: number,
  nutrition: any
) {
  try {
    const { data, error } = await supabase
      .from('food_scans')
      .insert([
        {
          user_id: userId,
          food_label: foodLabel,
          signal: signal,
          score: score,
          nutrition: nutrition,
        },
      ])
      .select();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving food scan:', error);
    throw error;
  }
}

export async function getFoodScans(userId: string) {
  const { data, error } = await supabase
    .from('food_scans')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getScanStats(userId: string) {
  const { data, error } = await supabase.from('food_scans').select('signal').eq('user_id', userId);
  if (error) throw error;
  
  const scans = data || [];
  return {
    total: scans.length,
    green: scans.filter((s: any) => s.signal === 'Green').length,
    yellow: scans.filter((s: any) => s.signal === 'Yellow').length,
    red: scans.filter((s: any) => s.signal === 'Red').length,
  };
}
