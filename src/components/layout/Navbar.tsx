// filepath: c:\Users\Veritas\Desktop\wavenet\frontend\src\components\layout\Navbar.tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '../mode-toggle'; // Adjusted path
import NotificationBell from './NotificationBell'; // Added

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <nav className="bg-background border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="text-2xl font-bold">
            WaveNet Notes
          </Link>
          <div className="flex items-center space-x-4">
            <ModeToggle />
            {user ? (
              <>
                <NotificationBell /> {/* Added */}
                <span className="text-sm">Hi, {user.username}</span>
                <Button variant="outline" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/register">Sign Up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
