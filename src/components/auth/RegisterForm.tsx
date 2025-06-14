'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast'; // Corrected import path
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { AxiosError } from 'axios';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long').max(20, 'Username must be at most 20 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

// Define a type for the expected success response
interface RegisterSuccessResponse {
  message: string;
}

// Define a type for the expected error response
interface ErrorResponse {
  message: string;
  errors?: Array<{ msg: string; param?: string }>; // Optional: if your backend sends detailed errors
}

const RegisterForm = () => {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false); // Added isLoading state

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true); // Set isLoading to true
      // Use the specific success response type here
      const response = await api.post<RegisterSuccessResponse>('/auth/register', values);
      toast({
        title: 'Registration Successful',
        description: response.data.message || 'You have successfully registered.',
      });
      router.push('/login');
    } catch (error) {
      let errorMessage = 'An error occurred during registration.';
      if (error instanceof AxiosError) {
        const errorData = error.response?.data as ErrorResponse | undefined;
        if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        title: 'Registration Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false); // Set isLoading to false
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
          <CardTitle className="text-3xl font-bold text-center text-[hsl(var(--accent-primary))]">Register</CardTitle>
          <CardDescription className="text-center text-neutral-200 dark:text-neutral-300">
            Create an account to start your note-taking journey.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-neutral-100 dark:text-neutral-200">Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Your username" {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-neutral-100 dark:text-neutral-200">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="your.email@example.com" {...field} className="bg-background" />
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
                      <Input type="password" placeholder="********" {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-[hsl(var(--accent-primary))] hover:bg-[hsl(var(--accent-primary)/0.9)] text-[hsl(var(--accent-primary-foreground))]" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : 'Register'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
            <p className="text-sm text-neutral-200 dark:text-neutral-300">
                Already have an account?
                <Link href="/login" className="ml-1 font-semibold text-[hsl(var(--accent-primary))] hover:underline">
                    Login here
                </Link>
            </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default RegisterForm;
