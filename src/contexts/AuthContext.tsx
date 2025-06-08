"use client";

import React, { createContext, useState, useCallback, useEffect, ReactNode, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import api from '@/lib/api';
import { User, AuthResponse, DecodedToken } from '@/types';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: AuthResponse) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed', error);
    }
    disconnectSocket(); // Disconnect socket on logout
    router.push('/login');
  }, [router]);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      try {
        const decodedToken = jwtDecode<DecodedToken>(storedToken);
        if (decodedToken.exp * 1000 < Date.now()) {
          // Token expired
          await logout(); // Ensure logout completes
        } else {
          setToken(storedToken);
          // Optionally, fetch user profile here to confirm token validity against backend
          const response = await api.get<User>('/auth/me');
          setUser(response.data);
          getSocket(); // Initialize socket connection
        }
      } catch (error) {
        console.error('Invalid token or auth check failed', error);
        await logout(); // Ensure logout completes
      } finally {
        setIsLoading(false); // Ensure loading is set to false after try/catch
      }
    } else {
      // No token, ensure user is logged out state is clean and loading is false
      setUser(null);
      setToken(null);
      disconnectSocket();
      setIsLoading(false); // Explicitly set isLoading to false here
    }
    // setIsLoading(false); // This was potentially problematic, moved into branches
  }, [logout]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = (data: AuthResponse) => {
    setUser({
      _id: data._id,
      username: data.username,
      email: data.email,
      role: data.role,
      // These might not be in AuthResponse, adjust if needed or fetch separately
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString(),
    });
    setToken(data.token);
    localStorage.setItem('token', data.token);
    getSocket(); // Initialize socket connection
    router.push('/dashboard');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
