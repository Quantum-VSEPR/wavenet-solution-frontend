'use client';

import React, { useMemo } from 'react'; // Added useMemo
import { Note } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Archive, ArchiveRestore, Eye, Users } from 'lucide-react'; // Added Users icon
import api from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { AxiosError } from 'axios';

interface NoteItemProps {
  note: Note;
  showCreator?: boolean;
  currentTab: 'myNotes' | 'sharedNotes' | 'archivedNotes';
  onNoteUpdate: () => Promise<void> | void; // Allow onNoteUpdate to be async or sync
}

// Helper function to strip HTML tags
const stripHtml = (html: string) => {
  if (typeof document !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  }
  // Fallback for server-side rendering or environments without DOMParser
  return html.replace(/<[^>]+>/g, '');
};

const NoteItem: React.FC<NoteItemProps> = ({ note, showCreator = false, currentTab, onNoteUpdate }) => {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleViewNote = () => {
    router.push(`/notes/${note._id}`);
  };

  const isOwner = useMemo(() => {
    if (!user || !note.creator) { 
      return false;
    }
    if (typeof note.creator === 'string') {
      return note.creator === user._id;
    }
    // At this point, note.creator is a User object (since it's not string and not null/undefined)
    return note.creator._id === user._id;
  }, [user, note.creator]);

  const handleArchiveNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) {
      toast({ title: "Permission Denied", description: "Only the owner can archive this note.", variant: "destructive" });
      return;
    }
    try {
      await api.put(`/notes/${note._id}/archive`);
      try {
        toast({
          title: "Note Archived",
          description: `\"${note.title || '(Untitled Note)'}\" has been moved to archives.`
        });
      } catch (toastError) {
        console.error("Success toast failed after archiving:", toastError);
      }
      await onNoteUpdate(); // Await if it's a promise
    } catch (error) {
      const axiosError = error as AxiosError<unknown>; 
      console.error("Failed to archive note (api.put error):", axiosError);
      if (axiosError.response) {
        console.error("API Error Response Data:", axiosError.response.data);
        console.error("API Error Response Status:", axiosError.response.status);
      } else if (axiosError.request) {
        console.error("API Error Request (no response received):", axiosError.request);
      } else {
        console.error("API Error Message:", axiosError.message);
      }
      toast({
        title: "Error Archiving Note",
        description: (axiosError.response?.data as { message?: string })?.message || "Could not archive the note. Please check console for details.",
        variant: "destructive"
      });
    }
  };

  const handleUnarchiveNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) {
      toast({ title: "Permission Denied", description: "Only the owner can unarchive this note.", variant: "destructive" });
      return;
    }
    try {
      await api.put(`/notes/${note._id}/unarchive`);
      try {
        toast({
          title: "Note Unarchived",
          description: `\"${note.title || '(Untitled Note)'}\" has been restored from archives.`
        });
      } catch (toastError) {
        console.error("Success toast failed after unarchiving:", toastError);
      }
      await onNoteUpdate(); // Await if it's a promise
    } catch (error) {
      const axiosError = error as AxiosError<unknown>;
      console.error("Failed to unarchive note (api.put error):", axiosError);
      if (axiosError.response) {
        console.error("API Error Response Data:", axiosError.response.data);
        console.error("API Error Response Status:", axiosError.response.status);
      } else if (axiosError.request) {
        console.error("API Error Request (no response received):", axiosError.request);
      } else {
        console.error("API Error Message:", axiosError.message);
      }
      toast({
        title: "Error Unarchiving Note",
        description: (axiosError.response?.data as { message?: string })?.message || "Could not unarchive the note. Please check console for details.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow flex flex-col justify-between h-full">
      <div onClick={handleViewNote} className="cursor-pointer flex-grow">
        <CardHeader>
          <CardTitle className="truncate flex justify-between items-center">
            <span>{note.title || '(Untitled Note)'}</span>
            {isOwner && note.isSharedByCurrentUser && currentTab === 'myNotes' && (
              <Badge variant="secondary" className="ml-2 text-xs">
                <Users className="mr-1 h-3 w-3" /> Shared
              </Badge>
            )}
          </CardTitle>
          {showCreator && typeof note.creator !== 'string' && note.creator?.email && (
            <p className="text-xs text-muted-foreground">By: {note.creator.email}</p>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground break-words line-clamp-3">
            {stripHtml(note.content) || 'No content'}
          </p>
        </CardContent>
      </div>
      <CardFooter className="flex justify-between items-center pt-4 border-t mt-auto">
        <div>
          {isOwner ? <Badge variant="outline">Owner</Badge> : <Badge variant="secondary">Shared</Badge>}
          {/* The explicit "Shared by You" badge below is removed as it's now part of the CardTitle area for better visibility */}
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="icon" onClick={handleViewNote} title="View Note">
            <Eye className="h-4 w-4" />
          </Button>
          {isOwner && currentTab !== 'archivedNotes' && (
            <Button variant="outline" size="icon" onClick={handleArchiveNote} title="Archive Note">
              <Archive className="h-4 w-4" />
            </Button>
          )}
          {isOwner && currentTab === 'archivedNotes' && (
            <Button variant="outline" size="icon" onClick={handleUnarchiveNote} title="Unarchive Note">
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default NoteItem;
