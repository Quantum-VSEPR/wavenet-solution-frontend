'use client';

import React, { useState, useEffect } from 'react';
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

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, note, onNoteShared }) => {
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
    try {
      const response = await api.get<{ data: User[] }>(`/users/search?email=${emailQuery}`);
      const ownerId = typeof note?.creator === 'string' ? note.creator : note?.creator._id;
      const filteredResults = response.data.data.filter(
        (userResult: User) => 
          userResult._id !== ownerId && 
          !sharedUsers.some(su => (typeof su.userId === 'string' ? su.userId : (su.userId as User)._id) === userResult._id)
      );
      setSearchResults(filteredResults);
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
      setSearchResults([]);
    }
    setIsLoadingSearch(false);
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
      if (onNoteShared) onNoteShared();
    } catch (shareError) {
      let message = 'Could not share the note.';
      if (shareError instanceof AxiosError) {
        const errorData = shareError.response?.data as ApiErrorResponse | undefined;
        if (errorData?.message) message = errorData.message;
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
      if (onNoteShared) onNoteShared();
    } catch (unshareError) {
      let message = 'Could not unshare the note.';
      if (unshareError instanceof AxiosError) {
        const errorData = unshareError.response?.data as ApiErrorResponse | undefined;
        if (errorData?.message) message = errorData.message;
      }
      toast({
        title: 'Error Unsharing Note',
        description: message,
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

      await api.put(`/notes/${note._id}/share`, {
        email: userToUpdate.email,
        role: newRole,
      });
      toast({
        title: 'Role Updated',
        description: `User role has been updated to ${newRole}.`,
      });
      if (onNoteShared) onNoteShared();
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
            Manage who can access and edit this note.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2">
            <Input
              id="email-search"
              placeholder="Enter email to share with"
              value={emailQuery}
              onChange={(e) => setEmailQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchUsers()}
            />
            <Button onClick={handleSearchUsers} disabled={isLoadingSearch} size="sm">
              {isLoadingSearch ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
              {searchResults.map((userResult) => (
                <div 
                  key={userResult._id}
                  className={`p-2 rounded-md cursor-pointer hover:bg-muted ${selectedUser?._id === userResult._id ? 'bg-muted' : ''}`}
                  onClick={() => setSelectedUser(userResult)}
                >
                  {userResult.username} ({userResult.email})
                </div>
              ))}
            </div>
          )}

          {selectedUser && (
            <div className="mt-4 p-4 border rounded-md bg-muted/50">
              <p className="font-semibold mb-2">Share with: {selectedUser.email}</p>
              <div className="flex items-center space-x-2">
                <Select value={selectedRole} onValueChange={(value: 'read' | 'write') => setSelectedRole(value)}>
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
        </div>

        <div className="mt-6">
          <h4 className="font-semibold mb-2">Currently Shared With:</h4>
          {sharedUsers.length > 0 ? (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {sharedUsers.map((share) => {
                const sharedUserDetails = typeof share.userId === 'string' ? { _id: share.userId, email: share.email } : share.userId;
                return (
                  <li key={sharedUserDetails._id} className="flex items-center justify-between p-2 border rounded-md">
                    <div>
                      <p className="font-medium">{share.email}</p>
                      {/* <p className="text-xs text-muted-foreground">Role: {share.role}</p> */}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Select 
                            value={share.role as 'read' | 'write'} 
                            onValueChange={(newRole: 'read' | 'write') => handleRoleChange(sharedUserDetails._id, newRole)}
                        >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="read">Can view</SelectItem>
                                <SelectItem value="write">Can edit</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => handleUnshareNote(sharedUserDetails._id)} className="h-8 w-8">
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This note is not shared with anyone yet.</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
