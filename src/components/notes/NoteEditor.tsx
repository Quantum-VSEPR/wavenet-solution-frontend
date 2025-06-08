'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast'; // Corrected import path
import { useSocket } from '@/contexts/SocketContext';
import { Share2, Save, ArrowLeft, Users, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'; // Added Loader2, CheckCircle2, AlertTriangle
import ShareModal from './ShareModal'; // Uncommented
import { AxiosError } from 'axios';

interface NoteEditorProps {
  noteId: string;
}

const NoteEditor: React.FC<NoteEditorProps> = ({ noteId }) => {
  const router = useRouter();
  const { user } = useAuth(); // Removed unused 'token'
  const { socket } = useSocket();
  const { toast } = useToast();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); // Uncommented

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isNewNote = noteId === 'new';

  // Fetch note data
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
        console.log('[NoteEditor] Fetched note data:', JSON.stringify(response.data, null, 2));
        setNote(response.data);
        setTitle(response.data.title);
        setContent(response.data.content);
        setLastSaved(new Date(response.data.updatedAt));
        setSyncStatus('synced');
      } catch (error) { 
        const fetchError = error as AxiosError;
        console.error('[NoteEditor] Error fetching note in try-catch:', fetchError);
        if (fetchError.response) {
          console.error('[NoteEditor] Error response data:', fetchError.response.data);
          console.error('[NoteEditor] Error response status:', fetchError.response.status);
        }
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

    if (noteId) { // Ensure noteId is present before fetching
        fetchNote();
    }
  }, [noteId, router, toast, isNewNote]);

  // Socket.IO listeners for real-time updates
  useEffect(() => {
    if (!socket || !note?._id) return;

    socket.emit('joinRoom', note._id); // Join the note's room

    const handleNoteUpdated = (updatedNote: Note) => {
      if (updatedNote._id === note._id) {
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
      socket.emit('leaveRoom', note._id);
      socket.off('noteUpdated', handleNoteUpdated);
    };
  }, [socket, note?._id, toast]);

  const handleSave = useCallback(async (currentTitle: string, currentContent: string) => {
    if (!user) return;
    setIsSaving(true);
    setSyncStatus('syncing');

    const payload = { title: currentTitle, content: currentContent };

    try {
      let response;
      if (isNewNote && !note?._id) { // Create new note
        response = await api.post('/notes', payload);
        setNote(response.data); // Update local state with the newly created note (including _id)
        router.replace(`/notes/${response.data._id}`, { scroll: false }); // Update URL without navigation
        toast({ title: 'Note Created', description: 'Your note has been saved.' });
      } else { // Update existing note
        response = await api.put(`/notes/${noteId}`, payload);
        toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
      }
      setLastSaved(new Date(response.data.updatedAt));
      setSyncStatus('synced');
      if (socket && response.data._id) {
        socket.emit('noteChange', { roomId: response.data._id, note: response.data });
      }
    } catch (saveError) { // Renamed error to saveError to avoid conflict and indicate usage
      console.error('Failed to save note:', saveError);
      setSyncStatus('error');
      toast({
        title: 'Error saving note',
        description: 'Could not save your changes.',
        variant: 'destructive',
      });
    }
    setIsSaving(false);
  }, [noteId, user, toast, router, socket, isNewNote, note?._id]);

  // Debounced save for title and content changes
  useEffect(() => {
    if (isNewNote && !title && !content) return; // Don't autosave an empty new note initially
    if (isLoading) return; // Don't save while loading

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      handleSave(title, content);
    }, 1500); // Autosave after 1.5 seconds of inactivity

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [title, content, handleSave, isLoading, isNewNote]);

  const handleManualSave = () => {
    handleSave(title, content);
  };

  const handleDelete = async () => {
    if (!note || isNewNote) return;
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await api.delete(`/notes/${note._id}`);
        toast({ title: 'Note Deleted', description: 'The note has been successfully deleted.'});
        if (socket) {
            socket.emit('noteDeleted', { roomId: note._id, noteId: note._id });
        }
        router.push('/dashboard');
      } catch (deleteError) { // Renamed error to deleteError and will log it
        console.error('Failed to delete note:', deleteError); // Log the error
        toast({ title: 'Error Deleting Note', description: 'Could not delete the note.', variant: 'destructive' });
      }
    }
  };
  
  // Permission checks (simplified)
  const canEdit = note ? (typeof note.creator === 'string' ? note.creator === user?._id : note.creator._id === user?._id) || 
                         note.sharedWith.some(s => (typeof s.userId === 'string' ? s.userId === user?._id : (s.userId as User)._id === user?._id) && s.role === 'write') 
                         : isNewNote; // New notes are editable
  const canShare = note ? (typeof note.creator === 'string' ? note.creator === user?._id : note.creator._id === user?._id) : false;
  const canDelete = note ? (typeof note.creator === 'string' ? note.creator === user?._id : note.creator._id === user?._id) : false;


  if (isLoading) {
    return <p className="text-center mt-10">Loading note editor...</p>;
  }

  const handleNoteShared = () => {
    // This function will be called when a note is shared/unshared/role changed in ShareModal
    // We need to re-fetch the note to update the sharedWith array and collaborator count
    if (note?._id) {
      const fetchNote = async () => {
        try {
          const response = await api.get(`/notes/${note._id}`);
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
      fetchNote();
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-3xl">
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        note={note} // Pass the full note object
        onNoteShared={handleNoteShared} // Pass the callback
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
          <Button onClick={handleManualSave} disabled={isSaving || !canEdit} size="sm">
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
          disabled={!canEdit || isSaving}
        />
        <Textarea
          placeholder="Start writing your note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[calc(100vh-250px)] resize-none border-0 shadow-none focus-visible:ring-0 p-0"
          disabled={!canEdit || isSaving}
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
        </span> {/* Closed the span tag here */}
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
