'use client';

import React, { useMemo } from 'react'; // Added useMemo
import { Note } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Archive, ArchiveRestore, Eye, Trash2 } from 'lucide-react'; // Removed Users icon, Added Trash2
import api from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { AxiosError } from 'axios';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Added AlertDialog imports

interface NoteItemProps {
  note: Note;
  showCreator?: boolean;
  currentTab: 'myNotes' | 'sharedNotes' | 'archivedNotes';
  onNoteUpdate: () => Promise<void> | void; 
  onNoteDeleted?: (noteId: string, noteType: 'myNotes' | 'archivedNotes') => void; 
  onNoteArchiveStatusChanged?: (note: Note, isArchived: boolean) => void;
}

// Helper function to strip HTML tags and preserve meaningful newlines
const stripHtmlAndPreserveNewlines = (html: string) => {
  if (typeof document !== 'undefined') {
    const tempDiv = document.createElement('div');
    // Convert <p> tags to text followed by two newlines (paragraph break)
    // Convert <br> tags to a single newline (line break)
    // This order is important to handle <p><br></p> correctly as well
    let processedHtml = html.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n\n');
    processedHtml = processedHtml.replace(/<br\s*\/?>/gi, '\n');
    tempDiv.innerHTML = processedHtml;
    const text = tempDiv.textContent || tempDiv.innerText || "";
    // Trim leading/trailing whitespace (which includes newlines)
    // Then, normalize multiple newlines (more than 2) down to 2, and single newlines remain single.
    return text.trim().replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }
  // Fallback for server-side rendering or environments without DOMParser
  return html.replace(/<[^>]+>/g, '').trim(); // Basic stripping, less accurate for newlines
};

const NoteItem: React.FC<NoteItemProps> = ({ note, showCreator = false, currentTab, onNoteUpdate, onNoteDeleted, onNoteArchiveStatusChanged }) => {
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

  const handleDeleteNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) {
      toast({ title: "Permission Denied", description: "Only the owner can delete this note.", variant: "destructive" });
      return;
    }
    try {
      await api.delete(`/notes/${note._id}`);
      toast({
        title: "Note Deleted",
        description: `"${note.title || '(Untitled Note)'}" has been permanently deleted.`,
      });
      
      if (onNoteDeleted) {
        // Determine noteType based on currentTab
        const noteType = currentTab === 'archivedNotes' ? 'archivedNotes' : 'myNotes';
        onNoteDeleted(note._id, noteType); // Call with noteId and noteType
      }
      await onNoteUpdate(); 
    } catch (error) {
      const axiosError = error as AxiosError<unknown>; 
      console.error("Failed to delete note:", axiosError);
      toast({
        title: "Error Deleting Note",
        description: (axiosError.response?.data as { message?: string })?.message || "Could not delete the note.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOwner) {
      toast({ title: "Permission Denied", description: "Only the owner can archive this note.", variant: "destructive" });
      return;
    }

    if (onNoteArchiveStatusChanged) {
      onNoteArchiveStatusChanged(note, true);
    }

    try {
      await api.put(`/notes/${note._id}/archive`);
      toast({
        title: "Note Archived",
        description: `"${note.title || '(Untitled Note)'}" has been moved to archives.`
      });
      await onNoteUpdate(); 
    } catch (error) {
      if (onNoteArchiveStatusChanged) {
        onNoteArchiveStatusChanged(note, false); // Corrected: Pass the full note object
      }
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

    if (onNoteArchiveStatusChanged) {
      onNoteArchiveStatusChanged(note, false);
    }

    try {
      await api.put(`/notes/${note._id}/unarchive`);
      toast({
        title: "Note Unarchived",
        description: `"${note.title || '(Untitled Note)'}" has been restored from archives.`
      });
      await onNoteUpdate(); 
    } catch (error) {
      if (onNoteArchiveStatusChanged) {
        onNoteArchiveStatusChanged(note, true); // Corrected: Pass the full note object
      }
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
          <CardTitle className="flex justify-between items-start">
            <span className="truncate group-hover:underline">{note.title || '(Untitled Note)'}</span>
            {/* Conditional rendering for the "Shared" badge in the top right */}
            {currentTab !== 'sharedNotes' && note.sharedWith && note.sharedWith.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">Shared</Badge>
            )}
          </CardTitle>
          {showCreator && typeof note.creator !== 'string' && note.creator?.email && (
            <p className="text-xs text-muted-foreground">By: {note.creator.email}</p>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground break-words line-clamp-3 whitespace-pre-wrap">
            {stripHtmlAndPreserveNewlines(note.content) || 'No content'}
          </p>
        </CardContent>
      </div>
      <CardFooter className="flex justify-between items-center pt-4 border-t mt-auto">
        <div>
          {isOwner ? <Badge variant="outline">Owner</Badge> : <Badge variant="secondary">Shared</Badge>}
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
          {isOwner && (currentTab === 'myNotes' || currentTab === 'archivedNotes') && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" title="Delete Note" onClick={(e) => e.stopPropagation()}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the note titled &quot;{note.title || '(Untitled Note)'}&quot;.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default NoteItem;
