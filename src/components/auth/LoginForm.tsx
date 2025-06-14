"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
// import { useRouter } from 'next/navigation'; // Not strictly needed if AuthContext handles navigation
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label'; // Not used directly
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthResponse, LoginFormData } from '@/types'; // Ensure LoginFormData is imported if used, or use LoginFormValues
import api from '@/lib/api'; // Import the api utility
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const LoginForm: React.FC = () => {
  const { login, loading, error } = useAuth();
  // const router = useRouter(); // Not strictly needed
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      // Make the API call to the login endpoint
      const response = await api.post<AuthResponse>('/auth/login', data);
      
      // Call the login function from AuthContext with the API response
      login(response.data); 

      toast({
        title: 'Login Successful',
        description: "You're now logged in.",
      });
    } catch (error) {
      let errorMessage = 'Login failed. Please try again.';
      if (error instanceof Error) {
        // Attempt to parse a more specific message if the error object has it (e.g., from API response)
        const apiError = error as any; // Use 'any' carefully or define a more specific error type
        if (apiError.response?.data?.message) {
          errorMessage = apiError.response.data.message;
        } else if (apiError.message) { // Fallback to error.message if response.data.message is not available
          errorMessage = apiError.message;
        }
      }
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-md shadow-xl bg-transparent border-none">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center text-[hsl(var(--accent-primary))]">Login</CardTitle>
          <CardDescription className="text-center text-neutral-200 dark:text-neutral-300">
            Access your account to continue your note-taking journey.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-neutral-100 dark:text-neutral-200">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="m@example.com" {...field} disabled={isLoading} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-neutral-100 dark:text-neutral-200">Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} disabled={isLoading} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button 
                type="submit" 
                className="w-full bg-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.9)] text-[hsl(var(--accent-primary-foreground))]" 
                disabled={isLoading || loading} // Combined isLoading and loading from useAuth
              >
                {(isLoading || loading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Login'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-neutral-200 dark:text-neutral-300">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-semibold text-[hsl(var(--accent-primary))] hover:underline">
              Register here
            </Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default LoginForm;
