"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket, registerSocketUser, joinNoteRoom, leaveNoteRoom } from '@/lib/socket';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';
import { usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { v4 as uuidv4 } from 'uuid';

// Define a more specific type for the note data received in socket events
export interface RealtimeNoteUpdateData {
  _id: string;
  title: string;
  content?: string;
  creator: { _id: string; username: string; email: string };
  sharedWith: Array<{
    userId: { _id: string; username: string; email: string } | string;
    role: 'read' | 'write';
    email: string;
  }>;
  isArchived?: boolean;
  updatedAt: string;
  sharerUsername?: string;
}

// Payload for when a note\\'s details (like collaborators) are updated
export interface NoteDetailsUpdatedPayload extends RealtimeNoteUpdateData {
  detailsChanged?: boolean; // Added to make the interface distinct
}

// Payload for when a note\\'s content is updated by another user
export interface NoteContentUpdatedPayload {
  noteId: string;
  content: string; // Assuming content is string, adjust if it\\'s structured (e.g., JSON for a rich editor)
  updatedBy: string;
}

// Payload for when another user starts/stops editing
export interface UserEditingStatusPayload {
  noteId: string;
  userId: string;
  username: string;
}

interface NoteEditFinishedPayload {
  noteId: string;
  noteTitle: string;
  editorUsername: string;
  editorId: string;
  isArchived?: boolean;
  titleChanged?: boolean; // Added to indicate if title was changed
  contentChanged?: boolean; // Added to indicate if content was changed
  content?: string; // Added to carry the new content if it changed
  updatedAt?: string; // Added to carry the new timestamp
}

// Interface for notesListUpdated event
interface NotesListUpdatePayload {
  action: 'archive' | 'unarchive' | 'delete' | 'create' | 'update' | 'share_update' | 'unshare_update';
  noteId: string;
  updatedNote?: RealtimeNoteUpdateData;
  removedUserId?: string;
  actorId?: string;
  message?: string;
}

// Interface for the newSharedNote event, now with a message
interface NewSharedNotePayload extends RealtimeNoteUpdateData {
    message?: string;
}

// Interface for noteUnshared event, now with a message
interface NoteUnsharedPayload {
    noteId: string;
    title: string;
    unsharerUsername?: string;
    message?: string;
}

// Interface for noteSharingUpdated event, now with a message and actor
interface NoteSharingUpdatedPayload {
    note: RealtimeNoteUpdateData;
    message?: string;
    actor?: 'self' | 'other';
}

interface SocketContextType {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
  notesVersion: number;
  incrementNotesVersion: () => void;
  newSharedItemCounter: number; // Added for specific shared list refresh
  joinNoteRoom: (noteId: string) => void;
  leaveNoteRoom: (noteId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const { user, token, isLoading: authLoading } = useAuth(); // Renamed isLoading to authLoading
  const { addNotification } = useNotifications();
  const { toast } = useToast(); // Initialize useToast
  const pathname = usePathname();
  const [notesVersion, setNotesVersion] = useState(0);
  const [newSharedItemCounter, setNewSharedItemCounter] = useState(0); // State for new shared items

  const incrementNotesVersion = useCallback(() => {
    setNotesVersion(v => v + 1);
    console.log("[SocketContext] Notes version incremented");
  }, []);

  const incrementNewSharedItemCounter = useCallback(() => { // Function to increment shared item counter
    setNewSharedItemCounter(c => c + 1);
    console.log("[SocketContext] New shared item counter incremented");
  }, []);

  const handleConnect = useCallback(() => {
    if (user && token && (!socketInstance || !socketInstance.connected)) {
      console.log("[SocketContext] Attempting to connect socket...");
      const newSocket = getSocket();
      setSocketInstance(newSocket);

      if (newSocket.connected) {
        console.log("[SocketContext] Socket already connected, registering user.");
        if (user._id) registerSocketUser(user._id);
      } else {
        newSocket.once('connect', () => {
            console.log("[SocketContext] Socket connected via event, now registering user.");
            if (user._id) registerSocketUser(user._id);
        });
      }
    }
  }, [user, token, socketInstance]);

  const handleDisconnect = useCallback(() => {
    if (socketInstance) {
      console.log("[SocketContext] Attempting to disconnect socket...");
      disconnectSocket();
      setSocketInstance(null);
    }
  }, [socketInstance]);

  useEffect(() => {
    if (authLoading) return;
    if (user && token) {
      handleConnect();
    } else {
      handleDisconnect();
    }
  }, [user, token, authLoading, handleConnect, handleDisconnect]);

  // Event listeners effect
  useEffect(() => {
    // Ensure socketInstance exists, is connected, and user is available
    if (socketInstance && socketInstance.connected && user) {
      console.log(`[SocketContext] EFFECT: Setting up listeners for user ${user.username} (${user._id}) on socket ${socketInstance.id}. Connected: true`);

      const handleReceiveNotification = (data: { message: string, type: "info" | "success" | "error" | "warning", noteId?: string }) => {
        addNotification(data.message, data.type, data.noteId);
      };

      const handleNewSharedNote = (data: NewSharedNotePayload) => {
        console.log("[SocketContext] EVENT: 'newSharedNote' received. Data:", JSON.stringify(data));
        
        let sharerName = "Someone";
        if (data.sharerUsername) {
          sharerName = data.sharerUsername;
        } else if (data.creator && data.creator.username) {
          sharerName = data.creator.username;
        }

        const noteTitle = data.title || "a note"; // Fallback for title
        const message = `${sharerName} shared '${noteTitle}' with you.`;
        
        console.log(`[SocketContext] NOTIFICATION (newSharedNote): Preparing for note ${data._id}. Message: "${message}"`);
        addNotification(message, 'info', data._id, data.isArchived, true); // Ensure actionable
        incrementNewSharedItemCounter(); // Specific refresh for shared items list
      };

      const handleNoteSharingUpdated = (data: NoteSharingUpdatedPayload) => {
        console.log("[SocketContext] Socket event: noteSharingUpdated received", data);
        const { note, message, actor } = data;
        const noteTitle = note.title || "a note";
        let notificationMessage = message;

        if (actor === 'self') {
            notificationMessage = message || `Your sharing settings for '${noteTitle}' were updated.`;
            toast({
              title: "Sharing Updated",
              description: notificationMessage,
              variant: "default",
            });
        } else { // actor === 'other' (e.g., your role was changed by someone else)
            notificationMessage = message || `Sharing settings for '${noteTitle}' were updated by an admin or the owner.`;
            addNotification(notificationMessage, 'info', note._id, note.isArchived, true); // Ensure actionable
        }
        incrementNotesVersion(); // This event affects multiple lists potentially
      };
      
      const handleNoteUnshared = (data: NoteUnsharedPayload) => {
        console.log("[SocketContext] Socket event: noteUnshared received", data);
        const noteTitle = data.title || "a note";
        const message = data.message || `You were unshared from '${noteTitle}'${data.unsharerUsername ? ` by ${data.unsharerUsername}` : ''}.`;
        // For unshared notifications, the user no longer has access, so actionable should be false.
        addNotification(message, "warning", data.noteId, undefined, false);
        incrementNotesVersion(); // This event affects multiple lists
      };

      const handleNotesListGlobalUpdate = (data: NotesListUpdatePayload) => {
        console.log("[SocketContext] Socket event: notesListGlobalUpdate received", data);

        const currentUserIsActor = data.actorId && user && user._id && data.actorId === user._id;

        if (currentUserIsActor && data.action !== 'create') {
          console.log("[SocketContext] notesListGlobalUpdate (actor is self, not create): Skipping notification, only refreshing list.");
          incrementNotesVersion();
          return;
        }

        const isShareUpdateTargetingCurrentUser = data.action === 'share_update' &&
          user && user._id &&
          data.updatedNote?.sharedWith.some(s => {
            const sharedUserId = typeof s.userId === 'string' ? s.userId : (s.userId as { _id: string })?._id;
            return sharedUserId === user._id;
          });

        if (isShareUpdateTargetingCurrentUser) {
          console.log("[SocketContext] notesListGlobalUpdate (share_update for current user): 'newSharedNote' likely handles this. Skipping notification here, just refreshing.");
          incrementNotesVersion();
          return;
        }

        const isUnshareUpdateTargetingCurrentUser = data.action === 'unshare_update' &&
          user && user._id && data.removedUserId === user._id;

        if (isUnshareUpdateTargetingCurrentUser) {
          console.log("[SocketContext] notesListGlobalUpdate (unshare_update for current user): 'noteUnshared' likely handles this. Skipping notification here, just refreshing.");
          incrementNotesVersion();
          return;
        }
        
        const noteTitle = data.updatedNote?.title || (data.noteId ? `note ID ${data.noteId}` : 'a note');
        let notificationMessage = data.message; 
        let notificationType: "info" | "success" | "error" | "warning" = "info";
        let shouldNotify = !!data.message; 
        let noteIsArchived = data.updatedNote?.isArchived || false;
        let actionable = true; // Default to true for most global updates

        // Determine if the current user has/had access to the note for generic notifications
        let userHasAccess = false;
        if (data.updatedNote && user) {
            userHasAccess = data.updatedNote.creator._id === user._id || 
                            data.updatedNote.sharedWith.some(s => {
                                const sharedUserId = typeof s.userId === 'string' ? s.userId : (s.userId as { _id: string })?._id;
                                return sharedUserId === user._id;
                            });
        } else if (data.action === 'delete' && !data.updatedNote) {
            // For delete actions without updatedNote, we can't confirm access.
            // The backend should ideally send a targeted message if this user was an owner/collaborator.
            // If no message, we assume no notification is needed to prevent "Permission Denied" scenarios.
        }


        if (data.message) { // If backend sent a specific message
            if (data.updatedNote && user) { // And we have note data to verify relevance
                if (userHasAccess) {
                    shouldNotify = true;
                } else {
                    // Backend sent a message, but this user doesn't seem to be related to the note.
                    // This could be a broadcast message intended for a wider audience, or a misconfiguration.
                    // For now, if the user doesn't have explicit access, we suppress even backend-sent messages
                    // to prevent notifying about notes they can't see.
                    // This could be refined if there are valid use cases for such broadcasts.
                    console.log(`[SocketContext] notesListGlobalUpdate: Backend sent message for note ${data.updatedNote._id}, but user ${user._id} does not have access. Suppressing notification.`);
                    shouldNotify = false; 
                }
            } else if (!data.updatedNote && (data.action === 'archive' || data.action === 'unarchive' || data.action === 'delete')) {
                // If it's a critical action like archive/delete and backend sent a message, but we don't have note details
                // it's risky to show it as the user might not have had access.
                // Backend should ideally send targeted messages for these.
                console.log(`[SocketContext] notesListGlobalUpdate (${data.action}): Backend sent message but no updatedNote details for note ID ${data.noteId}. Cannot verify access. Suppressing notification.`);
                shouldNotify = false;
            }
            // For other actions with a message but no updatedNote, we'll trust the backend message for now, but this is less ideal.
            // Example: a generic 'update' or 'create' message.
        } else { // No backend message, generate default message only if conditions are met
            switch (data.action) {
                case 'archive':
                case 'unarchive':
                    if (data.updatedNote && user && userHasAccess) {
                        notificationMessage = `${noteTitle} was ${data.action === 'archive' ? 'archived' : 'unarchived'}.`;
                        shouldNotify = true;
                        noteIsArchived = data.action === 'archive'; // Explicitly set archive status
                    } else if (data.updatedNote && user && !userHasAccess) {
                         console.log(`[SocketContext] notesListGlobalUpdate (${data.action}): User ${user._id} did not have access to note ${data.updatedNote._id}. No default notification.`);
                    }
                    break;
                case 'delete':
                    // For delete, we need to be careful. If updatedNote is present, it means we have pre-delete state.
                    // If the user had access then, notify them.
                    // If updatedNote is NOT present, it means the note is gone, and we can't verify prior access.
                    // In this case, only a targeted backend message should trigger a notification.
                    if (data.updatedNote && user && userHasAccess) {
                        notificationMessage = `${noteTitle} was deleted.`;
                        notificationType = "warning";
                        shouldNotify = true;
                        actionable = false; // Cannot view a deleted note
                    } else if (data.updatedNote && user && !userHasAccess) {
                        console.log(`[SocketContext] notesListGlobalUpdate (delete): User ${user._id} did not have access to note ${data.updatedNote._id}. No default notification.`);
                    } else if (!data.updatedNote && user) {
                        // If no updatedNote, we can't confirm access. Only notify if backend sent a specific message (handled above)
                        // or if it's a targeted event (which this generic handler tries to avoid duplicating)
                        console.log(`[SocketContext] notesListGlobalUpdate (delete): No updatedNote details for note ID ${data.noteId}. Cannot verify prior access for default notification.`);
                    }
                    break;
                // Add other cases as needed
            }
        }
        
        if (shouldNotify && notificationMessage) {
            console.log(`[SocketContext] NOTIFICATION (notesListGlobalUpdate - ${data.action}): Preparing for note ${data.noteId || data.updatedNote?._id}. Message: "${notificationMessage}". Actionable: ${actionable}`);
            addNotification(notificationMessage, notificationType, data.updatedNote?._id || data.noteId, noteIsArchived, actionable);
        }
        incrementNotesVersion();
      };

      const handleNoteEditFinished = (data: NoteEditFinishedPayload) => {
        console.log("[SocketContext] Socket event: noteEditFinishedByOtherUser received. Data:", JSON.stringify(data));
        // Ensure user object and its _id are available for comparison
        if (user && user._id) {
          console.log(`[SocketContext] Current user ID: ${user._id}, Editor ID from event: ${data.editorId}`);
          if (user._id !== data.editorId) {
            console.log(`[SocketContext] User IDs do not match. Proceeding to add notification for user ${user.username}.`);
            const notificationMessage = `\\'${data.noteTitle}\\' was updated by ${data.editorUsername}.`;
            // Ensure isArchived is explicitly boolean (false if undefined)
            const isArchivedStatus = data.isArchived || false;
            console.log(`[SocketContext] Calling addNotification with: Message='${notificationMessage}', Type='info', NoteID='${data.noteId}', IsArchived='${isArchivedStatus}'`);
            addNotification(
              notificationMessage,
              "info",
              data.noteId,
              isArchivedStatus // Pass normalized isArchived status
            );
          } else {
            console.log("[SocketContext] User IDs match (event triggered by self). No notification will be added.");
          }
        } else {
          console.warn("[SocketContext] User object or user._id is not available. Cannot process noteEditFinishedByOtherUser event properly.");
        }
      };

      // Placeholder handlers for other events if needed
      const handleNoteDetailsUpdated = (note: NoteDetailsUpdatedPayload) => {
        console.log("[SocketContext] Socket event: noteDetailsUpdated received for note:", note._id);
      };
      const handleNoteContentUpdated = (data: NoteContentUpdatedPayload) => {
        console.log("[SocketContext] Socket event: noteContentUpdated received for note:", data.noteId);
      };
      const handleOtherUserStartedEditing = (data: UserEditingStatusPayload) => {
        console.log("[SocketContext] Socket event: otherUserStartedEditing on note:", data.noteId, "by user:", data.username);
      };
      const handleOtherUserStoppedEditing = (data: UserEditingStatusPayload) => {
        console.log("[SocketContext] Socket event: otherUserStoppedEditing on note:", data.noteId, "by user:", data.username);
      };

      socketInstance.on('receiveNotification', handleReceiveNotification);
      socketInstance.on('newSharedNote', handleNewSharedNote);
      socketInstance.on('noteSharingUpdated', handleNoteSharingUpdated);
      socketInstance.on('noteUnshared', handleNoteUnshared);
      socketInstance.on('notesListGlobalUpdate', handleNotesListGlobalUpdate);
      socketInstance.on('noteEditFinishedByOtherUser', handleNoteEditFinished);
      socketInstance.on('noteDetailsUpdated', handleNoteDetailsUpdated);
      socketInstance.on('noteContentUpdated', handleNoteContentUpdated);
      socketInstance.on('otherUserStartedEditing', handleOtherUserStartedEditing);
      socketInstance.on('otherUserStoppedEditing', handleOtherUserStoppedEditing);

      return () => {
        console.log(`[SocketContext] EFFECT CLEANUP: Removing listeners for socket ${socketInstance.id}`);
        socketInstance.off('receiveNotification', handleReceiveNotification);
        socketInstance.off('newSharedNote', handleNewSharedNote);
        socketInstance.off('noteSharingUpdated', handleNoteSharingUpdated);
        socketInstance.off('noteUnshared', handleNoteUnshared);
        socketInstance.off('notesListGlobalUpdate', handleNotesListGlobalUpdate);
        socketInstance.off('noteEditFinishedByOtherUser', handleNoteEditFinished);
        socketInstance.off('noteDetailsUpdated', handleNoteDetailsUpdated);
        socketInstance.off('noteContentUpdated', handleNoteContentUpdated);
        socketInstance.off('otherUserStartedEditing', handleOtherUserStartedEditing);
        socketInstance.off('otherUserStoppedEditing', handleOtherUserStoppedEditing);
      };
    } else {
      const reasons = [];
      if (!user) {
        reasons.push("user not available");
      }
      if (!socketInstance) {
        reasons.push("socketInstance not available");
      } else if (!socketInstance.connected) {
        reasons.push("socketInstance not connected");
      }
      // This log will now clearly state why it's skipping.
      console.log(`[SocketContext] EFFECT: Skipping listener setup. Reasons: ${reasons.join(', ') || 'conditions not met'}. User: ${!!user}, Socket: ${!!socketInstance}, Connected: ${socketInstance?.connected ?? 'N/A'}`);
    }
  }, [
    socketInstance, 
    socketInstance?.connected, // Added to ensure effect re-runs on connection status change
    user, 
    addNotification, 
    toast, 
    pathname, 
    incrementNotesVersion, 
    incrementNewSharedItemCounter
  ]); 

  const memoizedJoinNoteRoom = useCallback((noteId: string) => {
    if (socketInstance && socketInstance.connected) {
        joinNoteRoom(noteId);
    } else {
        console.warn("[SocketContext] Cannot joinNoteRoom: socket not connected or available.");
    }
  }, [socketInstance]); // Added socketInstance dependency

  const memoizedLeaveNoteRoom = useCallback((noteId: string) => {
    if (socketInstance && socketInstance.connected) {
        leaveNoteRoom(noteId);
    } else {
        console.warn("[SocketContext] Cannot leaveNoteRoom: socket not connected or available.");
    }
  }, [socketInstance]); // Added socketInstance dependency

  return (<SocketContext.Provider value={{
    socket: socketInstance,
    connect: handleConnect,
    disconnect: handleDisconnect,
    notesVersion,
    incrementNotesVersion,
    newSharedItemCounter, // Expose the counter
    joinNoteRoom: memoizedJoinNoteRoom,
    leaveNoteRoom: memoizedLeaveNoteRoom
  }}>{children}</SocketContext.Provider>);
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) { // Corrected syntax: added parentheses
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
