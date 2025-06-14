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
    <nav className="bg-transparent border-b border-white/20 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16"> {/* Reverted navbar height */}
          {/* Left side: Logo */}
          <Link href={user ? "/dashboard" : "/"} className="text-2xl font-bold text-foreground">
            WaveNet
          </Link>

          {/* Middle: Search Bar - REMOVED */}

          {/* Right side: Controls */}
          <div className="flex items-center space-x-3 md:space-x-4">
            <ModeToggle />
            {user ? (
              <>
                <NotificationBell /> {/* Added */}
                <span className="text-sm text-foreground">Hi, {user.username}</span>
                <Button variant="outline" onClick={handleLogout} className="text-foreground border-foreground hover:bg-foreground/10 hover:text-foreground">
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" asChild className="text-foreground border-foreground hover:bg-foreground/10 hover:text-foreground">
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild className="bg-accent-primary hover:bg-accent-primary/90 text-accent-primary-foreground">
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
