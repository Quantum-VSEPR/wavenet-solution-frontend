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

// Updated based on actual backend payload for 'newSharedNote'
interface ReceivedNewSharedNotePayload {
  _id: string; // Note ID
  title: string;
  content: string; // Or object if it can be complex
  creator: { _id: string; username: string; email?: string };
  sharedWith: Array<{ user: string; role: 'read' | 'write'; _id: string; username?: string; email?: string; }>; // Adjusted sharedWith structure
  isArchived: boolean;
  updatedAt: string; // ISO Date string
  roleYouWereGiven: 'read' | 'write';
  sharerUsername: string;
  message: string;
  // This represents the note itself, so we can map it to the Note type if needed
  // For simplicity, keeping it flat as received.
}

// Interface for noteSharingUpdated event, now with a message and actor
interface NoteSharingUpdatedPayload {
  note: Note; 
  updatedByUserId: string; 
  updatedByUsername?: string; // Optional: if backend can provide it for a richer message
  message?: string; 
}

// Interface for the new noteSharingConfirmation event (for owner)
interface NoteSharingConfirmationPayload {
  note?: Note; // Made optional as not always present, e.g. on unshare by ID
  message: string;
  recipientEmail?: string;
  sharedNoteId?: string;
  newRole?: 'read' | 'write';
  actionType?: 'share' | 'update_role' | 'unshare';
  noteId?: string; // Ensure noteId is available for all action types if note object isn't
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

// Payload for backend's 'yourShareRoleUpdated' - ADJUSTED
interface YourShareRoleUpdatedPayload {
  _id: string; // Note ID, now top-level
  title: string; // Note title, now top-level
  // content, creator, sharedWith, isArchived, updatedAt are also top-level if needed,
  // but for the notification, _id and title are primary.
  yourNewRole: 'read' | 'write'; // Matches backend field name
  updaterUsername: string; // Matches backend field name
  message: string;
  // Add other fields if present and needed
}

// Payload for backend's 'noteUnshared'
interface NoteUnsharedPayload {
  noteId: string;
  noteTitle: string;
  unsharerUsername: string;
  message: string;
  // Add other fields if present
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
      const currentNewValue = prev + 1; // Fixed variable name
      console.log(`[SocketContext] incrementNewSharedItemCounter called. Old value: ${prev}, New value: ${currentNewValue}`);
      return currentNewValue; // Return the new value
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

      // Listener for when a note is newly shared with the current user
      socketInstance.on('newSharedNote', (data: ReceivedNewSharedNotePayload) => {
        console.log('[SocketContext] Received newSharedNote from backend:', data);
        addNotification(
          data.message || `Note "${data.title}" was shared with you by ${data.sharerUsername}. Your role: ${data.roleYouWereGiven}.`,
          'info',
          data._id // Use data._id as noteId
        );
        incrementNewSharedItemCounter();
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion(); 
        }
      });

      // Listener for when the current user's role on a shared note is updated
      socketInstance.on('yourShareRoleUpdated', (data: YourShareRoleUpdatedPayload) => {
        console.log('[SocketContext] Received yourShareRoleUpdated from backend:', data);
         addNotification(
          data.message || `Your role for note "${data.title}" was updated to ${data.yourNewRole} by ${data.updaterUsername}.`, // Use data.title, data.yourNewRole, data.updaterUsername
          'success',
          data._id // Use data._id directly
        );
        incrementNewSharedItemCounter();
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion(); 
        }
      });
      
      // Listener for when the current user is unshared from a note
      socketInstance.on('noteUnshared', (data: NoteUnsharedPayload) => { 
        console.log('[SocketContext] Received noteUnshared from backend:', data);
        addNotification(
          data.message || `You were unshared from the note "${data.noteTitle}" by ${data.unsharerUsername}.`,
          'warning',
          data.noteId 
        );
        incrementNewSharedItemCounter(); // Added for bell update
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
        // If currently viewing the unshared note, redirect or show a message
        if (pathname === `/notes/${data.noteId}`) {
          toast({
            title: 'Access Removed',
            description: `You no longer have access to the note "${data.noteTitle}".`,
            variant: 'destructive',
          });
          router.push('/dashboard');
        }
      });
      
      // Listener for the OWNER to confirm their share/unshare/update action
      socketInstance.on('noteSharingConfirmation', (data: NoteSharingConfirmationPayload) => {
        console.log('[SocketContext] Received noteSharingConfirmation from backend:', data);
        toast({
          title: `${data.actionType ? data.actionType.charAt(0).toUpperCase() + data.actionType.slice(1) : 'Action'} Successful`,
          description: data.message,
        });
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
      });

      // Listener for when a note's sharing settings are updated by another user
      // This notifies other collaborators about changes in sharing permissions.
      // This event ('noteSharingSettingsChanged') might need to be emitted by the backend
      // when one user's role changes, to inform *other* collaborators (not the one whose role changed,
      // as they get 'yourShareRoleUpdated').
      socketInstance.on('noteSharingSettingsChanged', (data: NoteSharingUpdatedPayload) => {
        console.log('[SocketContext] Received noteSharingSettingsChanged:', data);
        if (data.updatedByUserId !== user._id) {
          const notificationMessage = data.message || 
            `Sharing settings for note "${data.note.title}" were updated${data.updatedByUsername ? ` by ${data.updatedByUsername}` : ''}.`;
          
          addNotification(
            notificationMessage,
            'info', 
            data.note._id
          );
          incrementNewSharedItemCounter();
          if (pathname.includes('/dashboard') || pathname === `/notes/${data.note._id}`) {
            incrementNotesVersion();
          }
        }
      });
      
      // Listener for when a note the user has access to is deleted by someone else
      socketInstance.on('notifyNoteDeleted', (data: { noteId: string; noteTitle: string; deletedByUsername: string, message?: string }) => {
        console.log('[SocketContext] Received notifyNoteDeleted:', data);
        addNotification(
          data.message || `The note "${data.noteTitle}" was deleted by ${data.deletedByUsername}.`,
          'warning'
        );
        incrementNewSharedItemCounter(); // Added for bell update
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
        incrementNewSharedItemCounter(); // Added for bell update
        if (pathname.includes('/dashboard')) {
            incrementNotesVersion();
        }
      });

      // REMOVING THE FIRST DUPLICATE LISTENER FOR notifyNoteUpdatedByOther
      // socketInstance.on('notifyNoteUpdatedByOther', (data: NotifyNoteUpdatedByOtherPayload) => {
      //   console.log('[SocketContext] Received notifyNoteUpdatedByOther (first instance):', data);
      //   if (user && data.editorUsername !== user.username) { 
      //     if (pathname !== `/notes/${data.noteId}`) {
      //       addNotification(
      //         data.message, // Use backend message
      //         data.type || 'info',
      //         data.noteId
      //       );
      //       incrementNewSharedItemCounter(); 
      //     }
      //      if (pathname.includes('/dashboard')) {
      //       incrementNotesVersion();
      //     }
      //   }
      // });
      
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
      // This is the consolidated handler for 'notifyNoteUpdatedByOther'
      socketInstance.on('notifyNoteUpdatedByOther', (data: NotifyNoteUpdatedByOtherPayload) => {
        console.log('[SocketContext] Received notifyNoteUpdatedByOther (consolidated):', data);
        if (user && data.editorUsername !== user.username) { // Ensure it's not self-notification
          
          // Always increment notes version to refresh lists if another user updated a note
          incrementNotesVersion();

          // If user is NOT currently viewing THIS note, add notification and update bell
          // If they ARE viewing it, NoteEditor handles live updates, so a bell notification might be redundant or less critical.
          if (pathname !== `/notes/${data.noteId}`) {
            addNotification(
              data.message, // Use backend message
              data.type || 'info',
              data.noteId
            );
            incrementNewSharedItemCounter(); 
          }
          // No separate toast here; NoteEditor can provide more integrated feedback if the user is viewing the note.
          // General notifications are handled by addNotification.
        }
      });
      
      return () => {
        socketInstance.off('newSharedNote'); 
        socketInstance.off('yourShareRoleUpdated'); 
        socketInstance.off('noteUnshared'); 
        socketInstance.off('noteSharingConfirmation'); 
        
        socketInstance.off('noteSharingSettingsChanged'); 
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
