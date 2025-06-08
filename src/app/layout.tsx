import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"; // Assuming you have a ThemeProvider
import { AuthProvider } from "@/contexts/AuthContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { NotificationProvider } from "@/contexts/NotificationContext"; // Added
import { Toaster } from "@/components/ui/toaster";
import Navbar from "@/components/layout/Navbar"; // Import Navbar

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Collaborative Notes App",
  description: "A real-time collaborative note-taking application.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <NotificationProvider> {/* Moved NotificationProvider to wrap SocketProvider */}
              <SocketProvider>
                {/* Navbar can be placed here if it's truly global, 
                    or within specific layouts like (main)/layout.tsx if only for authenticated sections */}
                {children}
                <Toaster />
              </SocketProvider>
            </NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
