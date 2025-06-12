"use client";

import React from 'react';
import Navbar from '@/components/layout/Navbar';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <ProtectedRoute>
        <div className="flex flex-col min-h-screen">
          <header className="sticky top-0 z-50">
            <Navbar />
          </header>
          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>
          {/* You can add a footer here if needed */}
        </div>
    </ProtectedRoute>
  );
};

export default MainLayout;
