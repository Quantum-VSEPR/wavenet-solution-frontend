"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuth } from './AuthContext'; // Assuming useAuth provides user status
import { useNotifications } from './NotificationContext'; // Added

// You might need to define or import a type similar to PopulatedNote from your backend
// For example, in your frontend/src/types/index.ts:
// export interface PopulatedNoteType {
//   _id: string;
//   title: string;
//   creator: { _id: string; username: string; email: string; };
//   sharedWith: Array<{ userId: { _id: string; username: string; email: string; }; role: string; email: string; }>;
//   // ... other relevant fields
// }

interface SocketContextType {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const { user, token, isLoading } = useAuth(); // Get user, token, and loading state
  const { addNotification } = useNotifications(); // Added

  const connect = useCallback(() => {
    if (user && token && (!socketInstance || !socketInstance.connected)) {
      console.log("Attempting to connect socket...");
      const newSocket = getSocket();
      setSocketInstance(newSocket);
    }
  }, [user, token, socketInstance]);

  const disconnect = useCallback(() => {
    if (socketInstance) {
      console.log("Attempting to disconnect socket...");
      disconnectSocket();
      setSocketInstance(null);
    }
  }, [socketInstance]);

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) {
      return;
    }

    if (user && token) {
      connect();
    } else {
      disconnect();
    }

    // Cleanup on component unmount
    return () => {
      if (socketInstance?.connected) {
        // disconnect(); // Avoid calling disconnect directly here if it causes issues with re-renders or dependencies.
                       // The dependency array [user, token, isLoading] should handle re-connection/disconnection.
                       // Let's rely on the main effect logic for disconnect on user/token change.
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, isLoading, connect, disconnect]); // connect and disconnect are stable

  // Event listeners effect
  useEffect(() => {
    if (socketInstance) {
      const handleReceiveNotification = (data: { message: string, type: "info" | "success" | "error" | "warning", noteId?: string }) => {
        addNotification(data.message, data.type, data.noteId);
      };

      const handleNoteSharedWithYou = (data: {
        noteId: string;
        noteTitle: string;
        sharedByUsername: string;
        message: string;
      }) => {
        console.log("Socket event: noteSharedWithYou received", data);
        addNotification(
          data.message,
          "info",
          data.noteId
        );
      };

      const handleNotesListUpdated = (updatedNote: any /* Replace 'any' with your PopulatedNoteType */) => {
        console.log("Socket event: notesListUpdated received", updatedNote);
        // TODO: Implement logic to refresh relevant note lists (e.g., "My Notes", "Shared With Me").
        // This is crucial for real-time updates without page reload.
        // How you do this depends on your state management for notes:
        // 1. If using React Query or SWR: Invalidate queries for note lists.
        //    e.g., queryClient.invalidateQueries(['myNotes']);
        //          queryClient.invalidateQueries(['sharedWithMeNotes']);
        // 2. If using Context API for notes: Call a function from that context to refresh or update notes.
        // 3. If fetching directly in components: You might need to lift state up or use a
        //    different mechanism (like a custom event emitter or another context update)
        //    to signal components to re-fetch.

        // Example check (you'll need access to the current user's ID):
        // const currentUserId = user?._id;
        // const isCreator = updatedNote.creator?._id === currentUserId;
        // const isSharedWithCurrentUser = updatedNote.sharedWith?.some(share => share.userId?._id === currentUserId);
        // if (isCreator || isSharedWithCurrentUser) {
        //   console.log("This note update is relevant to the current user. Triggering list refresh.");
        //   // Trigger your refresh logic here
        // }
      };

      socketInstance.on('receiveNotification', handleReceiveNotification);
      socketInstance.on('noteSharedWithYou', handleNoteSharedWithYou);
      socketInstance.on('notesListUpdated', handleNotesListUpdated); // Added listener

      // Register user with socket server for direct messaging
      if (user?._id) {
        socketInstance.emit('registerUser', user._id);
        console.log(`Socket: Emitted registerUser for ${user._id}`);
      }

      return () => {
        socketInstance.off('receiveNotification', handleReceiveNotification);
        socketInstance.off('noteSharedWithYou', handleNoteSharedWithYou);
        socketInstance.off('notesListUpdated', handleNotesListUpdated); // Cleanup listener
      };
    }
  }, [socketInstance, addNotification, user]); // Added user to dependency array

  return (
    <SocketContext.Provider value={{ socket: socketInstance, connect, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) { // Corrected: wrapped condition in parentheses
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
