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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; 
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
    if (!user || isSaving) { 
      return;
    }

    if (isReadOnlyView) {
      return;
    }
    setIsSaving(true);
    setSyncStatus('syncing');

    const payload = { title: currentTitle, content: currentContent };
    let savedNoteData: Note | null = null;

    try {
      let response;
      if (isNewNote && !note?._id) { 
        response = await api.post('/notes', payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); 
        router.replace(`/notes/${savedNoteData._id}`); 
      } else if (note?._id) { 
        response = await api.put(`/notes/${note._id}`, payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); 
      } else {
        console.error("handleSave called without a note ID for an existing note or for a new note properly.");
        setSyncStatus('error');
        return; 
      }

      if (savedNoteData) {
        setLastSaved(new Date(savedNoteData.updatedAt));
        setSyncStatus('synced');
        if (socket && savedNoteData._id) {
          socket.emit('noteChange', { roomId: savedNoteData._id, note: savedNoteData });
        }
      }
    } catch (saveError) {
      console.error('Failed to save note:', saveError);
      setSyncStatus('error');
    } finally { 
        setIsSaving(false);
    }
  }, [
    user,
    isSaving, 
    isReadOnlyView,
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

  // handleDelete - Opens the confirmation dialog
  const handleDelete = async () => {
    if (!note || !note._id || isNewNote) return;
    setIsDeleteDialogOpen(true);
  };

  // confirmDelete - Actual deletion logic
  const confirmDelete = async () => {
    if (!note || !note._id || isNewNote) return;
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
    } finally {
      setIsDeleteDialogOpen(false);
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

  const SyncStatusIndicator = () => {
    switch (syncStatus) {
      case 'syncing':
        return <span className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Syncing...</span>;
      case 'error':
        return <span className="flex items-center text-sm text-red-500"><AlertTriangle className="mr-1 h-4 w-4" />Error saving</span>;
      case 'synced':
      default:
        return <span className="flex items-center text-sm text-green-600"><CheckCircle2 className="mr-1 h-4 w-4" />Synced</span>;
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
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to delete this note?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your note.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Header section with Back, Share, Save, Delete buttons */}
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

      {/* Note Title and Editor section */}
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

      {/* Footer section with collaborator count and last saved time */}
      <div className="mt-8 pt-4 border-t flex justify-between items-center text-sm text-muted-foreground">
        <div className="flex items-center space-x-4">
          {note && note.sharedWith && note.sharedWith.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center">
                  <Users className="mr-2 h-4 w-4" />
                  {note.sharedWith.length} {note.sharedWith.length === 1 ? 'Collaborator' : 'Collaborators'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Shared With</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {note.sharedWith.map((share) => {
                  const collaborator = typeof share.userId === 'object' ? share.userId as User : null;
                  const email = share.email || collaborator?.email || 'N/A';
                  const name = collaborator?.name ? ` (${collaborator.name})` : '';
                  return (
                    <DropdownMenuItem key={typeof share.userId === 'string' ? share.userId : share.userId._id}>
                      {email}{name} - <span className="capitalize text-xs ml-1">{share.role}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {note && !note.sharedWith?.length && (
             <span className="flex items-center"><Users className="mr-2 h-4 w-4" />0 Collaborators</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <SyncStatusIndicator />
          {lastSaved && (
            <span className="ml-2">Last saved: {new Date(lastSaved).toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
