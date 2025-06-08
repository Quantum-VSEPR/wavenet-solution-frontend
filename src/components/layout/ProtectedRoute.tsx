// filepath: c:\Users\Veritas\Desktop\wavenet\frontend\src\components\layout\ProtectedRoute.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Progress } from '@/components/ui/progress'; // Assuming you have a Progress component for loading state

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user && !token) {
      router.replace('/login');
    }
  }, [user, isLoading, token, router]);

  if (isLoading) {
    // You can replace this with a more sophisticated loading spinner or skeleton screen
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-1/2">
            <Progress value={50} className="w-full" /> {/* Example usage of Progress component*/}
            <p className="text-center mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !token) {
    // This will prevent a flash of content before redirect
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
