"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Socket, io as socketIO } from 'socket.io-client';
import { useAuth } from './AuthContext'; 
import { useNotifications } from './NotificationContext';
import { Note, Notification } from '@/types'; // Removed Share, User as they are not directly used in this file after changes
import { usePathname } from 'next/navigation';
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
  emitUserFinishedEditingWithContent: (noteId: string, title: string, content: any) => void; // Added new emitter
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
      const currentUsername = user.username;

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

      const handleNoteSharingUpdated = (data: NoteSharingUpdatedPayload) => {
        console.log("[SocketContext] Received noteSharingUpdated (for other collaborators):", data);
        // This is for other collaborators, not the owner and not the newly shared user.
        // They should receive an informational update, but not a bell counter increment.
        if (data.updatedByUserId !== currentUserId) { 
          if (data.message) {
            // Informational notification, actionable: false means it won't behave like a new item needing urgent attention.
            addNotification(data.message, 'info', data.note._id); // Corrected: 3 arguments
          }
          incrementNotesVersion(); 
          // DO NOT incrementNewSharedItemCounter() here for this event.
          // The bell update is only for the newly added user (via 'newSharedNote') 
          // or for other specific events that should increment the bell.
        }
      };
      socketInstance.on("noteSharingUpdated", handleNoteSharingUpdated);

      const handleYourShareRoleUpdated = (data: YourShareRoleUpdatedPayload) => {
        console.log("[SocketContext] Received yourShareRoleUpdated:", data);
        const message = data.message || `Your role for note '${data.title}' was updated to ${data.yourNewRole} by ${data.updaterUsername || 'a user'}.`;
        addNotification(message, 'info', data._id);
        incrementNotesVersion();
        incrementNewSharedItemCounter(); // Increment bell counter for role updates
      };
      socketInstance.on("yourShareRoleUpdated", handleYourShareRoleUpdated);

      const handleNoteUnshared = (data: { noteId: string; title: string; unsharerUsername?: string; message?: string }) => {
        console.log("[SocketContext] Received noteUnshared:", data);
        const message = data.message || `You were unshared from the note '${data.title}' by ${data.unsharerUsername || 'the owner'}.`; // Corrected template literal
        // For 'noteUnshared', we pass undefined for noteId to addNotification
        // to prevent the "View Note" button from appearing in NotificationBell.
        addNotification(message, 'warning', undefined); // Pass undefined for noteId
        
        // Also, trigger a toast for the unshared user.
        // This toast should be purely informational and not have actions like "View Note".
        toast({
            title: "Access Removed",
            description: message,
            variant: "default", // Or 'warning' if preferred
        });

        incrementNotesVersion(); // To refresh lists, as the user lost access to a note
        incrementNewSharedItemCounter(); // To make the bell noticeable
      };
      socketInstance.on("noteUnshared", handleNoteUnshared);

      // Listener for when the current user successfully updates a note (for toast)
      const handleNoteUpdateSuccess = (data: NoteUpdateSuccessPayload) => {
        console.log("[SocketContext] Received noteUpdateSuccess (for updater):", data);
        // Show toast only if it's not an autosave or if we decide all saves should toast
        if (!data.isAutoSave) {
          toast({
            title: "Note Updated",
            description: data.message || `Successfully updated '${data.title}'.`,
            variant: "default", 
          });
        }
        incrementNotesVersion(); // Refresh notes list or other dependent data
      };
      socketInstance.on("noteUpdateSuccess", handleNoteUpdateSuccess);

      // Listener for when a note the user is collaborating on is updated by someone else (for bell)
      const handleNotifyNoteUpdatedByOther = (data: NotifyNoteUpdatedByOtherPayload) => {
        console.log("[SocketContext] Received notifyNoteUpdatedByOther:", data);
        // Ensure not to notify for own actions if backend somehow sends it (though it shouldn't for this event)
        if (data.editorUsername !== currentUsername) { 
          addNotification(data.message, data.type || 'info', data.noteId);
          incrementNotesVersion(); // To refresh list views or note content if navigating
          // Potentially increment a specific counter for "updates by others" if needed for the bell
          // For now, relying on the general notification mechanism to update unreadCount
        }
      };
      socketInstance.on("notifyNoteUpdatedByOther", handleNotifyNoteUpdatedByOther);

      // REMOVED: socketInstance.off("noteContentUpdated", handleNoteContentUpdated); as it's no longer used for live typing.
      // REMOVED: socketInstance.off("noteEditFinishedByOtherUser", handleNoteEditFinishedByOtherUser); // Replaced by notifyNoteUpdatedByOther

      // Cleanup listeners
      return () => {
        console.log("[SocketContext] Cleaning up event listeners for user:", currentUserId);
        if (socketInstance) { 
            socketInstance.off("notesListUpdated", handleNotesListUpdated);
            socketInstance.off("newSharedNote", handleNewSharedNote);
            socketInstance.off("noteSharingConfirmation", handleNoteSharingConfirmation);
            socketInstance.off("noteSharingUpdated", handleNoteSharingUpdated);
            socketInstance.off("yourShareRoleUpdated", handleYourShareRoleUpdated);
            socketInstance.off("noteUnshared", handleNoteUnshared);
            socketInstance.off("noteUpdateSuccess", handleNoteUpdateSuccess); // Cleanup new listener
            socketInstance.off("notifyNoteUpdatedByOther", handleNotifyNoteUpdatedByOther); // Cleanup new listener
        }
      };
    } else {
      // Log why listeners are not being set up
      if (!socketInstance) {
        console.warn("[SocketContext] Listeners not set up: socketInstance is null.");
      }
      if (socketInstance && !socketInstance.connected) {
        console.warn("[SocketContext] Listeners not set up: socket is not connected.");
      }
      if (!user) {
        console.warn("[SocketContext] Listeners not set up: user object is null.");
      }
      if (user && !user._id) {
        console.warn("[SocketContext] Listeners not set up: user._id is missing.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketInstance, user, addNotification, incrementNotesVersion, incrementNewSharedItemCounter, pathname, toast]);

  const emitUserEditing = useCallback((noteId: string, isEditing: boolean) => {
    if (socketInstance && user) {
      if (isEditing) {
        console.log(`[SocketContext] Emitting userEditing for note ${noteId}`);
        socketInstance.emit('userEditing', { noteId, userId: user._id, username: user.username });
      }
    }
  }, [socketInstance, user]);

  const emitUserStoppedEditing = useCallback((noteId: string) => {
    if (socketInstance && user) {
      console.log(`[SocketContext] Emitting userStoppedEditing for note ${noteId}`);
      socketInstance.emit('userStoppedEditing', { noteId, userId: user._id, username: user.username }); // Added username
    }
  }, [socketInstance, user]);

  const emitUserFinishedEditingWithContent = useCallback((noteId: string, title: string, content: any) => {
    if (socketInstance && user) {
      console.log(`[SocketContext] Emitting userFinishedEditingNoteWithContent for note ${noteId}`);
      socketInstance.emit('userFinishedEditingNoteWithContent', { 
        noteId, 
        title, 
        content, 
        editorId: user._id, 
        editorUsername: user.username 
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
      emitUserFinishedEditingWithContent, // Added new emitter to context value
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) { // Corrected syntax: ensure comparison is valid
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
