import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  avatar_url?: string;
  balance: number;
  role: 'user' | 'manager' | 'admin';
  is_flagged?: boolean;
  flagged_reason?: string;
  email_verified_at?: string | null;
  email_verified_by_admin?: boolean;
  phone_verified?: boolean;
  country?: string;
  state?: string;
  gender?: string;
  date_of_birth?: string;
  email_notifications?: boolean;
  created_at?: string;
  last_login_at?: string | null;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  role: 'user' | 'manager' | 'admin' | undefined;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null; user?: UserProfile | null }>;
  signUp: (email: string, password: string, username?: string, name?: string) => Promise<{ error: string | null; user?: UserProfile | null }>;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const savedUser = localStorage.getItem('auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    const activeToken = localStorage.getItem('auth_token');
    if (!activeToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      if (res.data?.user) {
        setUser(res.data.user);
        localStorage.setItem('auth_user', JSON.stringify(res.data.user));
      }
    } catch (e) {
      console.warn('Failed to fetch authenticated user profile', e);
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data?.token && res.data?.user) {
        login(res.data.token, res.data.user);
        return { error: null, user: res.data.user };
      }
      return { error: 'Invalid login response.', user: null };
    } catch (e: any) {
      const msg =
        e.response?.data?.message ||
        e.response?.data?.errors?.email?.[0] ||
        'Invalid login credentials.';
      return { error: msg, user: null };
    }
  };

  const signUp = async (email: string, password: string, username?: string, name?: string) => {
    try {
      const res = await api.post('/auth/register', {
        email,
        password,
        password_confirmation: password,
        username: username || email.split('@')[0],
        name: name || username || email.split('@')[0],
      });
      if (res.data?.token && res.data?.user) {
        login(res.data.token, res.data.user);
        return { error: null, user: res.data.user };
      }
      return { error: 'Failed to create account.', user: null };
    } catch (e: any) {
      const msg =
        e.response?.data?.message ||
        (e.response?.data?.errors ? Object.values(e.response.data.errors).flat()[0] : null) ||
        'Failed to register account.';
      return { error: msg, user: null };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user,
        role: user?.role,
        token,
        loading,
        login,
        logout,
        signOut: logout,
        signIn,
        signUp,
        refreshUser,
        refreshProfile: refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
