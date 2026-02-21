import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, createUserProfile, getUserProfile, updateUserProfile, saveFoodScan, getScanStats, getFoodScans } from '../lib/supabase';

const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async (userId: string) => {
      try {
        const p = await getUserProfile(userId);
        if (isMounted) setProfile(p);
      } catch (error) {
        console.error('Failed to load user profile:', error);
        if (isMounted) setProfile(null);
      }
    };

    const initializeAuth = async () => {
      try {
        const { data: { session } }: any = await supabase.auth.getSession();
        if (!isMounted) return;

        setUser(session?.user || null);
        setLoading(false);

        if (session?.user) {
          loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } }: any = supabase.auth.onAuthStateChange(async (_, session: any) => {
      if (!isMounted) return;

      setUser(session?.user || null);

      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string) => {
    const { data, error } = await supabase.auth.signUp({
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
    
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists');
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

  const fetchUserProfile = async () => {
    if (!user) return null;
    const data = await getUserProfile(user.id);
    setProfile(data);
    return data;
  };

  const updateProfile = async (updates: any) => {
    if (!user) throw new Error('User not authenticated');
    await updateUserProfile(user.id, updates);
    const updated = await getUserProfile(user.id);
    setProfile(updated);
    return updated;
  };

  return (
    <AuthContext.Provider value={{ 
      user,
      profile,
      loading, 
      signIn, 
      signUp, 
      signOut,
      recordScan,
      fetchScanStats,
      fetchFoodScans,
      fetchUserProfile,
      updateUserProfile: updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
