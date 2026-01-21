import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, createUserProfile, getUserProfile, saveFoodScan, getScanStats, getFoodScans } from '../lib/supabase';

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

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
    if (error) throw error;
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

  const fetchUserProfile = async () => {
    if (!user) return null;
    return await getUserProfile(user.id);
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
      fetchUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
