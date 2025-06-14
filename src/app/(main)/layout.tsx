"use client";

import React from 'react';
import Navbar from '@/components/layout/Navbar';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { motion } from 'framer-motion'; // Import motion

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen text-foreground bg-gradient-to-br from-[hsl(var(--gradient-start))] via-[hsl(var(--gradient-middle))] to-[hsl(var(--gradient-end))] relative overflow-x-hidden">
        <motion.div
          className="absolute top-0 left-0 w-72 h-72 bg-[hsl(var(--blob-color-1))] rounded-full filter blur-3xl opacity-30 animate-blob"
          style={{ animationDelay: '0s' }}
        />
        <motion.div
          className="absolute top-0 right-0 w-72 h-72 bg-[hsl(var(--blob-color-2))] rounded-full filter blur-3xl opacity-30 animate-blob"
          style={{ animationDelay: '2s' }}
        />
        <motion.div
          className="absolute bottom-0 left-1/4 w-72 h-72 bg-[hsl(var(--blob-color-3))] rounded-full filter blur-3xl opacity-30 animate-blob"
          style={{ animationDelay: '4s' }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-72 h-72 bg-[hsl(var(--blob-color-4))] rounded-full filter blur-3xl opacity-30 animate-blob"
          style={{ animationDelay: '6s' }}
        />

        <Navbar />
        <main className="flex-grow container mx-auto px-4 py-8 relative z-10">
          {children}
        </main>
        {/* You can add a footer here if needed */}
      </div>
    </ProtectedRoute>
  );
};

export default MainLayout;
