'use client';

import LoginForm from '@/components/auth/LoginForm';

const LoginPage = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-8 bg-card text-card-foreground rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Login</h1>
          <p className="text-muted-foreground">Access your collaborative notes</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
