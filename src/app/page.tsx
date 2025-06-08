'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Zap } from 'lucide-react'; // Using Zap as a placeholder for a logo/icon

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || (!isLoading && user)) {
    // Show a loading state or nothing while redirecting
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-secondary/30 p-6">
      <div className="text-center max-w-md">
        <Zap className="mx-auto h-20 w-20 text-primary mb-6" /> 
        <h1 className="text-5xl font-bold mb-4 text-foreground">
          Welcome to WaveNet Notes
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Your collaborative space for seamless note-taking and sharing. 
          Capture ideas, organize thoughts, and work together in real-time.
        </p>
        <div className="space-x-4">
          <Button asChild size="lg">
            <Link href="/login">Login</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/register">Sign Up</Link>
          </Button>
        </div>
      </div>
      <footer className="absolute bottom-8 text-center text-muted-foreground text-sm">
        <p>&copy; {new Date().getFullYear()} WaveNet Notes. All rights reserved.</p>
        <p className="mt-1">
          Powered by Next.js, Tailwind CSS, and a lot of coffee.
        </p>
      </footer>
    </div>
  );
}

// Helper component for loading state (can be moved to a separate file if used elsewhere)
const Loader2 = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
