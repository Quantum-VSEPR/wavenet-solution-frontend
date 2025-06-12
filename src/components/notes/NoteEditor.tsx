'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { Share2, Save, ArrowLeft, Users, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import ShareModal from './ShareModal';
import { AxiosError } from 'axios';
import 'react-quill/dist/quill.snow.css'; // Import Quill styles
import dynamic from 'next/dynamic';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

// Define Quill modules and formats configuration outside the component
const quillModules = {
  toolbar: [
    [{ 'header': '1'}, {'header': '2'}, { 'font': [] }],
    [{size: []}],
    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
    [{'list': 'ordered'}, {'list': 'bullet'}, 
     {'indent': '-1'}, {'indent': '+1'}],
    ['link', 'image', 'video'],
    ['clean']
  ],
  clipboard: {
    matchVisual: false,
  }
};

const quillFormats = [
  'header', 'font', 'size',
  'bold', 'italic', 'underline', 'strike', 'blockquote',
  'list', 'bullet', 'indent',
  'link', 'image', 'video'
];

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

  // Fetch note data
  useEffect(() => {
    if (isNewNote) {
      setIsLoading(false);
      setTitle('Untitled Note');
      setContent(''); 
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`/notes/${noteId}`);
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
  }, [noteId, router, toast, isNewNote, setIsLoading, setTitle, setContent, setNote, setLastSaved, setSyncStatus]); // Added all state setters used inside

  // Socket.IO listeners
  useEffect(() => {
    if (!socket || !note?._id) return;

    const currentNoteId = note._id;
    socket.emit('joinRoom', currentNoteId);

    const handleNoteUpdated = (updatedNote: Note) => {
      if (updatedNote._id === currentNoteId) {
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
      if (socket && currentNoteId) {
        socket.emit('leaveRoom', currentNoteId);
        socket.off('noteUpdated', handleNoteUpdated);
      }
    };
  }, [socket, note, toast, setNote, setTitle, setContent, setLastSaved, setSyncStatus]); // Added all state setters used inside

  // handleSave
  const handleSave = useCallback(async (currentTitle: string, currentContent: string) => {
    if (!user || isSaving) { // Prevent concurrent saves or saves when no user
      return;
    }

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
    let savedNoteData: Note | null = null;

    try {
      let response;
      if (isNewNote && !note?._id) { // Creating a new note
        response = await api.post('/notes', payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); // Set the full note object for the new note
        router.replace(`/notes/${savedNoteData._id}`); // Navigate to the new note's URL
        toast({ title: 'Note Created', description: 'Your note has been saved.' });
      } else if (note?._id) { // Updating an existing note
        response = await api.put(`/notes/${note._id}`, payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); // Update the note state with the full response
        toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
      } else {
        // This case should ideally not be reached if logic is correct
        console.error("handleSave called without a note ID for an existing note or for a new note properly.");
        toast({title: "Save Error", description: "Cannot determine save operation.", variant: "destructive"});
        setSyncStatus('error');
        // setIsSaving(false); // Moved to finally block
        return; // Return early as setIsSaving(false) in finally will cover this path.
      }

      // Common actions for both new and updated notes if save was successful
      if (savedNoteData) {
        setLastSaved(new Date(savedNoteData.updatedAt));
        setSyncStatus('synced');
        if (socket && savedNoteData._id) {
          // Emit change to other clients/tabs
          socket.emit('noteChange', { roomId: savedNoteData._id, note: savedNoteData });
        }
      }
    } catch (saveError) {
      console.error('Failed to save note:', saveError);
      setSyncStatus('error');
      const axiosError = saveError as AxiosError<{ message?: string }>; // More specific type
      toast({
        title: 'Error saving note',
        description: axiosError?.response?.data?.message || 'Could not save your changes.',
        variant: 'destructive',
      });
    } finally { // Ensure isSaving is reset
        setIsSaving(false);
    }
  }, [
    user,
    isSaving, 
    isReadOnlyView,
    toast,
    setIsSaving,
    setSyncStatus,
    isNewNote,
    note?._id, 
    router,
    setNote,
    socket,
    setLastSaved,
  ]);

  // Debounced save
  useEffect(() => {
    // Exit early if loading, read-only, or already saving
    if (isLoading || isReadOnlyView || isSaving) {
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      // Re-check these conditions inside setTimeout as state might have changed
      if (isLoading || isReadOnlyView || isSaving) {
        return;
      }

      const originalTitleFromServer = note?.title ?? '';
      const originalContentFromServer = note?.content ?? '';

      const titleEffectivelyChanged = title !== originalTitleFromServer;
      const contentEffectivelyChanged = content !== originalContentFromServer;

      if (isNewNote && !note?._id) { // For a new, unsaved note
        // Only save if there's some actual text, different from initial placeholders
        if (title.trim() !== '' && title.trim() !== 'Untitled Note' || content.trim() !== '') {
          handleSave(title, content);
        }
      } else if (note?._id) { // For an existing, loaded note
        if (titleEffectivelyChanged || contentEffectivelyChanged) {
          handleSave(title, content);
        }
      }
    }, 1500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [title, content, note, handleSave, isLoading, isNewNote, isReadOnlyView, isSaving]); // Added `note` as a dependency for comparison

  // handleManualSave
  const handleManualSave = () => {
    handleSave(title, content);
  };

  // handleDelete
  const handleDelete = async () => {
    if (!note || !note._id || isNewNote) return;
    if (window.confirm('Are you sure you want to delete this note?')) {
      try {
        await api.delete(`/notes/${note._id}`);
        toast({ title: 'Note Deleted', description: 'The note has been successfully deleted.'});
        if (socket && note._id) {
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
    if (note?._id) {
      const fetchNoteAfterShare = async () => { 
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
      fetchNoteAfterShare();
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-3xl">
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        note={note}
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
        <ReactQuill
          theme="snow"
          value={content}
          onChange={setContent}
          readOnly={isReadOnlyView || isSaving}
          className="min-h-[calc(100vh-250px)] resize-none border-0 shadow-none focus-visible:ring-0 p-0"
          modules={quillModules}
          formats={quillFormats}
          placeholder="Start writing your note..."
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
