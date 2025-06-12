// filepath: c:\Users\Veritas\Desktop\wavenet\frontend\src\types\index.ts
export interface User {
  _id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  _id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  token: string;
}

export interface Share {
  userId: User | string; // Can be populated User object or just ID string
  email: string;
  role: "read" | "write" | "owner";
}

export interface Note {
  _id: string;
  title: string;
  content: string;
  creator: User | string; // Can be populated User object or just ID string
  sharedWith: Share[];
  createdAt: string;
  updatedAt: string;
  isArchived: boolean; // Added isArchived field
  isSharedByCurrentUser?: boolean; // New field
}

export interface DecodedToken {
  userId: string;
  iat: number;
  exp: number;
}

// For form validations
export type LoginFormData = {
  email: string;
  password: string;
};

export type RegisterFormData = {
  username: string;
  email: string;
  password: string;
  confirmPassword?: string; // Optional, for client-side validation
};

export type CreateNoteFormData = {
  title: string;
  content?: string;
};

export type ShareNoteFormData = {
  email: string;
  role: "read" | "write";
};

export interface Notification {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
  timestamp: Date;
  read: boolean;
  actionLink?: string; // Link for an action button like "View Note"
  actionable?: boolean; // Whether the actionLink should be displayed/is active
  isArchived?: boolean; // Added for archive notifications
  refreshKey?: string; // Added to help force component refresh on navigation
}
