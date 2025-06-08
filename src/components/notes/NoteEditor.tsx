'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { Share2, Save, ArrowLeft, Users, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import ShareModal from './ShareModal';
import { AxiosError } from 'axios';

interface NoteEditorProps {
  noteId: string;
}

const NoteEditor: React.FC<NoteEditorProps> = ({ noteId }) => {
  const router = useRouter();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toast } = useToast();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNewNote = noteId === 'new';

  // Permission checks using useMemo
  const canEdit = useMemo(() => {
    if (isNewNote) return true;
    if (!note || !user) return false;
    const isCreator = typeof note.creator === 'string' ? note.creator === user._id : note.creator._id === user._id;
    if (isCreator) return true;
    return note.sharedWith.some(s => 
      (typeof s.userId === 'string' ? s.userId === user._id : (s.userId as User)._id === user._id) && s.role === 'write'
    );
  }, [note, user, isNewNote]);

  const isReadOnlyView = useMemo(() => !isNewNote && !canEdit, [isNewNote, canEdit]);

  const canShare = useMemo(() => {
    if (isNewNote || !note || !user) return false;
    return typeof note.creator === 'string' ? note.creator === user._id : note.creator._id === user._id;
  }, [note, user, isNewNote]);

  const canDelete = useMemo(() => {
    if (isNewNote || !note || !user) return false;
    return typeof note.creator === 'string' ? note.creator === user._id : note.creator._id === user._id;
  }, [note, user, isNewNote]);

  // Fetch note data - SINGLE INSTANCE
  useEffect(() => {
    if (isNewNote) {
      setIsLoading(false);
      setTitle('Untitled Note');
      setContent('');
      return;
    }

    const fetchNote = async () => {
      console.log(`[NoteEditor] Fetching note with ID: ${noteId}`);
      setIsLoading(true);
      try {
        const response = await api.get(`/notes/${noteId}`);
        console.log('[NoteEditor] Successfully fetched note. Response status:', response.status);
        // console.log('[NoteEditor] Fetched note data:', JSON.stringify(response.data, null, 2)); // Verbose
        setNote(response.data);
        setTitle(response.data.title);
        setContent(response.data.content);
        setLastSaved(new Date(response.data.updatedAt));
        setSyncStatus('synced');
      } catch (error) { 
        const fetchError = error as AxiosError;
        console.error('[NoteEditor] Error fetching note:', fetchError);
        const errorStatus = fetchError.response?.status;
        if (errorStatus === 403 || errorStatus === 404) {
          toast({
            title: errorStatus === 403 ? 'Permission Denied' : 'Note Not Found',
            description: errorStatus === 403 ? 'You do not have permission to view this note.' : 'The requested note could not be found.',
            variant: 'destructive',
          });
          router.push('/dashboard');
        } else {
          toast({
            title: 'Error loading note',
            description: 'Could not load the note. Please try again later.',
            variant: 'destructive',
          });
          setSyncStatus('error'); 
        }
      }
      setIsLoading(false);
    };

    if (noteId) {
        fetchNote();
    }
  }, [noteId, router, toast, isNewNote]);

  // Socket.IO listeners for real-time updates - SINGLE INSTANCE
  useEffect(() => {
    if (!socket || !note?._id) return; // Guard against null socket or note._id

    const currentNoteId = note._id; // Capture note._id to use in cleanup

    socket.emit('joinRoom', currentNoteId);

    const handleNoteUpdated = (updatedNote: Note) => {
      if (updatedNote._id === currentNoteId) { // Use captured currentNoteId
        setNote(updatedNote);
        setTitle(updatedNote.title);
        setContent(updatedNote.content);
        setLastSaved(new Date(updatedNote.updatedAt));
        setSyncStatus('synced');
        toast({ title: 'Note Updated', description: 'Note was updated by another user.' });
      }
    };

    socket.on('noteUpdated', handleNoteUpdated);

    return () => {
      if (socket && currentNoteId) { // Guard in cleanup
        socket.emit('leaveRoom', currentNoteId);
        socket.off('noteUpdated', handleNoteUpdated);
      }
    };
  }, [socket, note, toast]); // note dependency is fine here as we capture _id

  // handleSave - SINGLE INSTANCE
  const handleSave = useCallback(async (currentTitle: string, currentContent: string) => {
    if (!user) return;

    if (isReadOnlyView) {
      toast({
        title: "Read-only Access",
        description: "You do not have permission to edit this note.",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    setSyncStatus('syncing');

    const payload = { title: currentTitle, content: currentContent };

    try {
      let response;
      if (isNewNote && !note?._id) {
        response = await api.post('/notes', payload);
        const newNoteData = response.data as Note; // Assert type
        setNote(newNoteData);
        router.replace(`/notes/${newNoteData._id}`, { scroll: false });
        toast({ title: 'Note Created', description: 'Your note has been saved.' });
        if (socket && newNoteData._id) { // Guard socket and use newNoteData._id
          socket.emit('noteChange', { roomId: newNoteData._id, note: newNoteData });
        }
      } else if (note?._id) { // Ensure note and note._id exist for update
        response = await api.put(`/notes/${note._id}`, payload); // Use note._id
        const updatedNoteData = response.data as Note; // Assert type
        toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
        setLastSaved(new Date(updatedNoteData.updatedAt));
        setSyncStatus('synced');
        if (socket && updatedNoteData._id) { // Guard socket and use updatedNoteData._id
          socket.emit('noteChange', { roomId: updatedNoteData._id, note: updatedNoteData });
        }
      } else {
        // Should not happen if logic is correct, but good to handle
        console.error("handleSave called without a note ID for an existing note.");
        toast({title: "Save Error", description: "Cannot save note without an ID.", variant: "destructive"});
        setSyncStatus('error');
        setIsSaving(false);
        return;
      }
      // This part was slightly off, ensure we use the correct data from response for new notes
      if (response && response.data) {
        const savedNote = response.data as Note;
        setLastSaved(new Date(savedNote.updatedAt));
        setSyncStatus('synced');
        // For new notes, note state is already set above, socket emit also done.
        // For existing notes, this is redundant if done inside the else if block.
      } else if (!response && isNewNote) {
        // If post failed and it was a new note, it's an error handled by catch
      }

    } catch (saveError) {
      console.error('Failed to save note:', saveError);
      setSyncStatus('error');
      toast({
        title: 'Error saving note',
        description: 'Could not save your changes.',
        variant: 'destructive',
      });
    }
    setIsSaving(false);
  }, [isNewNote, note, user, toast, router, socket, isReadOnlyView]); // noteId removed, note is used directly

  // Debounced save for title and content changes - SINGLE INSTANCE
  useEffect(() => {
    if (isLoading || isReadOnlyView) return;
    if (isNewNote && !title && !content && !note?._id) return; // Don't autosave an empty new note that hasn't been saved once

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      // Ensure note exists for existing notes, or title/content for new notes before saving
      if ((note?._id && !isNewNote) || (isNewNote && (title || content))) { 
         handleSave(title, content);
      }
    }, 1500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [title, content, handleSave, isLoading, isNewNote, isReadOnlyView, note?._id]);

  // handleManualSave - SINGLE INSTANCE
  const handleManualSave = () => {
    handleSave(title, content);
  };

  // handleDelete - SINGLE INSTANCE
  const handleDelete = async () => {
    if (!note || !note._id || isNewNote) return; // Ensure note and note._id exist and it's not a new note form
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await api.delete(`/notes/${note._id}`);
        toast({ title: 'Note Deleted', description: 'The note has been successfully deleted.'});
        if (socket && note._id) { // Guard socket and note._id
            socket.emit('noteDeleted', { roomId: note._id, noteId: note._id });
        }
        router.push('/dashboard');
      } catch (deleteError) {
        console.error('Failed to delete note:', deleteError);
        toast({ title: 'Error Deleting Note', description: 'Could not delete the note.', variant: 'destructive' });
      }
    }
  };
  
  if (isLoading) {
    return <p className="text-center mt-10">Loading note editor...</p>;
  }

  const handleNoteShared = () => {
    if (note?._id) { // Guard note._id
      const fetchNoteAfterShare = async () => { 
        try {
          const response = await api.get(`/notes/${note._id}`); // Use note._id
          setNote(response.data);
        } catch (error) {
          console.error('Failed to re-fetch note after sharing:', error);
          toast({
            title: 'Error updating note details',
            description: 'Could not refresh note details after sharing action.',
            variant: 'destructive',
          });
        }
      };
      fetchNoteAfterShare();
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-3xl">
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        note={note} // note can be null initially, ShareModal should handle this
        onNoteShared={handleNoteShared} 
      />
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={() => router.push('/dashboard')} size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
        <div className="flex items-center space-x-2">
          {canShare && (
            <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(true)} disabled={isNewNote || !note}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
          )}
          <Button onClick={handleManualSave} disabled={isSaving || isReadOnlyView} size="sm">
            <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Now'}
          </Button>
           {canDelete && (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isNewNote || !note}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Note Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-2xl font-bold border-0 shadow-none focus-visible:ring-0 p-0 mb-2"
          disabled={isReadOnlyView || isSaving}
        />
        <Textarea
          placeholder="Start writing your note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[calc(100vh-250px)] resize-none border-0 shadow-none focus-visible:ring-0 p-0"
          disabled={isReadOnlyView || isSaving}
        />
      </div>
      <div className="text-xs text-muted-foreground flex justify-between items-center">
        <span className="flex items-center">
          {syncStatus === 'syncing' && (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Syncing...</>
          )}
          {syncStatus === 'error' && (
            <><AlertTriangle className="mr-2 h-3.5 w-3.5 text-red-500" /> Sync error, try saving manually.</>
          )}
          {syncStatus === 'synced' && lastSaved && (
            <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-500" /> Last saved: {new Date(lastSaved).toLocaleTimeString()}</>
          )}
          {syncStatus === 'synced' && !lastSaved && isNewNote && (
            <span className="text-muted-foreground">Start typing to auto-save.</span>
          )}
           {syncStatus === 'synced' && !lastSaved && !isNewNote && !isLoading && (
            <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-green-500" /> Synced</>
          )}
        </span>
        {note && !isNewNote && (
            <div className="flex items-center">
                <Users className="mr-1 h-3 w-3" />
                <span>{note.sharedWith.length} collaborator{note.sharedWith.length !== 1 ? 's' : ''}</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default NoteEditor;
