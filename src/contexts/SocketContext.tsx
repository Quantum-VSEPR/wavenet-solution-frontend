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
  // Ensure addNotification and potentially clearNotifications are correctly imported if needed elsewhere
  const { addNotification } = useNotifications(); 
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notesVersion, setNotesVersion] = useState(0);
  const [newSharedItemCounter, setNewSharedItemCounter] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const incrementNotesVersion = useCallback(() => {
    setNotesVersion(prev => prev + 1);
  }, []);

  const incrementNewSharedItemCounter = useCallback(() => {
    setNewSharedItemCounter(prev => {
      const newValue = prev + 1;
      console.log(`[SocketContext] incrementNewSharedItemCounter called. Old value: ${prev}, New value: ${newValue}`);
      return newValue;
    });
  }, []);
  
  useEffect(() => {
    console.log(`[SocketContext] newSharedItemCounter state updated to: ${newSharedItemCounter}`);
  }, [newSharedItemCounter]);

  const resetNewSharedItemCounter = useCallback(() => {
    setNewSharedItemCounter(0);
    // If you have a function to clear the actual notification list in NotificationContext, call it here too
    // Example: clearNotifications(); 
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
        // Commenting out toast for general connection errors to avoid being too noisy
        // toast({ title: "Socket Connection Error", description: error.message, variant: "destructive" });
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
  }, [token, user]); // Removed toast from here

  useEffect(() => {
    if (socketInstance && socketInstance.connected && user && user._id) {

      // Listener for when the current user is shared a note or their role is updated (RECIPIENT)
      socketInstance.on('notifyUserOfShareOrUpdate', (data: { note: Note, sharerUsername: string, roleGiven: string, message: string, actionType: 'share' | 'update_role' }) => {
        console.log('[SocketContext] Received notifyUserOfShareOrUpdate FOR RECIPIENT:', data);
        addNotification(
          data.message || `Note "${data.note.title}" was ${data.actionType === 'share' ? 'shared with you' : 'role updated for'} by ${data.sharerUsername}. Your new role: ${data.roleGiven}.`,
          data.actionType === 'share' ? 'info' : 'success',
          data.note._id
        );
        incrementNewSharedItemCounter();
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion(); 
        }
      });

      // Listener for when the current user is unshared from a note (RECIPIENT)
      socketInstance.on('notifyUserOfUnshare', (data: { noteId: string, noteTitle: string, unsharerUsername: string, message: string }) => {
        console.log('[SocketContext] Received notifyUserOfUnshare FOR RECIPIENT:', data);
        addNotification(
          data.message || `You were unshared from the note "${data.noteTitle}" by ${data.unsharerUsername}.`,
          'warning',
          data.noteId 
        );
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
      });

      // Listener for the OWNER to confirm their share/unshare/update action
      socketInstance.on('confirmShareAction', (data: { message: string, actionType: 'share' | 'update_role' | 'unshare', noteId: string, recipientEmail?: string, newRole?: string }) => {
        console.log('[SocketContext] Received confirmShareAction FOR OWNER:', data);
        toast({
          title: `${data.actionType.charAt(0).toUpperCase() + data.actionType.slice(1)} Successful`,
          description: data.message, // Directly use backend message
        });
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
      });
      
      // Listener for when a note the user has access to is deleted by someone else
      socketInstance.on('notifyNoteDeleted', (data: { noteId: string; noteTitle: string; deletedByUsername: string, message?: string }) => {
        console.log('[SocketContext] Received notifyNoteDeleted:', data);
        addNotification(
          data.message || `The note "${data.noteTitle}" was deleted by ${data.deletedByUsername}.`,
          'warning'
        );
        if (pathname.includes('/dashboard') || pathname === `/notes/${data.noteId}`) {
            incrementNotesVersion();
        }
        if (pathname === `/notes/${data.noteId}`) {
          toast({
            title: 'Note Deleted',
            description: data.message || `The note "${data.noteTitle}" you were viewing has been deleted.`,
            variant: 'destructive',
          });
          router.push('/dashboard');
        }
      });

      // Listener for when a note is archived/unarchived by someone else
      socketInstance.on('notifyNoteArchivedUnarchived', (data: { noteId: string; noteTitle: string; action: 'archived' | 'unarchived'; actorUsername: string, message?: string }) => {
        console.log('[SocketContext] Received notifyNoteArchivedUnarchived:', data);
        addNotification(
          data.message || `${data.actorUsername} ${data.action} the note "${data.noteTitle}".`,
          'info',
          data.noteId
        );
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
      });

      // Listener for when a note's content/title is updated by another user (collaborator or owner)
      socketInstance.on('notifyNoteUpdatedByOther', (data: NotifyNoteUpdatedByOtherPayload) => {
        console.log('[SocketContext] Received notifyNoteUpdatedByOther:', data);
        if (user && data.editorUsername !== user.username) { 
          if (pathname !== `/notes/${data.noteId}`) {
            addNotification(
              data.message, // Use backend message
              data.type || 'info',
              data.noteId
            );
            incrementNewSharedItemCounter(); 
          }
           if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
          }
        }
      });
      
      // General listener for when any note list might need an update
      socketInstance.on('notesListUpdated', (payload: NotesListUpdatePayload) => {
        console.log('[SocketContext] Received notesListUpdated:', payload);
        if (user && payload.actorId !== user._id && pathname.includes('/dashboard')) {
          incrementNotesVersion();
        } else if (user && payload.actorId === user._id && pathname.includes('/dashboard')) {
          incrementNotesVersion();
        }
      });
      
      // Listener for the user who made the update (autosave or manual save) - for their own UI feedback
      socketInstance.on('noteUpdateSuccess', (data: NoteUpdateSuccessPayload) => {
        console.log('[SocketContext] Received noteUpdateSuccess FOR EDITOR:', data);
        if (!data.isAutoSave) { 
          toast({
            title: 'Note Saved',
            description: data.message || `"${data.title}" has been saved.`, // Use backend message
          });
        }
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion(); 
        }
      });

      // Listener for collaborators when a note they are viewing is updated by someone else (not themselves)
      // This is for the toast/notification that "X updated the note"
      socketInstance.on('notifyNoteUpdatedByOther', (data: NotifyNoteUpdatedByOtherPayload) => {
        console.log('[SocketContext] Received notifyNoteUpdatedByOther:', data);
        if (user && data.editorUsername !== user.username) { // Ensure it's not self-notification
          // If user is currently viewing THIS note, NoteEditor will show a more integrated update.
          // This notification is more for when they are NOT viewing it, or as a general heads-up.
          if (pathname !== `/notes/${data.noteId}`) {
            addNotification(
              data.message,
              data.type || 'info',
              data.noteId
            );
          }
          // This might also trigger a list refresh if dashboard shows last updated by etc.
          incrementNotesVersion();
        }
      });
      
      // ... other existing listeners like 'otherUserStartedEditing', 'otherUserStoppedEditing' ...

      return () => {
        socketInstance.off('notifyUserOfShareOrUpdate');
        socketInstance.off('notifyUserOfUnshare');
        socketInstance.off('confirmShareAction');
        socketInstance.off('notifyNoteDeleted');
        socketInstance.off('notifyNoteArchivedUnarchived');
        socketInstance.off('notesListUpdated');
        socketInstance.off('noteUpdateSuccess');
        socketInstance.off('notifyNoteUpdatedByOther');
        // ... off for other listeners
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketInstance, user, addNotification, incrementNewSharedItemCounter, resetNewSharedItemCounter, pathname, router, toast, incrementNotesVersion]);

  const emitUserEditing = useCallback((noteId: string, isEditing: boolean) => {
    if (socketInstance && socketInstance.connected && user) {
      if (isEditing) {
        socketInstance.emit('userStartedEditing', { noteId, userId: user._id, username: user.username });
      } 
      // Removed else block as userStoppedEditing or userFinishedEditingWithContent will handle the 'false' case
    }
  }, [socketInstance, user]);

  const emitUserStoppedEditing = useCallback((noteId: string) => {
    if (socketInstance && socketInstance.connected && user) {
      socketInstance.emit('userStoppedEditing', { noteId, userId: user._id, username: user.username });
    }
  }, [socketInstance, user]);

  const emitUserFinishedEditingWithContent = useCallback((noteId: string, title: string, content: string | object) => {
    if (socketInstance && socketInstance.connected && user) {
      socketInstance.emit('userFinishedEditingWithContent', {
        noteId,
        userId: user._id,
        username: user.username,
        title,
        content,
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

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
