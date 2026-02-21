import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking } from 'react-native';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase, createUserProfile, getUserProfile, updateUserProfile, saveFoodScan, getScanStats, getFoodScans } from '../lib/supabase';

const AuthContext = createContext<any>(null);
const EMAIL_CONFIRMATION_REDIRECT_URL = 'nutrisignal://auth/callback';

const getQueryParam = (url: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = url.match(new RegExp(`[?&]${escapedKey}=([^&#]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

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

    const refreshSessionState = async () => {
      const { data: { session } }: any = await supabase.auth.getSession();
      if (!isMounted) return;

      setUser(session?.user || null);

      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    };

    const handleAuthDeepLink = async (url: string) => {
      try {
        const tokenHash = getQueryParam(url, 'token_hash');
        const type = getQueryParam(url, 'type') as EmailOtpType | null;

        if (!tokenHash || !type) return;

        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });

        if (error) {
          console.error('Email confirmation failed:', error);
          return;
        }

        if (!isMounted) return;
        setAuthMessage('Email confirmed — you’re all set.');
        await refreshSessionState();
      } catch (error) {
        console.error('Failed to process auth deep link:', error);
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

    const processInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleAuthDeepLink(initialUrl);
      }
    };

    processInitialUrl();

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });

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
      linkingSubscription.remove();
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
        emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
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

  const clearAuthMessage = () => {
    setAuthMessage(null);
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
      authMessage,
      loading, 
      signIn, 
      signUp, 
      signOut,
      clearAuthMessage,
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
