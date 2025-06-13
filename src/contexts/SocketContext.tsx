"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Socket, io as socketIO } from 'socket.io-client';
import { useAuth } from './AuthContext'; 
import { useNotifications } from './NotificationContext';
import { Note, Notification } from '@/types'; // Removed User import
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:5001';

// Payload for when another user starts/stops editing
export interface UserEditingStatusPayload {
  noteId: string;
  userId: string;
  username: string;
}

// Interface for notesListUpdated event
interface NotesListUpdatePayload {
  noteId: string;
  action: 'archive' | 'unarchive' | 'delete' | 'create';
  actorId: string; 
  message?: string; 
}

// Interface for the newSharedNote event, now with a message
interface NewSharedNotePayload extends Note { 
    message?: string;
    sharerUsername?: string; 
    roleYouWereGiven?: 'read' | 'write'; // Added from backend payload
}

// Interface for noteSharingUpdated event, now with a message and actor
interface NoteSharingUpdatedPayload {
  note: Note; 
  updatedByUserId: string; 
  message?: string; 
  // This interface is used by a socket event listener, even if not explicitly called elsewhere in this file.
  // It's kept for consistency with backend event payloads.
}

// Interface for the new noteSharingConfirmation event (for owner)
interface NoteSharingConfirmationPayload {
  note: Note;
  message: string;
  recipientEmail?: string;
  sharedNoteId?: string;
  newRole?: 'read' | 'write';
  actionType?: 'share' | 'update_role' | 'unshare';
}

// Interface for receiveNoteUpdateNotification event (now notifyNoteUpdatedByOther)
interface NotifyNoteUpdatedByOtherPayload {
  noteId: string;
  noteTitle: string;
  message: string;
  editorUsername: string;
  updatedAt: string; // Assuming this is an ISO string
  type: Notification['type']; // e.g., 'info', 'warning'
  actionable?: boolean; // If the notification suggests an action
  // Removed refreshKey as its purpose might be covered by incrementNotesVersion
}

// Interface for the noteUpdateSuccess event (for the updater)
interface NoteUpdateSuccessPayload {
  noteId: string;
  title: string;
  message: string;
  isAutoSave: boolean;
}

interface SocketContextType {
  socketInstance: Socket | null;
  isConnected: boolean;
  notesVersion: number;
  incrementNotesVersion: () => void;
  newSharedItemCounter: number;
  incrementNewSharedItemCounter: () => void;
  resetNewSharedItemCounter: () => void;
  emitUserEditing: (noteId: string, isEditing: boolean) => void;
  emitUserStoppedEditing: (noteId: string) => void; 
  emitUserFinishedEditingWithContent: (noteId: string, title: string, content: string | object) => void; // Changed 'any' to 'string | object' for content
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const { addNotification } = useNotifications();
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notesVersion, setNotesVersion] = useState(0);
  const [newSharedItemCounter, setNewSharedItemCounter] = useState(0);
  const pathname = usePathname();
  const router = useRouter(); // Initialize router
  const { toast } = useToast(); 

  const incrementNotesVersion = useCallback(() => {
    setNotesVersion(prev => prev + 1);
  }, []);

  const incrementNewSharedItemCounter = useCallback(() => {
    setNewSharedItemCounter(prev => {
      const newValue = prev + 1;
      // Log when the function is called and the values
      console.log(`[SocketContext] incrementNewSharedItemCounter called. Old value: ${prev}, New value: ${newValue}`);
      return newValue;
    });
  }, []);

  // Add a useEffect to log when newSharedItemCounter state actually changes
  useEffect(() => {
    console.log(`[SocketContext] newSharedItemCounter state updated to: ${newSharedItemCounter}`);
  }, [newSharedItemCounter]);

  const resetNewSharedItemCounter = useCallback(() => {
    setNewSharedItemCounter(0);
  }, []);

  useEffect(() => {
    if (token && user) {
      const newSocket = socketIO(SOCKET_SERVER_URL, {
        query: { token },
        transports: ['websocket', 'polling'],
      });
      setSocketInstance(newSocket);

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('[SocketContext] Connected to socket server');
        if (user?._id) newSocket.emit('registerUser', user._id);
      });

      newSocket.on('disconnect', (reason) => {
        setIsConnected(false);
        console.log('[SocketContext] Disconnected from socket server:', reason);
      });

      newSocket.on('connect_error', (error) => {
        console.error('[SocketContext] Connection error:', error);
        toast({ title: "Socket Connection Error", description: error.message, variant: "destructive" });
      });
      
      newSocket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[SocketContext] Reconnect attempt ${attempt}`);
      });

      newSocket.io.on('reconnect', (attempt) => {
        console.log(`[SocketContext] Reconnected after ${attempt} attempts`);
        if (user?._id) newSocket.emit('registerUser', user._id);
      });

      newSocket.io.on('reconnect_failed', () => {
        console.error('[SocketContext] Failed to reconnect after multiple attempts.');
        toast({ title: "Reconnect Failed", description: "Failed to reconnect to the server. Please check your connection.", variant: "destructive" });
      });

      return () => {
        console.log('[SocketContext] Disconnecting socket...');
        newSocket.disconnect();
        setSocketInstance(null);
        setIsConnected(false);
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, toast]); 

  useEffect(() => {
    if (socketInstance && socketInstance.connected && user && user._id) { 
      console.log("[SocketContext] Setting up event listeners for user:", user._id);
      const currentUserId = user._id;

      const handleNotesListUpdated = (data: NotesListUpdatePayload) => {
        console.log("[SocketContext] Received notesListUpdated:", data);
        if (data.actorId !== currentUserId) {
          incrementNotesVersion();
          if (data.message) {
            addNotification(data.message, 'info', data.noteId); // Corrected: 3 arguments
          }
        }
      };
      socketInstance.on("notesListUpdated", handleNotesListUpdated);

      const handleNewSharedNote = (data: NewSharedNotePayload) => {
        console.log("[SocketContext] Received newSharedNote:", data);
        const message = data.message || `Note '${data.title}' has been shared with you by ${data.sharerUsername || 'a user'}.`;
        addNotification(message, 'success', data._id); // Changed type to 'success'
        incrementNotesVersion();
        incrementNewSharedItemCounter(); // Increment bell counter for new shares
      };
      socketInstance.on("newSharedNote", handleNewSharedNote);
      
      const handleNoteSharingConfirmation = (data: NoteSharingConfirmationPayload) => {
        console.log("[SocketContext] Received noteSharingConfirmation (for owner):", data);
        if (data.message) {
          toast({ title: "Note Shared", description: data.message, variant: "default" });
        }
        incrementNotesVersion(); 
        // No incrementNewSharedItemCounter for the owner
      };
      socketInstance.on("noteSharingConfirmation", handleNoteSharingConfirmation);

      const handleNotifyNoteUpdatedByOther = (data: NotifyNoteUpdatedByOtherPayload) => {
        console.log("[SocketContext] Received notifyNoteUpdatedByOther:", data);
        if (data.editorUsername !== user.username) {
          addNotification(data.message, data.type, data.noteId);
          // No automatic notesVersion increment here, NoteEditor handles its state
        }
      };
      socketInstance.on("notifyNoteUpdatedByOther", handleNotifyNoteUpdatedByOther);
      
      const handleNoteUpdateSuccess = (data: NoteUpdateSuccessPayload) => {
        console.log("[SocketContext] Received noteUpdateSuccess (for updater):", data);
        if (!data.isAutoSave) { // Only show toast for manual saves
          toast({ title: "Note Saved", description: data.message, variant: "default" });
        }
        // Potentially increment notesVersion if the update could affect list views (e.g. last updated sort)
        // incrementNotesVersion(); // Consider if this is needed or if editor handles it
      };
      socketInstance.on("noteUpdateSuccess", handleNoteUpdateSuccess);

      const handleNoteUnsharedToUser = (data: { noteId: string; title: string; message: string; unsharerId?: string }) => {
        console.log("[SocketContext] Received noteUnsharedToUser (specific to me):", data);
        addNotification(data.message, 'warning', data.noteId);
        incrementNotesVersion(); // To refresh lists like "Shared with me"

        if (pathname === `/notes/${data.noteId}`) {
          toast({
            title: "Access Removed",
            description: `Your access to the note "${data.title}" has been revoked. You will be redirected to the dashboard.`,
            variant: "destructive",
            duration: 5000,
          });
          setTimeout(() => {
            router.push('/dashboard');
          }, 4500); 
        }
      };
      socketInstance.on("noteUnsharedToUser", handleNoteUnsharedToUser);
      
      // Listener for when the current user successfully updates a note (for toast)
      const handleUserEditingStatus = (data: UserEditingStatusPayload & { isEditing: boolean }) => {
        if (data.userId !== currentUserId) {
          // This is where you might update UI to show who is editing
          console.log(`[SocketContext] User ${data.username} ${data.isEditing ? 'started' : 'stopped'} editing note ${data.noteId}`);
          // Example: toast({ description: `User ${data.username} ${data.isEditing ? 'started' : 'stopped'} editing this note.`});
        }
      };
      socketInstance.on("userEditingStatus", handleUserEditingStatus);


      return () => {
        console.log("[SocketContext] Cleaning up event listeners for user:", user._id);
        if (socketInstance) {
          socketInstance.off("notesListUpdated", handleNotesListUpdated);
          socketInstance.off("newSharedNote", handleNewSharedNote);
          socketInstance.off("noteSharingConfirmation", handleNoteSharingConfirmation);
          socketInstance.off("notifyNoteUpdatedByOther", handleNotifyNoteUpdatedByOther);
          socketInstance.off("noteUpdateSuccess", handleNoteUpdateSuccess);
          socketInstance.off("noteUnsharedToUser", handleNoteUnsharedToUser);
          socketInstance.off("userEditingStatus", handleUserEditingStatus);
        }
      };
    }
  }, [socketInstance, user, addNotification, incrementNotesVersion, pathname, router, toast, incrementNewSharedItemCounter]); // Added incrementNewSharedItemCounter

  const emitUserEditing = useCallback((noteId: string, isEditing: boolean) => {
    if (socketInstance && user) {
      socketInstance.emit('userEditingNote', { noteId, userId: user._id, username: user.username, isEditing });
    }
  }, [socketInstance, user]);

  const emitUserStoppedEditing = useCallback((noteId: string) => { // Kept for explicitness if needed
    if (socketInstance && user) {
      socketInstance.emit('userStoppedEditingNote', { noteId, userId: user._id, username: user.username });
    }
  }, [socketInstance, user]);

  const emitUserFinishedEditingWithContent = useCallback((noteId: string, title: string, content: string | object) => { // Changed 'any' to 'string | object' for content
    if (socketInstance && user) {
      console.log(`[SocketContext] Emitting userFinishedEditingNoteWithContent for note ${noteId} by user ${user.username}`);
      socketInstance.emit('userFinishedEditingNoteWithContent', {
        noteId,
        title,
        content,
        editorId: user._id,
        editorUsername: user.username,
      });
    }
  }, [socketInstance, user]);


  return (
    <SocketContext.Provider value={{ 
      socketInstance, 
      isConnected, 
      notesVersion, 
      incrementNotesVersion,
      newSharedItemCounter,
      incrementNewSharedItemCounter,
      resetNewSharedItemCounter,
      emitUserEditing,
      emitUserStoppedEditing,
      emitUserFinishedEditingWithContent
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) { // Corrected: Removed extra parenthesis
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
