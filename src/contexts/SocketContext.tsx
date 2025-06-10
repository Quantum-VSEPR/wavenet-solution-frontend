"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuth } from './AuthContext'; // Assuming useAuth provides user status
import { useNotifications } from './NotificationContext'; // Added
import { PopulatedNoteType, User, PopulatedShare } from '@/types'; // Import the new type

// You might need to define or import a type similar to PopulatedNote from your backend
// For example, in your frontend/src/types/index.ts:
// export interface PopulatedNoteType {
//   _id: string;
//   title: string;
//   creator: { _id: string; username: string; email: string; };
//   sharedWith: Array<{ userId: { _id: string; username: string; email: string; }; role: string; email: string; }>;
//   // ... other relevant fields
// }

interface NotesListUpdatedData {
  action: "create" | "update" | "delete" | "archive" | "unarchive" | "share" | "unshare"; // Added "share" and "unshare"
  note?: PopulatedNoteType; 
  creator?: User; 
  noteId?: string; 
  title?: string; 
}

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
        note: PopulatedNoteType; // Changed from noteId, noteTitle, message
        sharerUsername: string;
      }) => {
        console.log("Socket event: noteSharedWithYou received", data);
        if (!data.note || !data.sharerUsername) {
          console.error("[SocketContext] Invalid data for noteSharedWithYou:", data);
          return;
        }
        // Updated notification message to be more descriptive about the title
        const notificationMessage = `${data.sharerUsername} shared a note titled "${data.note.title}" with you.`; 
        addNotification(
          notificationMessage,
          "info",
          data.note._id
        );
        // Potentially trigger a list refresh here if notesListUpdated isn't reliable enough
        // or if a more immediate refresh is desired for the "Shared with me" list.
        // For now, relying on notesListUpdated.
      };

      const handleNotesListUpdated = (data: NotesListUpdatedData) => {
        console.log("[SocketContext] notesListUpdated received:", data);
        if (!user) return;

        let notificationMessage = "";
        let showNotification = false;
        let noteIdForToast = data.note?._id || data.noteId;

        switch (data.action) {
          case "create":
            // For "create" action, we will not show any notification from this handler.
            // If the current user is the creator, they don't need a notification.
            // If the note is shared with the current user, the 'noteSharedWithYou' event will handle the notification.
            // If the note is not shared with the current user, they should not be notified of its creation for privacy reasons.
            console.log("[SocketContext] notesListUpdated (create): Action received. No toast notification will be generated by this handler to preserve privacy and avoid redundancy.");
            showNotification = false;
            break;
          case "share":
            // Notification for "share" is handled by "noteSharedWithYou" for the recipient.
            // This event primarily signals that lists need to be updated for all relevant users.
            // No separate global notification from here to avoid duplication.
            console.log("[SocketContext] notesListUpdated (share): Action received. Lists should refresh. Specific notification handled by 'noteSharedWithYou'.");
            showNotification = false;
            // However, we still want to trigger a re-fetch or state update for the lists.
            // This is where you'd call a function to invalidate queries or update local state
            // for components like DashboardClient.tsx.
            // Example: queryClient.invalidateQueries(['notes', 'sharedWithMe']);
            // Or: dispatch({ type: 'REFRESH_NOTES' });
            break;
          case "unshare":
            // The user who was unshared gets a specific "notification" event from the backend.
            // This "notesListUpdated" with action "unshare" is for others to update their lists
            // (e.g., the owner sees the user removed from the shared list).
            // No global notification from here to avoid confusion if the current user is not directly involved
            // other than needing a list refresh.
            console.log("[SocketContext] notesListUpdated (unshare): Action received. Lists should refresh. Specific notification for unshared user handled elsewhere.");
            showNotification = false;
            // Similar to "share", trigger list refresh.
            break;
          case "update":
            // The 'collaboratorNoteUpdated' event is more specific for "who updated what" and already handles not notifying self.
            // 'notesListUpdated' with 'update' action is a broad signal for list staleness.
            // Avoid generating a potentially confusing or redundant notification from here.
            console.log("[SocketContext] notesListUpdated: action 'update'. UI should refresh lists. Specific update notifications handled by 'collaboratorNoteUpdated' or editor sync.");
            // If a generic "list updated" notification was desired for updates by others (and not self):
            // This would require 'updatedBy' info in this event's payload, or careful coordination.
            // For now, no direct notification from this case to prevent self-notify issues.
            break;
          case "delete":
            notificationMessage = `A note was deleted. Your lists may need refreshing.`;
            showNotification = true;
            noteIdForToast = data.noteId; // data.note is not available for delete action
            break;
          case "archive":
          case "unarchive":
            if (data.note && data.note.creator && user) {
              const isCreatorSelf = data.note.creator._id === user._id;
              
              // Determine if the current user is a collaborator (excluding the creator, if they are the current user)
              let isRelevantCollaborator = false;
              if (!isCreatorSelf && data.note && data.note.sharedWith) { // Ensure data.note and data.note.sharedWith are defined
                isRelevantCollaborator = data.note.sharedWith.some((s: PopulatedShare) => s.userId?._id === user._id);
              }

              if (!isCreatorSelf && isRelevantCollaborator) { 
                // Action by another user (who is the creator) on a note shared with the current user
                notificationMessage = `Note "${data.note?.title}" was ${data.action}d by ${data.note?.creator.username}.`; // Corrected: Removed extra backslashes
                showNotification = true;
              } else if (
                  data.note && 
                  data.note.sharedWith && 
                  data.note.creator && // Ensure creator is defined before accessing its properties
                  user && // Ensure user is defined
                  data.note.sharedWith.some((s: PopulatedShare) => 
                    s.userId?._id === user._id && 
                    s.userId?._id !== data.note?.creator?._id && 
                    data.note?.creator?._id !== user._id
                  )
                ) {
                // Action by another user (who is a collaborator, not the creator) on a note shared with the current user
                // This case needs `updatedBy` in the payload to correctly attribute.
                // For now, we assume the archiver/unarchiver is the `data.note.creator` for simplicity if not self.
                // This part might need refinement if a non-creator collaborator can archive.
                // The current backend logic for archive/unarchive checks permissions, but doesn't explicitly pass 'archivedByUsername'.
                // Let's assume for now the notification attributes to creator if not self.
                 notificationMessage = `Note "${data.note.title}" was ${data.action}d.`; // Corrected: Removed extra backslashes
                 showNotification = true;
              } else if (isCreatorSelf) {
                 console.log(`[SocketContext] notesListUpdated: Self-${data.action}d note. No global notification from this handler.`);
              }
            }
            break;
          default:
            console.warn("[SocketContext] notesListUpdated: Unknown action", data.action);
            break;
        }

        if (showNotification && notificationMessage) {
          addNotification(notificationMessage, "info", noteIdForToast);
        }
      };
      
      // Listener for when a collaborator updates a note
      const handleCollaboratorNoteUpdated = (data: {
        note: PopulatedNoteType; // Use PopulatedNoteType
        updatedByUsername: string; 
      }) => {
        // Prevent notification if the current user is the one who updated the note
        if (user && user.username === data.updatedByUsername) {
          console.log("[SocketContext] collaboratorNoteUpdated: by current user. No global notification.");
          return; 
        }

        console.log("[SocketContext] collaboratorNoteUpdated: by OTHER user.", data);
        addNotification(
          `Note "${data.note.title}" was updated by ${data.updatedByUsername}.`, // Corrected: Removed extra backslashes
          "info",
          data.note._id
        );
      };

      socketInstance.on("receiveNotification", handleReceiveNotification);
      socketInstance.on("noteSharedWithYou", handleNoteSharedWithYou);
      socketInstance.on("notesListUpdated", handleNotesListUpdated);
      socketInstance.on("collaboratorNoteUpdated", handleCollaboratorNoteUpdated); // Added listener

      // Register user with socket server if user is logged in
      if (user?._id) {
        socketInstance.emit('registerUser', user._id);
        console.log(`Socket: Emitted registerUser for ${user._id}`);
      }

      return () => {
        socketInstance.off("receiveNotification", handleReceiveNotification);
        socketInstance.off("noteSharedWithYou", handleNoteSharedWithYou);
        socketInstance.off("notesListUpdated", handleNotesListUpdated);
        socketInstance.off("collaboratorNoteUpdated", handleCollaboratorNoteUpdated); // Removed listener
      };
    }
  }, [socketInstance, addNotification, user]); // Added user to dependencies for registerUser

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
