'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Zap, Edit3, Users, Share2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

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

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || (!isLoading && user)) {
    return (
      <div className="flex flex-col items-center justify-center  bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
      },
    },
  };

  const iconVariants = {
    initial: { scale: 0.5, opacity: 0, rotate: -180 },
    animate: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: { type: 'spring', stiffness: 260, damping: 20, delay: 0.5 },
    },
  };

  const featureCardVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 50,
      },
    },
  };

  const features = [
    {
      icon: <Edit3 className="h-10 w-10 text-blue-400" />,
      title: 'Intuitive Editing',
      description: 'Effortlessly create and format notes with our rich text editor.',
    },
    {
      icon: <Users className="h-10 w-10 text-green-400" />,
      title: 'Real-time Collaboration',
      description: 'Work together seamlessly with live updates and shared cursors.',
    },
    {
      icon: <Share2 className="h-10 w-10 text-purple-400" />,
      title: 'Easy Sharing',
      description: 'Share notes with a link or invite collaborators directly.',
    },
    {
      icon: <ShieldCheck className="h-10 w-10 text-red-400" />,
      title: 'Secure & Private',
      description: 'Your notes are encrypted and protected, ensuring your data stays safe.',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center  bg-gradient-to-br from-slate-900 via-gray-800 to-slate-900 text-white p-6 "> {/* Added overflow-x-hidden */}
      {/* Animated background shapes - subtle and less intrusive */}
      <motion.div
        className="bg-blue-600/30 rounded-full filter blur-3xl"
        animate={{ x: [0, 50, 0], y: [0, 25, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 20, repeat: Infinity, repeatType: "mirror" }}
      />
      <motion.div
        className="bg-purple-600/30 rounded-full filter blur-3xl"
        animate={{ x: [0, -50, 0], y: [0, -25, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 25, repeat: Infinity, repeatType: "mirror" }}
      />
       <motion.div
        className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/3 w-60 h-60 bg-green-600/20 rounded-lg filter blur-2xl"
        animate={{ rotate: [0, 360], scale: [1, 1.15, 1]}}
        transition={{ duration: 30, repeat: Infinity, repeatType: "loop" }}
      />

      {/* Original Welcome Section with Animations */}
      <motion.div
        className="text-center max-w-md z-10 relative" // Added relative for stacking context
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={iconVariants} initial="initial" animate="animate">
          <Zap className="mx-auto h-20 w-20 text-accentPrimary mb-6 drop-shadow-[0_0_10px_rgba(var(--accent-primary)/0.4)]" />
        </motion.div>
        <motion.h1
          className="text-5xl font-bold mb-4 text-slate-100"
          variants={itemVariants}
        >
          Welcome to WaveNet Solutions
        </motion.h1>
        <motion.p
          className="text-lg text-slate-300 mb-8"
          variants={itemVariants}
        >
          Your collaborative space for seamless note-taking and sharing.
          Capture ideas, organize thoughts, and work together in real-time.
        </motion.p>
        <motion.div className="space-x-4" variants={itemVariants}>
          <Button asChild size="lg" className="bg-accentPrimary hover:bg-accentPrimary/90 text-accentPrimary-foreground font-semibold px-8 py-3 rounded-md shadow-md transform hover:scale-105 transition-transform duration-200">
            <Link href="/login">Login</Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="border-accentPrimary text-accentPrimary hover:bg-accentPrimary hover:text-accentPrimary-foreground font-semibold px-8 py-3 rounded-md shadow-md transform hover:scale-105 transition-transform duration-200">
            <Link href="/register">Sign Up</Link>
          </Button>
        </motion.div>
      </motion.div>

      {/* Features Section - Added below the original content */}
      <motion.div
        className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl z-10 relative" // Added relative
        variants={containerVariants} // Reuse container for stagger
        initial="hidden"
        animate="visible"
      >
        {features.map((feature, index) => (
          <motion.div
            key={index}
            className="bg-slate-800/60 p-6 rounded-lg shadow-lg backdrop-blur-sm border border-slate-700/50 hover:border-yellow-500/70 transition-colors duration-300 flex flex-col items-center"
            variants={featureCardVariants}
            // custom={index} // Removed custom prop
          >
            <div className="flex items-center justify-center mb-4 bg-slate-700/70 w-16 h-16 rounded-full">
              {/* Example: Use accentSecondary for some icons if desired, or keep as is */}
              {/* {React.cloneElement(feature.icon, { className: feature.icon.props.className.replace('text-blue-400', 'text-accentSecondary') })} */}
              {feature.icon} 
            </div>
            <h3 className="text-xl font-semibold mb-2 text-center text-accentPrimary">{feature.title}</h3>
            <p className="text-slate-300 text-center text-sm leading-relaxed">{feature.description}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Updated Footer with Card Style and Animations */}
      <motion.footer
        className="mt-20 mb-10 w-full max-w-3xl z-10"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, type: 'spring', stiffness: 50 }} // Footer card animates in
      >
        <div className="bg-slate-800/70 p-8 rounded-xl shadow-2xl backdrop-blur-lg border border-slate-700/60 text-center">
          <motion.h3
            className="text-2xl font-semibold text-accentPrimary mb-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }} // Delay relative to footer card
          >
            WaveNet Notes
          </motion.h3>
          <motion.p
            className="text-slate-300 mb-5 leading-relaxed max-w-lg mx-auto"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Capture your brilliant ideas, organize your projects seamlessly, and collaborate in real-time.
            WaveNet Notes is your partner in productivity.
          </motion.p>
          <motion.div
            className="flex justify-center space-x-6 my-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Link href="#" aria-label="Follow WaveNet Notes on Twitter" className="text-slate-400 hover:text-accentPrimary transition-colors duration-300">
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-7 h-7" aria-hidden="true"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
            </Link>
            <Link href="#" aria-label="WaveNet Notes on GitHub" className="text-slate-400 hover:text-accentPrimary transition-colors duration-300">
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-7 h-7" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.378.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.001 10.001 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
            </Link>
            <Link href="#" aria-label="Contact WaveNet Notes" className="text-slate-400 hover:text-accentPrimary transition-colors duration-300">
              <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="w-7 h-7" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"></path></svg>
            </Link>
          </motion.div>
          <motion.p
            className='text-slate-500 text-xs'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            &copy; {new Date().getFullYear()} WaveNet Notes. All rights reserved. <br />
            Crafted with <motion.span className="inline-block text-accentSecondary" animate={{scale:[1,1.2,1]}} transition={{duration:1, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}>❤️</motion.span> and modern web technologies.
          </motion.p>
        </div>
      </motion.footer>
    </div>
  );
}
