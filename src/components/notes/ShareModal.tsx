'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast'; // Corrected import path
import api from '@/lib/api';
import { User, Note, Share } from '@/types';
import { UserPlus, Trash2 } from 'lucide-react';
import { AxiosError } from 'axios';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note | null;
  onNoteShared?: () => void;
}

// Define a type for the expected error response from the backend
interface ApiErrorResponse {
  message: string;
  errors?: Array<{ msg: string; param?: string }>;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, note, onNoteShared }): ReactNode => {
  const { toast } = useToast();
  const [emailQuery, setEmailQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<'read' | 'write'>('read');
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<Share[]>([]);

  useEffect(() => {
    if (note) {
      setSharedUsers(note.sharedWith || []);
    }
  }, [note]);

  const handleSearchUsers = async () => {
    if (!emailQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsLoadingSearch(true);
    setSearchResults([]); // Clear previous results
    try {
      const response = await api.get<{ data: User[] }>(`/users/search?email=${emailQuery}`);
      const ownerId = typeof note?.creator === 'string' ? note.creator : note?.creator._id;

      // Ensure resultsFromServer is an array, even if API response.data.data is unexpectedly null/undefined
      const resultsFromServer = Array.isArray(response.data?.data) ? response.data.data : [];

      const filteredResults = resultsFromServer.filter(
        (userResult: User) => 
          userResult._id !== ownerId && 
          !sharedUsers.some(su => (typeof su.userId === 'string' ? su.userId : (su.userId as User)._id) === userResult._id)
      );
      setSearchResults(filteredResults);

      // Only show 'no results' toast if a search was performed with a non-empty query.
      if (emailQuery.trim() && filteredResults.length === 0) {
        if (resultsFromServer.length === 0) {
          // This case means the API found no users with that email.
          toast({
            title: 'Search Complete',
            description: `No user found with the email address "${emailQuery}".`,
            variant: 'default', 
          });
        } else {
          // This case means users were found by API but all were filtered out (e.g., owner or already shared).
          toast({
            title: 'Search Complete',
            description: 'No new users found to share with. They might be the owner or already have access.',
            variant: 'default',
          });
        }
      }
      // If filteredResults.length > 0, results are displayed, and no specific toast is shown here.
      
    } catch (searchError) {
      let message = 'Could not perform user search.';
      if (searchError instanceof AxiosError) {
        const errorData = searchError.response?.data as ApiErrorResponse | undefined;
        if (errorData?.message) message = errorData.message;
      }
      toast({
        title: 'Error searching users',
        description: message,
        variant: 'destructive',
      });
      setSearchResults([]); // Clear results on error
    } finally {
      setIsLoadingSearch(false); // Ensure button state is reset
    }
  };

  const handleShareNote = async () => {
    if (!note || !selectedUser) return;

    try {
      await api.post(`/notes/${note._id}/share`, {
        email: selectedUser.email,
        role: selectedRole,
      });
      toast({
        title: 'Note Shared',
        description: `Successfully shared with ${selectedUser.email}.`,
      });
      setSelectedUser(null);
      setEmailQuery('');
      setSearchResults([]);
      if (onNoteShared) onNoteShared(); // Refresh the note details to show the new shared user
      // Fetch updated shared users list for the modal
      if (note?._id) {
        const updatedNoteResponse = await api.get<Note>(`/notes/${note._id}`);
        setSharedUsers(updatedNoteResponse.data.sharedWith || []);
      }
    } catch (shareError) {
      let message = 'Could not share the note.';
      if (shareError instanceof AxiosError) {
        const errorData = shareError.response?.data as ApiErrorResponse | undefined;
        // Check for the specific 404 error when user email is not found
        if (shareError.response?.status === 404 && errorData?.message && errorData.message.includes('User with email')) {
          message = errorData.message; // Use the specific message from the backend
        } else if (errorData?.message) {
          message = errorData.message;
        }
      }
      toast({
        title: 'Error Sharing Note',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleUnshareNote = async (userIdToUnshare: string) => {
    if (!note) return;
    try {
      await api.delete(`/notes/${note._id}/share/${userIdToUnshare}`);
      toast({
        title: 'User Unshared',
        description: 'User has been removed from this note.',
      });
      if (onNoteShared) onNoteShared(); // Refresh the note details
      // Update local state for shared users
      setSharedUsers(prevSharedUsers => prevSharedUsers.filter(su => (typeof su.userId === 'string' ? su.userId : (su.userId as User)._id) !== userIdToUnshare));
    } catch (unshareError) {
      let title = 'Error Unsharing Note';
      let description = 'Could not unshare the user from the note. Please try again.'; // Default improved message

      if (unshareError instanceof AxiosError && unshareError.response) {
        const errorData = unshareError.response.data as ApiErrorResponse | undefined;
        const status = unshareError.response.status;

        // Use backend message if it's specific and not the generic one we want to avoid
        if (errorData?.message && errorData.message.toLowerCase() !== "something went very wrong!") {
          description = errorData.message;
        } else {
          // Fallback to status-based messages if backend message is generic or absent
          switch (status) {
            case 400:
              description = "Invalid request. Please check the details and try again.";
              break;
            case 401:
              title = "Authentication Error";
              description = "You are not authenticated. Please log in and try again.";
              break;
            case 403:
              title = "Permission Denied";
              description = "You do not have permission to unshare this user from the note.";
              break;
            case 404:
              description = "The note or user to unshare could not be found.";
              break;
            case 500:
              // Keep the generic "Something went very wrong!" for 500 if no other message,
              // or use a more user-friendly server error message.
              description = errorData?.message && errorData.message.toLowerCase() !== "something went very wrong!" ? errorData.message : "A server error occurred while trying to unshare the user. Please try again later.";
              break;
            // default: description remains the general default set above
          }
        }
      } else if (unshareError instanceof Error) {
        // For non-Axios errors, try to use the error's message if available
        description = unshareError.message || description;
      }

      toast({
        title: title,
        description: description,
        variant: 'destructive',
      });
    }
  };
  
  const handleRoleChange = async (userIdToUpdate: string, newRole: 'read' | 'write') => {
    if (!note) return;
    try {
      const userToUpdate = sharedUsers.find(su => (typeof su.userId === 'string' ? su.userId : (su.userId as User)._id) === userIdToUpdate);
      if (!userToUpdate) {
        toast({ title: 'Error', description: 'User not found in shared list.', variant: 'destructive' });
        return;
      }

      // Ensure userToUpdate.email is available. If userId is an object, it should have email.
      // If userId is a string, we might need to fetch the email or rely on it being in the sharedWith object.
      let emailToUpdate = userToUpdate.email;
      if (!emailToUpdate && typeof userToUpdate.userId === 'object' && userToUpdate.userId !== null && 'email' in userToUpdate.userId) {
        emailToUpdate = (userToUpdate.userId as User).email;
      }

      if (!emailToUpdate) {
        toast({ title: 'Error', description: 'Could not determine email for role update.', variant: 'destructive' });
        return;
      }

      await api.put(`/notes/${note._id}/share`, {
        email: emailToUpdate, // Use the determined email
        role: newRole,
      });
      toast({
        title: 'Role Updated',
        description: `User role has been updated to ${newRole}.`,
      });
      if (onNoteShared) onNoteShared(); // Refresh the note details
      // Update local state for shared users
      setSharedUsers(prevSharedUsers => 
        prevSharedUsers.map(su => 
          (typeof su.userId === 'string' ? su.userId : (su.userId as User)._id) === userIdToUpdate 
            ? { ...su, role: newRole } 
            : su
        )
      );
    } catch (roleChangeError) {
      let message = 'Could not update user role.';
      if (roleChangeError instanceof AxiosError) {
        const errorData = roleChangeError.response?.data as ApiErrorResponse | undefined;
        if (errorData?.message) message = errorData.message;
      }
      toast({
        title: 'Error Updating Role',
        description: message,
        variant: 'destructive',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Share Note: {note?.title}</DialogTitle>
          <DialogDescription>
            Manage who can access this note. You can add collaborators or remove existing ones.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2">
            <Input
              id="email"
              placeholder="Search user by email..."
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleSearchUsers} disabled={isLoadingSearch || !emailQuery.trim()}>
              {isLoadingSearch ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Search Results:</h4>
              <ul className="max-h-40 overflow-y-auto rounded-md border">
                {searchResults.map((user) => (
                  <li key={user._id} className="p-2 hover:bg-accent flex justify-between items-center">
                    <span>{user.email}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setEmailQuery(user.email); // Optionally prefill input with selected user's email
                        setSearchResults([]); // Clear search results after selection
                      }}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedUser && (
            <div className="mt-4 p-4 border rounded-md bg-muted/50">
              <p className="text-sm font-medium mb-2">Selected User: {selectedUser.email}</p>
              <div className="flex items-center space-x-2">
                <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as 'read' | 'write')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Can view</SelectItem>
                    <SelectItem value="write">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleShareNote} size="sm">
                  <UserPlus className="mr-2 h-4 w-4" /> Share
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6">
            <h4 className="text-sm font-medium mb-2">Shared With:</h4>
            {sharedUsers.length > 0 ? (
              <ul className="max-h-60 overflow-y-auto space-y-3">
                {sharedUsers.map((userShare) => {
                  const user = typeof userShare.userId === 'string' ? null : userShare.userId as User;
                  const userId = typeof userShare.userId === 'string' ? userShare.userId : userShare.userId._id;
                  const userEmail = userShare.email || user?.email || 'Unknown Email';

                  return (
                    <li key={userId} className="p-3 bg-muted/50 rounded-md flex flex-col sm:flex-row justify-between sm:items-center space-y-2 sm:space-y-0">
                      <div className="flex-grow">
                        <p className="text-sm font-medium">{userEmail}</p>
                        <p className="text-xs text-muted-foreground">Role: {userShare.role}</p>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <Select 
                          value={userShare.role} 
                          onValueChange={(newRole) => handleRoleChange(userId, newRole as 'read' | 'write')}
                        >
                          <SelectTrigger className="w-auto sm:w-[100px] h-8 text-xs">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read" className="text-xs">Can view</SelectItem>
                            <SelectItem value="write" className="text-xs">Can edit</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUnshareNote(userId)}
                          disabled={!userId} // Disable if user ID is not available for unshare
                          className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90 h-8 w-8"
                          title="Remove user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">This note has not been shared with anyone yet.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
