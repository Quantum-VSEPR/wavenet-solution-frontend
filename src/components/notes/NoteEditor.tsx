'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // Ensure useCallback and useState are imported
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Users, Trash2, Eye, ArrowLeft, Copy, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react'; 
import ShareModal from './ShareModal';
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
} from "@/components/ui/alert-dialog";
import { AxiosError } from 'axios';
import 'react-quill/dist/quill.snow.css';
import dynamic from 'next/dynamic';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TurndownService from 'turndown';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
// import { asBlob } from 'html-docx-js'; // If using it as a module
import htmlDocx from 'html-docx-js/dist/html-docx'; // Correct import based on .d.ts
// Import Quill for editor type and ReactQuill component type
import BaseReactQuill, { Quill, UnprivilegedEditor, ReactQuillProps } from 'react-quill'; // Added UnprivilegedEditor and ReactQuillProps
import { RealtimeNoteUpdateData, NoteDetailsUpdatedPayload, NoteSharingUpdatedPayload, NotesListUpdatePayload } from '@/contexts/SocketContext'; // Corrected: Added NoteSharingUpdatedPayload if it exists, or ensure it's correctly named and exported from SocketContext
import { Progress } from '@/components/ui/progress'; // Added import for Progress
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added imports for Card components
import { DeltaStatic, Sources } from 'quill'; // Import DeltaStatic and Sources

// Define the list of fonts to be whitelisted and used in the toolbar
const QUILL_FONT_WHITELIST = [
  'sans-serif', // Default
  'serif',      // Default
  'monospace',  // Default
       // Quill will handle this as ql
];

// Define the formats to be used by Quill, corresponding to the toolbar
const quillFormats = [
  'font', 'header',
  'bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block',
  'list', 'bullet', 'indent',
  'script', 'sub', 'super',
  'align',
  'color', 'background',
  'link', 'image', 'video', 'formula',
  'size',
  'list', // for checklist
  'clean'
];

interface NoteEditorProps {
  noteId: string;
}

const MAX_TITLE_LENGTH = 100;
const NoteEditor: React.FC<NoteEditorProps> = ({ noteId }) => {
  const router = useRouter();
  const searchParams = useSearchParams(); // Get search params
  const { user } = useAuth();
  const socketContext = useSocket();
  const socket = socketContext.socket;
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
  const [userMadeChangesInThisSession, setUserMadeChangesInThisSession] = useState(false);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);
  const [permissionErrorToastShown, setPermissionErrorToastShown] = useState(false);
  const turndownService = useMemo(() => new TurndownService(), []);

  const quillContainerRef = useRef<HTMLDivElement>(null); 
  const reactQuillRef = useRef<BaseReactQuill>(null); 

  // Refs to store the state of the note when it was last loaded or synced from an external source
  const initialLoadedTitleRef = useRef<string | null>(null);
  const initialLoadedContentRef = useRef<string | null>(null);

  const noteStateRef = useRef(note);
  const titleStateRef = useRef(title);
  const userMadeChangesStateRef = useRef(userMadeChangesInThisSession);
  const userAuthStateRef = useRef(user);
  const socketInstanceRef = useRef(socket);

  // Dynamically import ReactQuill and register custom fonts
  const ReactQuillDynamic = useMemo(() => dynamic<ReactQuillProps>(() =>
    import('react-quill').then((module) => {
      const ReactQuillComponent = module.default || module;
      // Access Quill from the module, or use the global Quill if available
      const QuillInstance = module.Quill || (window as any).Quill || Quill;

      if (QuillInstance && typeof QuillInstance.import === 'function') {
        try {
          const Font = QuillInstance.import('formats/font');
          if (Font) {
            Font.whitelist = QUILL_FONT_WHITELIST;
            QuillInstance.register(Font, true);
            console.log('[NoteEditor] Custom fonts registered with Quill.');
          } else {
            console.error("[NoteEditor] Could not import 'formats/font' from Quill.");
          }
        } catch (e) {
          console.error('[NoteEditor] Error during Quill font registration:', e);
        }
      } else {
        console.error('[NoteEditor] Could not obtain Quill instance or Quill.import is not a function from react-quill module to register fonts.');
      }
      return ReactQuillComponent; // Return the component for dynamic loading
    }), { ssr: false,
      // Adding a loading component can sometimes help with ref issues during dynamic load
      loading: () => <p>Loading editor...</p> 
    }
  ), []);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNewNote = noteId === 'new';

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [ { 'font': QUILL_FONT_WHITELIST }],
        [{ 'size': ['small', false, 'large', 'huge'] }], // Use the new font list
        ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'align': [] }],
        [{'color': []}, {'background': []}],
        ['link', 'image', 'video', 'formula'],
        ['clean'],
        [{ 'list': 'check' }],
      ],
      // handlers: { image: imageHandler } // Example for custom image handler
    },
    clipboard: {
      matchVisual: false, // Recommended for better paste handling
    },
    history: {
      delay: 2500, // Debounce time for history entries
      maxStack: 500, // Max history stack size
      userOnly: true, // Only track user changes
    },
    // Add other modules as needed, e.g., syntax highlighting for code blocks
    // syntax: true, // If you want syntax highlighting for code blocks (requires additional setup)
  }), []);

  // Permission checks using useMemo
  const canEdit = useMemo(() => {
    if (isNewNote) return true;
    if (!note || !user) return false;
    // Ensure note.creator is an object with _id before comparing
    const creatorId = typeof note.creator === 'object' && note.creator !== null && '_id' in note.creator ? note.creator._id : note.creator;
    if (creatorId === user._id) return true;

    const userShare = note.sharedWith.find(s => {
      const sharedUserId = typeof s.userId === 'object' && s.userId !== null && '_id' in s.userId ? s.userId._id : s.userId;
      return sharedUserId === user._id;
    });
    return userShare?.role === 'write';
  }, [note, user, isNewNote]);

  // Effect to update isReadOnlyView based on canEdit and note status
  useEffect(() => {
    if (isNewNote) {
      setIsReadOnlyView(false);
    } else if (note) {
      const readOnly = !canEdit || note.isArchived;
      setIsReadOnlyView(readOnly);
      
      const quill = reactQuillRef.current?.getEditor(); // Use the new ref for Quill instance
      if (quill) {
        if (readOnly) {
          quill.disable();
          console.log("[NoteEditor] Editor disabled due to read-only status (archived or no permission).");
        } else {
          quill.enable();
          console.log("[NoteEditor] Editor enabled.");
        }
      }
    }
  }, [note, canEdit, isNewNote]); // Removed quillEditorRef.current from dependencies

  useEffect(() => {
    noteStateRef.current = note;
  }, [note]);

  useEffect(() => {
    titleStateRef.current = title;
  }, [title]);

  useEffect(() => {
    userMadeChangesStateRef.current = userMadeChangesInThisSession;
  }, [userMadeChangesInThisSession]);

  useEffect(() => {
    userAuthStateRef.current = user;
  }, [user]);

  useEffect(() => {
    socketInstanceRef.current = socket;
  }, [socket]);

  // Fetch note data
  useEffect(() => {
    if (isNewNote) {
      setIsLoading(false);
      setTitle('Untitled Note');
      setContent('');
      initialLoadedTitleRef.current = 'Untitled Note'; // Set initial ref for new note
      initialLoadedContentRef.current = ''; // Set initial ref for new note
      setUserMadeChangesInThisSession(false); // Reset for new note
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      setUserMadeChangesInThisSession(false); // Reset when loading/fetching a new note
      try {
        const response = await api.get(`/notes/${noteId}`);
        setNote(response.data);
        setTitle(response.data.title);
        setContent(response.data.content);
        initialLoadedTitleRef.current = response.data.title; // Store initial title
        initialLoadedContentRef.current = response.data.content; // Store initial content
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
  }, [noteId, router, toast, isNewNote, searchParams]); // Add searchParams to dependency array

  // Socket.IO listeners
  useEffect(() => {
    if (!socket || !user || !note?._id) return;

    console.log(`[NoteEditor] Setting up socket listeners for note ${note._id}`);

    const handleNoteDetailsUpdated = (updatedNote: NoteDetailsUpdatedPayload) => {
      console.log("[NoteEditor] Event: noteDetailsUpdated", updatedNote);
      if (updatedNote._id === note?._id) {
        setNote(prevNote => {
          if (!prevNote) return updatedNote as Note; // Treat as a full Note object

          // Create a new state ensuring all fields of Note are present
          const newNoteState: Note = {
            ...prevNote, // Spread existing note first
            ...updatedNote, // Then spread updates
            // Explicitly ensure complex types match the Note interface
            creator: typeof updatedNote.creator === 'object' ? updatedNote.creator as User : prevNote.creator,
            sharedWith: Array.isArray(updatedNote.sharedWith) ? updatedNote.sharedWith as Note['sharedWith'] : prevNote.sharedWith,
            // Ensure other fields from Note are preserved if not in updatedNote
            folderId: updatedNote.folderId !== undefined ? updatedNote.folderId : prevNote.folderId,
            isArchived: typeof updatedNote.isArchived === 'boolean' ? updatedNote.isArchived : prevNote.isArchived,
            tags: Array.isArray(updatedNote.tags) ? updatedNote.tags : prevNote.tags,
            // Add any other fields from Note that might not be in NoteDetailsUpdatedPayload
          };
          return newNoteState;
        });
        // The useEffect watching `note` and `canEdit` will handle `isReadOnlyView` and Quill state.
      }
    };

    const handleNoteSharingUpdated = (data: NoteSharingUpdatedPayload) => {
      console.log("[NoteEditor] Event: noteSharingUpdated", data);
      if (data.note._id === note._id) {
        setNote(prevNote => {
          if (!prevNote) return data.note as Note; // Or handle as a new note
          return { 
            ...prevNote, 
            sharedWith: data.note.sharedWith, 
            title: data.note.title, // Keep title sync if changed during share update
            isArchived: data.note.isArchived // Keep archive status sync
          };
        });
      }
    };
    
    // This is the correct and complete implementation of handleNoteEditFinishedByOtherUser
    const handleNoteEditFinishedByOtherUser = (data: {
      noteId: string;
      noteTitle: string;
      editorUsername: string;
      editorId: string;
      isArchived?: boolean;
      titleChanged?: boolean;
      contentChanged?: boolean;
      content?: string; // This is the new content from the other user
      updatedAt?: string;
    }) => {
      console.log("[NoteEditor] Event: noteEditFinishedByOtherUser received", data);
      // Ensure the update is for the current note and not by the current user
      if (noteStateRef.current?._id === data.noteId && userAuthStateRef.current?._id !== data.editorId) {
        console.log(`[NoteEditor] Note ${data.noteId} was updated by ${data.editorUsername}. Applying changes.`);

        let newTitle = titleStateRef.current; // Start with current title
        let newContent = content; // Start with current local content state

        if (data.titleChanged) {
          newTitle = data.noteTitle;
          setTitle(data.noteTitle); // Update title state
          initialLoadedTitleRef.current = data.noteTitle; // Sync ref
          console.log("[NoteEditor] Title updated by other user to:", data.noteTitle);
        }

        if (data.contentChanged && typeof data.content === 'string') {
          newContent = data.content;
          const quill = reactQuillRef.current?.getEditor();
          if (quill) {
            const editorContent = quill.root.innerHTML;
            if (editorContent !== data.content) {
              const selection = quill.getSelection(); // Store current selection
              // Replace the entire content. 
              // Using dangerouslyPasteHTML(0, newContent) or setContents with a Delta
              // is generally safer than directly setting innerHTML for Quill.
              // Let's try to construct a delta for full replacement.
              // quill.setContents([{ insert: data.content }], 'silent'); // This might strip formatting if data.content is plain text
              // For HTML content, dangerouslyPasteHTML is often used.
              quill.clipboard.dangerouslyPasteHTML(0, data.content, 'silent');
              
              // Attempt to restore cursor or move to end
              if (selection && selection.index < data.content.length) {
                quill.setSelection(selection.index, selection.length, 'silent');
              } else {
                quill.setSelection(data.content.length, 0, 'silent');
              }
              setContent(data.content); // Update React state for content
              initialLoadedContentRef.current = data.content; // Sync ref
              console.log("[NoteEditor] Content updated by other user.");
            } else {
              console.log("[NoteEditor] Incoming content is same as current editor content. No UI update for content.");
            }
          } else {
            // Fallback if Quill instance is not available (should not happen if editor is active)
            setContent(data.content);
            initialLoadedContentRef.current = data.content;
          }
        }

        // Update the main note state object
        setNote(prevNote => {
          if (!prevNote || prevNote._id !== data.noteId) return prevNote; // Should not happen due to outer check
          return {
            ...prevNote,
            title: newTitle,
            content: newContent, // Ensure this is the updated content
            updatedAt: data.updatedAt || prevNote.updatedAt,
            isArchived: data.isArchived !== undefined ? data.isArchived : prevNote.isArchived,
          };
        });

        setLastSaved(data.updatedAt ? new Date(data.updatedAt) : new Date());
        setSyncStatus('synced');
        setUserMadeChangesInThisSession(false); // Reset local changes flag
        console.log("[NoteEditor] Local state and editor synced with external changes.");
      }
    };

    const handleNotesListGlobalUpdate = (data: NotesListUpdatePayload) => {
      if (note && note._id && data.noteId === note._id) {
        if (data.action === 'archive' && data.updatedNote) {
          setNote(prev => prev ? { ...prev, ...data.updatedNote, isArchived: true } : data.updatedNote as Note);
          // Toast is handled by SocketContext for the current user if they have access
          // The useEffect watching `note` will update isReadOnlyView and disable Quill.
          // If the note is archived, the component will render the archived view.
        } else if (data.action === 'unarchive' && data.updatedNote) {
          setNote(prev => prev ? { ...prev, ...data.updatedNote, isArchived: false } : data.updatedNote as Note);
          // Toast is handled by SocketContext
        } else if (data.action === 'delete') {
          // Toast is handled by SocketContext
          // No need to update local note state as we are redirecting.
          if (router && typeof router.push === 'function') { // Check if router is available
            router.push('/dashboard');
          } else {
            console.warn("[NoteEditor] Router not available to redirect after note deletion.");
          }
        }
      }
    };
    
    // The `handleNoteEditFinishedByOtherUser` function defined earlier (around line 307)
    // is the one that should be used. The duplicate definition that was here has been removed.

    socket.on('noteDetailsUpdated', handleNoteDetailsUpdated);
    socket.on('noteSharingUpdated', handleNoteSharingUpdated);
    socket.on('notesListGlobalUpdate', handleNotesListGlobalUpdate);
    socket.on('noteEditFinishedByOtherUser', handleNoteEditFinishedByOtherUser);


    return () => {
      console.log(`[NoteEditor] Cleaning up socket listeners for note ${note?._id}`);
      socket.off('noteDetailsUpdated', handleNoteDetailsUpdated);
      socket.off('noteSharingUpdated', handleNoteSharingUpdated);
      socket.off('notesListGlobalUpdate', handleNotesListGlobalUpdate);
      socket.off('noteEditFinishedByOtherUser', handleNoteEditFinishedByOtherUser);
    };
  }, [socket, note, user, toast, router, canEdit, permissionErrorToastShown, content]); // Added content to dependency array

  // handleSave
  const handleSave = useCallback(async (currentTitle: string, currentContent: string, showSuccessToast = false) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to save notes.", variant: "destructive" });
      return;
    }
    if (isSaving) return;
    if (isReadOnlyView) { // Check if view is read-only due to permissions or archive status
      if (!permissionErrorToastShown) {
        toast({
            title: "Cannot Save",
            description: note?.isArchived ? "This note is archived and cannot be edited." : "You do not have permission to edit this note.",
            variant: "default", // Changed from "warning" to "default"
        });
        setPermissionErrorToastShown(true); // Show it once per attempt in read-only
      }
      return;
    }
    setPermissionErrorToastShown(false); // Reset if save is attempted and not read-only

    setIsSaving(true); // Set isSaving to true at the beginning of the save operation
    setSyncStatus('syncing');

    const payload = { title: currentTitle.slice(0, MAX_TITLE_LENGTH), content: currentContent }; // Enforce title length
    let savedNoteData: Note | null = null;

    try {
      let response;
      if (isNewNote && !note?._id) { // Creating a new note
        response = await api.post('/notes', payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); // Set the full note object for the new note
        // Update router and toast for new note
        router.replace(`/notes/${savedNoteData._id}`); 
        if (showSuccessToast) { // Only show toast if explicitly requested (e.g., manual save)
            toast({ title: 'Note Created', description: 'Your note has been saved.' });
        }
      } else if (note?._id) { // Updating an existing note
        response = await api.put(`/notes/${note._id}`, payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData); // Update the note state with the full response
        if (showSuccessToast) {
          toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
        }
      } else {
        console.error("handleSave called without a note ID for an existing note or for a new note properly.");
        toast({title: "Save Error", description: "Cannot determine save operation.", variant: "destructive"});
        setSyncStatus('error');
        setIsSaving(false); // Reset isSaving before early return
        return; 
      }

      // Common actions for both new and updated notes if save was successful
      if (savedNoteData) {
        setTitle(savedNoteData.title);
        // setContent(savedNoteData.content); // Content is already up-to-date from user input
        setLastSaved(new Date(savedNoteData.updatedAt));
        setSyncStatus('synced');
        setUserMadeChangesInThisSession(false); // Reset flag after successful save

        // CRITICAL FIX: Update initialLoadedTitleRef and initialLoadedContentRef
        // for BOTH new and existing notes after a successful save.
        // This ensures the baseline for "no changes" detection is the last saved state
        initialLoadedTitleRef.current = savedNoteData.title;
        initialLoadedContentRef.current = savedNoteData.content;
        
        // No need for the specific `if (isNewNote && response.data?._id)` block anymore
        // as the above lines cover both new and existing notes.
      }
    } catch (saveError) {
      console.error('Failed to save note:', saveError);
      setSyncStatus('error');
      const axiosError = saveError as AxiosError<{ message?: string }>; 
      toast({
        title: 'Error saving note',
        description: axiosError?.response?.data?.message || 'Could not save your changes.',
        variant: 'destructive',
      });
    } finally { 
        setIsSaving(false); // Ensure isSaving is reset in all cases
    }
  }, [user, isSaving, isReadOnlyView, toast, isNewNote, note?._id, router, note?.isArchived, permissionErrorToastShown, setPermissionErrorToastShown]); // Added missing dependencies

  // Debounced save
  useEffect(() => {
    if (isLoading || isNewNote || isReadOnlyView || isSaving || !userMadeChangesInThisSession) { // also check isReadOnlyView
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (isLoading || isReadOnlyView || isSaving) {
        return;
      }

      // Compare with the initial loaded state stored in refs
      const titleChanged = title !== (initialLoadedTitleRef.current ?? (isNewNote ? 'Untitled Note' : ''));
      const contentChanged = content !== (initialLoadedContentRef.current ?? '');
      
      if (isNewNote && !note?._id) {
        // For new notes, save if title is not default "Untitled Note" OR content is not effectively empty
        const isDefaultNewTitle = title === 'Untitled Note';
        // Check against common Quill empty states for content
        const isContentEffectivelyEmpty = content.trim() === '' || content.trim() === '<p><br></p>' || content.trim() === '<p></p>';
        
        if (!isDefaultNewTitle || !isContentEffectivelyEmpty) {
          handleSave(title, content, false); 
        }
      } else if (note?._id) { // Existing note
        if (titleChanged || contentChanged) {
          handleSave(title, content, false); 
        }
      }
    }, 1500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [title, content, note, handleSave, isLoading, isNewNote, isReadOnlyView, isSaving, userMadeChangesInThisSession]); // Added isReadOnlyView

  // handleManualSave
  const handleManualSave = () => {
    if (!isReadOnlyView && !isSaving) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      handleSave(title, content, true); // showSuccessToast = true for manual save
    }
  };
  
  // handleDelete
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
    }
    setIsDeleteDialogOpen(false); // Close dialog after action
  };
  
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

  const handleCopyTitle = () => {
    if (!title) {
      toast({ title: "Nothing to Copy", description: "Note title is empty.", variant: "default" });
      return;
    }
    navigator.clipboard.writeText(title)
      .then(() => {
        toast({ title: "Title Copied", description: "Note title copied to clipboard as plain text." });
      })
      .catch(err => {
        console.error("Failed to copy note title: ", err);
        toast({ title: "Copy Failed", description: "Could not copy note title.", variant: "destructive" });
      });
  };

  const handleCopyContent = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      toast({ title: 'Error', description: 'Clipboard API not available in this browser.', variant: 'destructive' });
      console.error('[NoteEditor] Clipboard API not available.');
      return;
    }

    const editorContent = content || '';
    const isEmptyContent = editorContent.trim() === '' || editorContent.trim() === '<p><br></p>' || editorContent.trim() === '<p></p>';

    if (isEmptyContent) {
      toast({ title: 'Nothing to Copy', description: 'The editor content is empty.', variant: 'default' });
      return;
    }

    try {
      if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const htmlBlob = new Blob([editorContent], { type: 'text/html' });
        const clipboardItem = new ClipboardItem({ 'text/html': htmlBlob });
        await navigator.clipboard.write([clipboardItem]);
        toast({ title: 'Content Copied', description: 'Note content (with formatting) copied to clipboard.' });
      } else {
        throw new Error('ClipboardItem API or navigator.clipboard.write is not supported.');
      }
    } catch (error) {
      console.warn('[NoteEditor] Failed to copy rich text content, attempting plain text fallback:', error);
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = editorContent;
        let plainText = (tempDiv.textContent || tempDiv.innerText || "").trim();

        if (!plainText && !isEmptyContent) {
            plainText = "[Unsupported content for plain text copy (e.g., image/video)]";
            toast({ title: 'Content Copied (Partial)', description: 'Copied as plain text. Some content may not be supported.', variant: 'default' });
        } else if (plainText) {
            await navigator.clipboard.writeText(plainText);
            toast({ title: 'Content Copied (Plain Text)', description: 'Note content copied as plain text.', variant: 'default' });
        } else {
          toast({ title: 'Nothing to Copy', description: 'Content is empty or could not be converted to plain text.', variant: 'default' });
          return;
        }
      } catch (plainTextError) {
        console.error('[NoteEditor] Failed to copy plain text content as fallback:', plainTextError);
        toast({ title: 'Copy Failed', description: 'Could not copy note content as plain text.', variant: 'destructive' });
      }
    }
  };

  const handleExportMarkdown = () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const editorContent = content || '';
    const isEmptyContent = editorContent.trim() === '' || editorContent.trim() === '<p><br></p>' || editorContent.trim() === '<p></p>';

    if (isEmptyContent && !title) { // Check if both title and content are effectively empty
      toast({ title: 'Nothing to Export', description: 'Note title and content are empty.', variant: "default" });
      return;
    }

    const noteTitle = title || 'Untitled Note';
    const markdownTitle = `# ${noteTitle}\n\n`; // Add title as H1 heading
    const markdownBody = turndownService.turndown(editorContent);
    const fullMarkdownContent = markdownTitle + markdownBody;

    const blob = new Blob([fullMarkdownContent], { type: 'text/markdown;charset=utf-8' });
    const filename = `${noteTitle}.md`;
    saveAs(blob, filename);
    toast({ title: "Exported as Markdown", description: `Note downloaded as ${filename}` });
  };

  const handleExportPDF = async () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const editorContent = content || '';
    const isEmptyContent = editorContent.trim() === '' || editorContent.trim() === '<p><br></p>' || editorContent.trim() === '<p></p>';

    if (isEmptyContent && !title) { // Check if both title and content are effectively empty
        toast({ title: "Nothing to Export", description: "Note title and content are empty.", variant: "default" });
        return;
    }

    const actualEditorContentElement = reactQuillRef.current?.getEditor()?.root as HTMLElement | null; 
    if (!actualEditorContentElement) {
      toast({ title: "Export Error", description: "Editor content area not found for PDF export.", variant: "destructive" });
      console.error("[NoteEditor] .ql-editor element not found, cannot export PDF.");
      return;
    }

    toast({ title: "Generating PDF...", description: "Please wait while the PDF is being prepared.", variant: "default" });

    // Create a temporary container for title + content
    const exportableRootElement = document.createElement('div'); // Renamed to avoid conflict
    exportableRootElement.style.padding = '20px'; 
    exportableRootElement.style.width = actualEditorContentElement.clientWidth + 'px'; 

    const pdfTitleElement = document.createElement('h1'); // Renamed to avoid conflict
    pdfTitleElement.textContent = title || 'Untitled Note';
    pdfTitleElement.style.marginBottom = '20px'; 
    pdfTitleElement.style.fontSize = '24pt'; 
    pdfTitleElement.style.fontWeight = 'bold';
    exportableRootElement.appendChild(pdfTitleElement);

    // Clone the editor content to avoid modifying the live editor
    const contentClone = actualEditorContentElement.cloneNode(true) as HTMLElement;
    contentClone.style.width = '100%'; 
    exportableRootElement.appendChild(contentClone);

    // Temporarily append to body to ensure styles are applied, then remove
    document.body.appendChild(exportableRootElement);

    try {
      const canvas = await html2canvas(exportableRootElement, { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        width: exportableRootElement.offsetWidth, 
        height: exportableRootElement.offsetHeight, 
        windowWidth: exportableRootElement.scrollWidth,
        windowHeight: exportableRootElement.scrollHeight,
      });

      document.body.removeChild(exportableRootElement); // Clean up the temporary element

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;

      const newImgWidthConst = pdfWidth - 20;
      const newImgHeightConst = newImgWidthConst / ratio; 

      let currentPosition = 10;

      if (newImgHeightConst <= pdfHeight - 20) {
        pdf.addImage(imgData, 'PNG', 10, currentPosition, newImgWidthConst, newImgHeightConst);
      } else {
        let remainingImgHeight = imgHeight;
        let sourceY = 0;

        while (remainingImgHeight > 0) {
          const pdfPageContentHeight = pdfHeight - 20;
          const sourceSliceHeight = Math.floor((pdfPageContentHeight / newImgHeightConst) * imgHeight);
          const actualSliceHeight = Math.min(sourceSliceHeight, remainingImgHeight);

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = imgWidth;
          pageCanvas.height = actualSliceHeight;
          const pageCtx = pageCanvas.getContext('2d');

          if (pageCtx) {
            pageCtx.drawImage(canvas, 0, sourceY, imgWidth, actualSliceHeight, 0, 0, imgWidth, actualSliceHeight);
            const pageImgData = pageCanvas.toDataURL('image/png');
            const renderedSliceHeight = (newImgWidthConst / (imgWidth / actualSliceHeight));
            pdf.addImage(pageImgData, 'PNG', 10, currentPosition, newImgWidthConst, renderedSliceHeight);
            remainingImgHeight -= actualSliceHeight;
            sourceY += actualSliceHeight;
            if (remainingImgHeight > 0) {
              pdf.addPage();
              currentPosition = 10;
            }
          } else {
            console.error("Could not get 2D context for page canvas during PDF export.");
            toast({ title: "PDF Export Error", description: "Failed to process image for PDF pages.", variant: "destructive" });
            return;
          }
        }
      }
      
      const filename = `${title || 'Untitled Note'}.pdf`;
      pdf.save(filename);
      toast({ title: "Exported as PDF", description: `Note downloaded as ${filename}` });

    } catch (error) {
      console.error("Failed to export PDF:", error);
      // Ensure cleanup even on error if the element was added
      if (exportableRootElement.parentNode === document.body) {
        document.body.removeChild(exportableRootElement);
      }
      toast({ title: "PDF Export Failed", description: "Could not generate PDF. See console for details.", variant: "destructive" });
    }
  };

  const handleExportWord = async () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
     if (!content && !title) {
        toast({ title: "Nothing to Export", description: "Note title and content are empty.", variant: "default" });
        return;
    }

    toast({ title: "Generating Word Document...", description: "Please wait while the .docx is being prepared.", variant: "default" });

    try {
      const noteTitle = title || 'Untitled Note';
      const htmlContentToExport = content || '<p></p>'; 
      const fullHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${noteTitle}</title>
          <style>
            body { font-family: sans-serif; font-size: 11pt; margin: 20px; }
            h1.doc-title { font-size: 24pt; font-weight: bold; margin-bottom: 20px; }
            h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
            p { margin-bottom: 10px; line-height: 1.5; }
            strong { font-weight: bold; }
            em { font-style: italic; }
            u { text-decoration: underline; }
            s { text-decoration: line-through; }
            blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
            ul, ol { margin-left: 20px; padding-left: 20px; }
            li { margin-bottom: 5px; }
            a { color: blue; text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1 class="doc-title">${noteTitle}</h1>
          ${htmlContentToExport}
        </body>
        </html>
      `;

      const converted = htmlDocx.asBlob(fullHtml);
      const filename = `${title || 'Untitled Note'}.docx`;
      saveAs(converted, filename);
      toast({ title: "Exported as Word", description: `Note downloaded as ${filename}` });
    } catch (error) {
      console.error("Failed to export Word document:", error);
      toast({ title: "Word Export Failed", description: "Could not generate .docx file. See console for details.", variant: "destructive" });
    }
  };

  // Helper function to get collaborator display text
  const getCollaboratorTriggerText = () => {
    if (!note || !note.sharedWith || note.sharedWith.length === 0) {
      return "No Collaborators"; // Fallback text
    }
    const collaboratorUserObjects = note.sharedWith
      .map(s => (typeof s.userId === 'object' ? s.userId : null))
      .filter(Boolean) as User[];
    if (collaboratorUserObjects.length === 0) {
      return `${note.sharedWith.length} Collaborator${note.sharedWith.length > 1 ? 's' : ''}`;
    }
    if (collaboratorUserObjects.length === 1) {
      return `Shared with ${collaboratorUserObjects[0].username}`;
    }
    if (collaboratorUserObjects.length === 2) {
      return `Shared with ${collaboratorUserObjects[0].username} and ${collaboratorUserObjects[1].username}`;
    }
    return `Shared with ${collaboratorUserObjects[0].username}, ${collaboratorUserObjects[1].username} & ${collaboratorUserObjects.length - 2} more`;
  };

  const handleContentChange = (newContent: string, delta: DeltaStatic, source: Sources, editor: UnprivilegedEditor) => {
    if (source === 'user') {
      if (isReadOnlyView) { 
        const quill = reactQuillRef.current?.getEditor();
        if (quill && note) {
            // Revert to the current content state if an attempt is made to edit in read-only
            // This uses the 'content' state which should be the last valid state.
            quill.setContents(editor.getContents()); 
        }
        toast({
          title: "Read-only",
          description: "This note is currently read-only.",
          variant: "default" // Changed from "warning"
        });
        return;
      }
      setContent(newContent);
      setUserMadeChangesInThisSession(true); // Mark that user has typed
      // No direct socket.emit('noteContentChange') here. Debounced save will handle it.
    } else if (source === 'api' || source === 'silent') {
        // If change comes from API (e.g. initial load, or external update handled by 'noteEditFinishedByOtherUser')
        // and Quill is available, update its content.
        // This path is less common now as 'noteEditFinishedByOtherUser' directly sets content.
        const quill = reactQuillRef.current?.getEditor();
        if (quill) {
            // It's important that setContent here doesn't trigger a 'user' source loop.
            // ReactQuill's onChange usually only fires on 'user' source by default.
        }
    }
  };
  
  // Effect for emitting "userFinishedEditingNote" on unmount or navigation
  useEffect(() => {
    return () => {
      const currentSocket = socketInstanceRef.current; // Corrected ref name
      const currentNote = noteStateRef.current; // Corrected ref name
      const currentTitle = titleStateRef.current; // Corrected ref name
      const currentUserMadeChanges = userMadeChangesStateRef.current; // Corrected ref name
      const currentUser = userAuthStateRef.current; // Corrected ref name

      if (currentSocket && currentSocket.connected && currentUserMadeChanges && currentNote && currentUser && currentNote._id && currentUser.username && currentUser._id) {
        console.log('[NoteEditor] Cleanup: User finished editing. Emitting userFinishedEditingNote.');
        currentSocket.emit('userFinishedEditingNote', {
          noteId: currentNote._id,
          noteTitle: currentTitle, 
          editorUsername: currentUser.username,
          editorId: currentUser._id,
          isArchived: currentNote.isArchived, 
        });
      }
    };
  }, [noteId, user]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen"><Progress value={50} className="w-1/2" /></div>;
  }

  if (!note && !isNewNote) {
    return <div className="text-center py-10">Note not found or access denied.</div>;
  }
  
  // Add this check after loading and note fetching
  if (note && note.isArchived && !isNewNote) {
    // User is viewing an archived note
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card className="border-dashed border-yellow-500 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-700">Note Archived</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Corrected JSX quotes */}
            <p className="text-yellow-600">This note, &quot;{note.title}&quot;, is archived. It is currently in read-only mode.</p>
            <p className="text-yellow-600 mt-2">You can unarchive it from the main notes list if you have permission.</p>
          </CardContent>
           <CardFooter>
            <Button onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Default return for the component if not loading, not an unfound note, and not an archived note view
  return (
    <div className={`container mx-auto p-4 max-w-4xl ${isReadOnlyView ? 'opacity-75' : ''}`}>
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        note={note}
        onNoteShared={handleNoteShared} 
      />
      <div className="sticky top-0 z-20 bg-card p-3 mb-3 border-b rounded-lg shadow">
        <div className="flex items-center mb-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} title="Back to Dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {/* Title Input - Placed beside back button for better alignment */}
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH));
              setUserMadeChangesInThisSession(true); // Mark changes for title
            }}
            placeholder="Untitled Note"
            className="text-xl md:text-2xl font-semibold bg-transparent border-none focus:ring-0 focus:outline-none flex-grow mx-2"
            disabled={isReadOnlyView || !canEdit}
            maxLength={MAX_TITLE_LENGTH}
          />
          {title.length >= MAX_TITLE_LENGTH && (
            <span className="text-xs text-destructive whitespace-nowrap">Max length</span>
          )}
          {/* Action Buttons - Grouped to the right */}
          <div className="flex items-center gap-2 ml-auto">
            {!isNewNote && canEdit && (
              <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(true)} disabled={isSaving || isLoading} title="Share Note">
                <Users className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Share</span>
              </Button>
            )}
            {!isNewNote && canEdit && (
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isSaving || isLoading} title="Delete Note">
                    <Trash2 className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Delete</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the note.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button onClick={handleManualSave} disabled={isSaving || isReadOnlyView || isLoading} size="sm" title="Save Note">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin md:mr-2" /> : <Save className="h-4 w-4 md:mr-2" />}
              <span className="hidden md:inline">Save</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="Copy Options" disabled={isLoading}>
                  <Copy className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyTitle} disabled={!title}>Copy Title</DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyContent} disabled={!content || content.trim() === '' || content.trim() === '<p><br></p>'}>Copy Content</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title="Export Note" disabled={isLoading || (!note && isNewNote && (!title && !content))}>
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportMarkdown} disabled={(!title && !content)}>Export as Markdown (.md)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} disabled={(!title && !content)}>Export as PDF (.pdf)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportWord} disabled={(!title && !content)}>Export as Word (.docx)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {syncStatus === 'syncing' && <span className="flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Syncing...</span>}
            {syncStatus === 'synced' && lastSaved && !isSaving && <span className="flex items-center gap-1"><CheckCircle2 size={14} className="text-green-500" /> Last saved: {new Date(lastSaved).toLocaleTimeString()}</span>}
            {syncStatus === 'error' && <span className="flex items-center gap-1"><AlertTriangle size={14} className="text-red-500" /> Error saving.</span>}
            {isReadOnlyView && <span className="flex items-center gap-1"><Eye size={14} /> Read-only</span>}
          </div>
          <div className="flex items-center gap-2">
            {note && note.sharedWith && note.sharedWith.length > 0 && !isLoading && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-sm flex items-center gap-1 px-2 py-1 h-auto" title="View Collaborators">
                    <Users size={16} />
                    <span className="hidden sm:inline">{getCollaboratorTriggerText()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-2 py-1.5 text-sm font-semibold">Collaborators</div>
                  <DropdownMenuSeparator />
                  {note.sharedWith.map((share) => {
                    const userObject = typeof share.userId === 'object' ? share.userId : null;
                    const username = userObject ? userObject.username : (share.email ? share.email.split('@')[0] : 'User'); // Fallback for username
                    const email = userObject ? userObject.email : share.email;
                    const key = userObject ? userObject._id : (typeof share.userId === 'string' ? share.userId : share.email); // Ensure key is string
                    return (
                      <DropdownMenuItem key={key} className="flex flex-col items-start cursor-default">
                        <span className="font-medium">{username}</span>
                        <span className="text-xs text-muted-foreground">{email || 'No email'} - {share.role}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Editor Section - Takes remaining height */}
      <div 
        ref={quillContainerRef} // This ref is for the container div
        className="flex-grow flex flex-col prose dark:prose-invert max-w-none rounded-md border border-input bg-transparent overflow-hidden"
      >
        {ReactQuillDynamic && ( // Use the dynamic import variable
          <ReactQuillDynamic // Use the dynamic import variable
            ref={reactQuillRef} // Assign the new ref for ReactQuill instance
            value={content}
            onChange={handleContentChange}
            readOnly={isReadOnlyView || (note?.isArchived ?? false)} // Set ReactQuill to readOnly, ensure note.isArchived is boolean
            modules={modules}
            formats={quillFormats}
            placeholder={isLoading ? "Loading note..." : (isReadOnlyView ? "This note is read-only." : "Start writing your note...")}
            className="flex-grow min-h-0 h-full bg-transparent text-foreground [&>.ql-container]:border-none [&>.ql-toolbar]:border-none [&>.ql-toolbar]:rounded-t-md [&>.ql-container]:flex-grow [&>.ql-container>.ql-editor]:p-4 md:[&>.ql-container>.ql-editor]:p-6 [&>.ql-container]:overflow-y-auto"
            style={{ height: '60vh' }} // Added fixed height of 60vh
          />
        )}
      </div>
    </div>
  );
};

export default NoteEditor;

<style jsx global>{`
  /* Ensure the container and editor itself can grow */
  .prose .ql-container.ql-snow {
    display: flex; /* Ensure ql-container can be a flex item if parent is flex */
    flex-direction: column; /* Stack toolbar and editor vertically */
    /* flex-grow: 1; */ /* Disabled to allow fixed height to take precedence */
    /* min-height: 0; */ /* Disabled for fixed height */
    overflow: hidden; /* Let ql-editor handle its own scroll */
    height: 100%; /* Make container fill the ReactQuillDynamic component's fixed height */
  }
  .prose .ql-editor {
    flex-grow: 1; /* Editor itself should grow to fill the container */
    overflow-y: auto; /* Allow editor content to scroll */
    /* height: 100%; */ /* Let flex-grow manage this based on container */
    padding: 12px 15px; 
  }
  
  /* Original styles for toolbar and container (borders, radius) - can be kept or adjusted */
  .editor-container .ql-toolbar.ql-snow { /* This class seems unused in the current JSX, consider removing or applying to ReactQuillDynamic's toolbar */
    border-top-left-radius: 0.375rem; 
    border-top-right-radius: 0.375rem; 
    border-bottom: none;
  }
  .editor-container .ql-container.ql-snow { /* This class seems unused, ql-container is targeted directly above */
    border-bottom-left-radius: 0.375rem; 
    border-bottom-right-radius: 0.375rem; 
    /* min-height: 400px; */ /* Replaced by flex-grow logic */
    /* height: 100%; */
    /* display: flex; */
    /* flex-direction: column; */
  }

  .read-only-quill .ql-toolbar {
    display: none;
  }
  .read-only-quill .ql-container {
    border-top: 1px solid #ccc !important; 
  }
`}</style>
