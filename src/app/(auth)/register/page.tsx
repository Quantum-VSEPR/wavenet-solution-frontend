'use client';

import RegisterForm from '@/components/auth/RegisterForm';
import { motion } from 'framer-motion'; // Import motion

const RegisterPage = () => {
  // Animation variants for the card
  const cardVariants = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.1, 0.25, 1], // Smooth cubic bezier
        delay: 0.2, // Slight delay for the card to appear after background elements
      },
    },
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-gray-800 to-slate-900 text-white p-6 overflow-hidden">
      {/* Animated background shapes - subtle and less intrusive */}
      <motion.div
        className="fixed top-0 left-0 w-64 h-64 bg-blue-600/20 rounded-full filter blur-3xl opacity-70"
        style={{ top: '10%', left: '15%' }} // Positioned more subtly
        animate={{ x: [0, 20, 0], y: [0, -20, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 25, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <motion.div
        className="fixed bottom-0 right-0 w-72 h-72 bg-purple-600/20 rounded-full filter blur-3xl opacity-70"
        style={{ bottom: '5%', right: '10%' }} // Positioned more subtly
        animate={{ x: [0, -25, 0], y: [0, 25, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 30, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <motion.div
        className="fixed top-1/2 left-1/2 w-80 h-80 bg-green-600/15 rounded-lg filter blur-2xl opacity-50"
        style={{ transform: 'translate(-50%, -50%)' }} // Centered, but behind content
        animate={{ rotate: [0, 360], scale: [1, 1.1, 1, 1.1, 1]}}
        transition={{ duration: 40, repeat: Infinity, repeatType: "loop", ease: "linear" }}
      />

      <motion.div
        className="w-full max-w-md p-8 space-y-6 bg-slate-800/70 text-slate-100 rounded-xl shadow-2xl backdrop-blur-lg border border-slate-700/50 z-10"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="text-center">
          <motion.h1 
            className="text-4xl font-bold text-accentPrimary mb-2"
            initial={{ opacity:0, y: -10}} animate={{opacity:1, y:0}} transition={{delay:0.3, duration:0.4}}
          >
            Create Your Account
          </motion.h1>
          <motion.p 
            className="text-slate-300"
            initial={{ opacity:0, y: -10}} animate={{opacity:1, y:0}} transition={{delay:0.4, duration:0.4}}
          >
            Join WaveNet Notes and start collaborating.
          </motion.p>
        </div>
        <RegisterForm />
      </motion.div>
    </div>
  );
};

export default RegisterPage;
