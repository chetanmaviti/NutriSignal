import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, createUserProfile, saveFoodScan, getScanStats, getFoodScans } from '../lib/supabase';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    const { data: { subscription } }: any = supabase.auth.onAuthStateChange((_, session: any) => {
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    if (data.user) {
      try {
        await createUserProfile(data.user.id, email);
      } catch (err: any) {
        console.warn('Profile creation:', err.message);
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const recordScan = async (foodLabel: string, signal: string, score: number, nutrition: any) => {
    if (!user) throw new Error('User not authenticated');
    await saveFoodScan(user.id, foodLabel, signal, score, nutrition);
  };

  const fetchScanStats = async () => {
    if (!user) return null;
    return await getScanStats(user.id);
  };

  const fetchFoodScans = async () => {
    if (!user) return [];
    return await getFoodScans(user.id);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signIn, 
      signUp, 
      signOut,
      recordScan,
      fetchScanStats,
      fetchFoodScans,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
