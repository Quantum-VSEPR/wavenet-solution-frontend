'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { debounce } from 'lodash'; // Added import for debounce
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TurndownService from 'turndown';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DOMPurify from 'dompurify';
// import { asBlob } from 'html-docx-js'; // If using it as a module
import htmlDocx from 'html-docx-js/dist/html-docx'; // Correct import based on .d.ts
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
  const isNewNote = noteId === 'new'; // Define isNewNote
  const router = useRouter();
  const { user } = useAuth();
  const socketContext = useSocket(); 
  const socket = socketContext.socketInstance;
  const { toast } = useToast();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentOnLoadOrFocus, setContentOnLoadOrFocus] = useState<string>('');
  const [titleOnLoadOrFocus, setTitleOnLoadOrFocus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userMadeChangesInThisSession, setUserMadeChangesInThisSession] = useState(false);
  const turndownService = useMemo(() => new TurndownService(), []);

  const quillEditorRef = useRef<HTMLDivElement>(null);

  // Ref to hold the latest state for the unmount cleanup function
  const localStateRef = useRef({
    title,
    content,
    userMadeChangesInThisSession,
    contentOnLoadOrFocus,
    titleOnLoadOrFocus,
    note,
    user,
    isNewNote // Include isNewNote if it affects unmount logic
  });

  // Effect to keep localStateRef updated
  useEffect(() => {
    localStateRef.current = {
      title,
      content,
      userMadeChangesInThisSession,
      contentOnLoadOrFocus,
      titleOnLoadOrFocus,
      note,
      user,
      isNewNote
    };
  }, [title, content, userMadeChangesInThisSession, contentOnLoadOrFocus, titleOnLoadOrFocus, note, user, isNewNote]);

  // Define Quill modules
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'font': QUILL_FONT_WHITELIST }, { 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
      [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'align': [] }],
      [{ 'color': [] }, { 'background': [] }],
      ['link', 'image', 'video', 'formula'],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'list': 'check' }],
      ['clean']
    ],
    //clipboard: {
    //  matchVisual: false, // Important to prevent Quill from trying to match styles too closely from pasted content
    //},
  }), []);


  // Dynamically import ReactQuill and register custom fonts
  const ReactQuill = useMemo(() => dynamic(() =>
    import('react-quill').then((reactQuillModule) => {
      if (reactQuillModule.Quill) {
        const QuillInstance = reactQuillModule.Quill;
        const Font = QuillInstance.import('formats/font');
        Font.whitelist = QUILL_FONT_WHITELIST;
        QuillInstance.register(Font, true);
        console.log('[NoteEditor] Custom fonts registered with Quill.');
      } else {
        // Fallback or error if Quill is not found on the module
        // This might happen if react-quill changes its export structure
        // or if 'quill' itself needs to be imported directly and registered.
        console.error('[NoteEditor] Could not obtain Quill instance from react-quill module to register fonts.');
      }
      return reactQuillModule; // Return the original 'react-quill' module
    }), { ssr: false }
  ), []);

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
    // Only the creator can share the note initially or manage top-level sharing settings
    return typeof note.creator === 'string' ? note.creator === user._id : note.creator._id === user._id;
  }, [note, user, isNewNote]);

  const canDelete = useMemo(() => {
    if (isNewNote || !note || !user) return false;
    // Only the creator can delete the note
    return typeof note.creator === 'string' ? note.creator === user._id : note.creator._id === user._id;
  }, [note, user, isNewNote]);

  // Fetch note data
  useEffect(() => {
    if (isNewNote) {
      setIsLoading(false);
      setTitle('Untitled Note');
      setContent('');
      setContentOnLoadOrFocus(''); // Initialize for new note
      setTitleOnLoadOrFocus('Untitled Note'); // Initialize for new note
      setUserMadeChangesInThisSession(false); 
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      setUserMadeChangesInThisSession(false); 
      try {
        const response = await api.get(`/notes/${noteId}`);
        setNote(response.data);
        setTitle(response.data.title);
        setContent(response.data.content);
        setContentOnLoadOrFocus(response.data.content); // Initialize with fetched content
        setTitleOnLoadOrFocus(response.data.title); // Initialize with fetched title
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
  }, [noteId, router, toast, isNewNote]); // Removed state setters, added setUserMadeChangesInThisSession to ensure effect re-runs if it were a dep (though setters are stable)

  // Socket.IO listeners
  useEffect(() => {
    // Ensure socket instance exists, is connected, and note details are available
    if (!socketContext.socketInstance || !socketContext.socketInstance.connected || !note?._id || !user) {
      if (note?._id && user) { // Only log warning if we expected to join but couldn't
          console.warn('[NoteEditor] Socket not connected or available when trying to set up listeners or join room. Socket:', socketContext.socketInstance);
      }
      return;
    }

    const currentNoteId = note._id;

    // Join room
    console.log(`[NoteEditor] Attempting to join note room ${currentNoteId} with socket ID: ${socketContext.socketInstance.id}`);
    socketContext.socketInstance.emit('joinNoteRoom', currentNoteId);
    console.log(`[NoteEditor] 'joinNoteRoom' event emitted for ${currentNoteId}`);

    // Handles content/title updates from other collaborators via 'noteUpdated' event from the server
    // This event should be emitted by the backend when a note's content or title is successfully saved.
    const handleRemoteNoteContentUpdated = (updatedNoteData: Note) => {
      // Ensure the update is for the current note and not an echo of the current user's own changes.
      // The backend should ideally not send 'noteUpdated' back to the originating socket that triggered the save.
      // If it does, we need a way to identify and ignore it (e.g., by checking updatedBy if available).
      if (updatedNoteData._id === currentNoteId) {
        // Check if the incoming data is different from the current state
        // and if the timestamp indicates it's a newer update.
        if ( (updatedNoteData.content !== content || updatedNoteData.title !== title) && 
             new Date(updatedNoteData.updatedAt).getTime() > (lastSaved?.getTime() || 0) ) {
          
          console.log('[NoteEditor] Received remote noteUpdated (content/title):', updatedNoteData);
          setNote(updatedNoteData);
          setTitle(updatedNoteData.title);
          setContent(updatedNoteData.content);
          setLastSaved(new Date(updatedNoteData.updatedAt));
          setSyncStatus('synced');
          // Avoid toast if change was likely from this user, or make it more subtle
          // For now, keeping the toast for any external update.
          toast({ title: 'Note Updated Externally', description: 'Content was updated by another collaborator.' });
        }
      }
    };

    // Handles updates to the note's sharing details (e.g., roles, new collaborators)
    const handleNoteSharingUpdated = (updatedSharedNote: Note) => {
      if (updatedSharedNote._id === currentNoteId && user) {
        console.log('[NoteEditor] Received noteSharingUpdated:', updatedSharedNote);
        
        const oldCanEdit = canEdit; 
        setNote(updatedSharedNote); 
        
        const newIsCreator = typeof updatedSharedNote.creator === 'string' ? updatedSharedNote.creator === user._id : updatedSharedNote.creator._id === user._id;
        const newShareInfo = updatedSharedNote.sharedWith.find(s => 
          (typeof s.userId === 'string' ? s.userId === user._id : (s.userId as User)?._id === user._id)
        );
        const newCanEdit = newIsCreator || (newShareInfo?.role === 'write');

        if (!oldCanEdit && newCanEdit) {
          toast({ title: 'Permissions Updated', description: 'You now have edit access to this note.' });
        } else if (oldCanEdit && !newCanEdit) {
          toast({ title: 'Permissions Updated', description: 'Your access to this note is now read-only.' });
        }
      }
    };

    // Handles the scenario where the current user is unshared from this specific note
    const handleNoteUnshared = (unshareData: { noteId: string; title: string; unsharerId?: string }) => {
      if (unshareData.noteId === currentNoteId && user) {
        console.log('[NoteEditor] Received noteUnshared for current note:', unshareData);
        
        setNote(prevNote => { // Added setNote to handle the state update properly
          if (!prevNote) return null;

          // Check if the current user is the one being unshared.
          // This event might be broad, so we need to confirm.
          // The backend should ideally send a more targeted event or include who was unshared.
          // For now, assume if this event comes, and the note is the current one,
          // the current user's access *might* have changed. Re-fetch or update note state.
          
          // Optimistically remove self from sharedWith if this event implies current user was removed
          // This is a simplification; a full note re-fetch might be safer if backend logic is complex.
          const userWasUnshared = !prevNote.sharedWith.some(s => (typeof s.userId === 'string' ? s.userId === user._id : (s.userId as User)?._id === user._id));
          
          if (userWasUnshared) { // If user is no longer in sharedWith (or was never there)
             toast({
              title: 'Access Changed',
              description: `You have been unshared from the note "${unshareData.title}".`,
              variant: 'default', // Changed from 'warning'
            });
            // Potentially redirect or disable editing if access is lost.
            // The `canEdit` and `isReadOnlyView` memos should update based on `note` state.
            // If the note object itself is updated from a `noteSharingUpdated` event, that's better.
            // This `noteUnshared` handler is more of a fallback or specific notification.
          }
          // For now, just update the note state if it's available from the event, or re-fetch.
          // The current `noteUnshared` event from backend doesn't provide the full updated note.
          // So, we might need to trigger a re-fetch or rely on `noteSharingUpdated` for full state.
          return prevNote; // Or trigger a refetch: fetchNote();
        });
      }
    };

    socket.on('noteUpdated', handleRemoteNoteContentUpdated);
    socket.on('noteSharingUpdated', handleNoteSharingUpdated);
    socket.on('noteUnshared', handleNoteUnshared);

    return () => {
      if (socketContext.socketInstance && socketContext.socketInstance.connected && currentNoteId) {
        console.log(`[NoteEditor] Attempting to leave note room ${currentNoteId} with socket ID: ${socketContext.socketInstance.id}`);
        socketContext.socketInstance.emit('leaveNoteRoom', currentNoteId);
        console.log(`[NoteEditor] 'leaveNoteRoom' event emitted for ${currentNoteId}`);
      }
      socketContext.socketInstance.off('noteUpdated', handleRemoteNoteContentUpdated);
      socketContext.socketInstance.off('noteSharingUpdated', handleNoteSharingUpdated);
      socketContext.socketInstance.off('noteUnshared', handleNoteUnshared);
    };
  }, [socketContext, note?._id, user, toast, title, content, lastSaved, canEdit, setNote, setTitle, setContent, setLastSaved, setSyncStatus]); // Added missing dependencies

  // handleSave
  const handleSave = useCallback(async (currentTitle: string, currentContent: string, showSuccessToast = false, isAuto = false) => {
    if (!user || isSaving) { // Prevent concurrent saves or saves when no user
      return;
    }

    if (isReadOnlyView) {
      if (showSuccessToast) { // Only show read-only toast on manual save attempt
        toast({
          title: "Read-only Access",
          description: "You do not have permission to edit this note.",
          variant: "destructive",
        });
      }
      return;
    }
    setIsSaving(true);
    setSyncStatus('syncing');

    const payload = { title: currentTitle.slice(0, MAX_TITLE_LENGTH), content: currentContent, isAutoSave: isAuto }; // Added isAutoSave

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
        if (showSuccessToast) {
          toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
        }
      } else {
        // This case should ideally not be reached if logic is correct
        console.error("handleSave called without a note ID for an existing note or for a new note properly.");
        toast({title: "Save Error", description: "Cannot determine save operation.", variant: "destructive"});
        setSyncStatus('error');
        return; // Return early as setIsSaving(false) in finally will cover this path.
      }

      // Common actions for both new and updated notes if save was successful
      if (savedNoteData) {
        setTitle(savedNoteData.title);
        setLastSaved(new Date(savedNoteData.updatedAt));
        setSyncStatus('synced');
        // No client-side socket.emit('noteChange') needed here.
        // The backend API call (api.put or api.post) will save the note,
        // and the noteController on the backend is responsible for emitting 'noteUpdated' 
        // to the note room (currentNoteId) via io.to(noteId).emit("noteUpdated", populatedNote);
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
  }, [user, isSaving, isReadOnlyView, toast, isNewNote, note?._id, router]);

  // Debounced save function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(async (currentTitle: string, currentContent: string) => { 
      // Autosave should not trigger the "significant change" notification for collaborators by itself.
      // The API's isAutoSave flag handles this.
      // Autosave also should not directly call emitUserFinishedEditingWithContent.
      await handleSave(currentTitle, currentContent, false, true); 
    }, 1500), 
    [handleSave] 
  );

  const handleQuillChange = useCallback((newContent: string, _delta: DeltaStatic, source: Sources /* _editor: ReactQuill.UnprivilegedEditor */) => {
    if (source === 'user') { // Ensure note is loaded - removed && note check, as new notes need this
      const cleanContent = DOMPurify.sanitize(newContent); 
      setContent(cleanContent);
      setUserMadeChangesInThisSession(true); // Mark that user has made changes
      // Autosave will be triggered
      debouncedSave(title, cleanContent); 
    }
  }, [title, debouncedSave, setUserMadeChangesInThisSession]); // Removed note from deps

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = event.target.value;
    setTitle(newTitle.slice(0, MAX_TITLE_LENGTH)); 
    setUserMadeChangesInThisSession(true); // Mark that user has made changes
    // Autosave will be triggered
    debouncedSave(newTitle.slice(0, MAX_TITLE_LENGTH), content); 
  };

  // New handler for when the editor loses focus (or user signals "finished")
  const handleEditorBlur = useCallback(() => {
    if (!userMadeChangesInThisSession) {
        console.log('[NoteEditor] handleEditorBlur: No changes made in this session, skipping emit.');
        return;
    }

    if (note?._id && user && socketContext.emitUserFinishedEditingWithContent) {
      const currentContentTrimmed = content.trim();
      // Compare with the state when the editor was last focused or loaded
      const contentSnapshotTrimmed = contentOnLoadOrFocus.trim();
      const titleSnapshot = titleOnLoadOrFocus;

      console.log('[NoteEditor] handleEditorBlur triggered.');
      console.log(`[NoteEditor]   Current Title: "${title}" vs Snapshot: "${titleSnapshot}"`);
      console.log(`[NoteEditor]   Current Content (trimmed): "${currentContentTrimmed.substring(0,50)}..."`);
      console.log(`[NoteEditor]   Content on Load/Focus (trimmed): "${contentSnapshotTrimmed.substring(0,50)}..."`);
      
      if (currentContentTrimmed !== contentSnapshotTrimmed || title !== titleSnapshot) {
        console.log('[NoteEditor] Significant change detected on blur. Emitting userFinishedEditingNoteWithContent.');
        socketContext.emitUserFinishedEditingWithContent(note._id, title, content);
        // Update the baseline for the next "finished" comparison
        setContentOnLoadOrFocus(content); 
        setTitleOnLoadOrFocus(title);
        setUserMadeChangesInThisSession(false); // Reset after emitting changes
      } else {
        console.log('[NoteEditor] No significant change detected on blur compared to last focus/load state.');
      }
    }
  }, [note, user, title, content, contentOnLoadOrFocus, titleOnLoadOrFocus, socketContext, userMadeChangesInThisSession, setUserMadeChangesInThisSession, setContentOnLoadOrFocus, setTitleOnLoadOrFocus]);

  // Handler for when the Quill editor specifically gains focus
  const handleEditorFocus = useCallback(() => {
     // When editor gains focus, set the snapshot of content and title
     // to the current state. This establishes the baseline for diffing on the *next* blur.
     setContentOnLoadOrFocus(content);
     setTitleOnLoadOrFocus(title);
     setUserMadeChangesInThisSession(false); // Reset changes flag on new focus, as we're starting a new "editing session"
     console.log('[NoteEditor] Editor focused. Snapshot for diff set to current content and title. Changes flag reset.');
  }, [content, title, setContentOnLoadOrFocus, setTitleOnLoadOrFocus, setUserMadeChangesInThisSession]);


  // MOVED HANDLER FUNCTIONS START HERE
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

  const confirmDelete = async () => {
    if (!note || !note._id || isNewNote) return;
    try {
      await api.delete(`/notes/${note._id}`);
      toast({ title: 'Note Deleted', description: 'The note has been successfully deleted.'});
      if (socketContext.socketInstance && note._id) {
          socketContext.socketInstance.emit('noteDeleted', { roomId: note._id, noteId: note._id });
      }
      router.push('/dashboard');
    } catch (deleteError) {
      console.error('Failed to delete note:', deleteError);
      toast({ title: 'Error Deleting Note', description: 'Could not delete the note.', variant: 'destructive' });
    }
    setIsDeleteDialogOpen(false); // Close dialog after action
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

    const actualEditorContentElement = quillEditorRef.current?.querySelector('.ql-editor') as HTMLElement | null;
    if (!actualEditorContentElement) {
      toast({ title: "Export Error", description: "Editor content area not found for PDF export.", variant: "destructive" });
      console.error("[NoteEditor] .ql-editor element not found within quillEditorRef, cannot export PDF.");
      return;
    }

    toast({ title: "Generating PDF...", description: "Please wait while the PDF is being prepared.", variant: "default" });

    const exportableRoot = document.createElement('div');
    exportableRoot.style.padding = '20px'; 
    exportableRoot.style.width = actualEditorContentElement.clientWidth + 'px'; 

    const titleElement = document.createElement('h1');
    titleElement.textContent = title || 'Untitled Note';
    titleElement.style.marginBottom = '20px'; 
    titleElement.style.fontSize = '24pt'; 
    titleElement.style.fontWeight = 'bold';
    exportableRoot.appendChild(titleElement);

    const contentClone = actualEditorContentElement.cloneNode(true) as HTMLElement;
    contentClone.style.width = '100%'; 
    exportableRoot.appendChild(contentClone);

    document.body.appendChild(exportableRoot);

    try {
      const canvas = await html2canvas(exportableRoot, { 
        useCORS: true, 
        logging: false,
        width: exportableRoot.offsetWidth, 
        height: exportableRoot.offsetHeight, 
        // windowWidth: exportableRoot.scrollWidth, // REMOVED INVALID OPTION
        // windowHeight: exportableRoot.scrollHeight, // REMOVED INVALID OPTION
      });

      document.body.removeChild(exportableRoot); 

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
      // Ensure template literal is correctly formatted and closed
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
      `; // Ensure backtick is present and correctly placed

      const converted = htmlDocx.asBlob(fullHtml);
      const filename = `${title || 'Untitled Note'}.docx`;
      saveAs(converted, filename);
      toast({ title: "Exported as Word", description: `Note downloaded as ${filename}` });
    } catch (error) {
      console.error("Failed to export Word document:", error);
      toast({ title: "Word Export Failed", description: "Could not generate .docx file. See console for details.", variant: "destructive" });
    }
  };

  const getCollaboratorTriggerText = () => {
    if (!note || !note.sharedWith || note.sharedWith.length === 0) {
      return "No Collaborators"; 
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
  // MOVED HANDLER FUNCTIONS END HERE

  // Effect for emitting on unmount or fundamental context change
  useEffect(() => {
    // This cleanup function runs when the component unmounts or when socketContext/noteId/userId changes
    return () => {
      const {
        userMadeChangesInThisSession: madeChanges,
        note: currentNote,
        title: currentTitle,
        content: currentContentVal,
        user: currentUserVal,
        contentOnLoadOrFocus: snapshotContentVal,
        titleOnLoadOrFocus: snapshotTitleVal,
        isNewNote: isCurrentlyNewNote
      } = localStateRef.current;

      // Do not attempt to emit if it was a new note that was never saved
      if (isCurrentlyNewNote && !currentNote?._id) {
        console.log('[NoteEditor] Unmount: New note was not saved, not emitting.');
        return;
      }

      if (madeChanges && currentNote?._id && currentUserVal && socketContext.emitUserFinishedEditingWithContent) {
        console.log('[NoteEditor] Component unmounting or context changed. Checking for significant changes to emit.');
        
        const currentContentTrimmed = currentContentVal.trim();
        const contentSnapshotTrimmed = snapshotContentVal.trim();
        const titleSnapshot = snapshotTitleVal;

        if (currentContentTrimmed !== contentSnapshotTrimmed || currentTitle !== titleSnapshot) {
          console.log('[NoteEditor] Unmount/ContextChange: Significant difference from snapshot. Emitting userFinishedEditingNoteWithContent.');
          socketContext.emitUserFinishedEditingWithContent(currentNote._id, currentTitle, currentContentVal);
        } else {
          console.log('[NoteEditor] Unmount/ContextChange: No significant difference from snapshot, not emitting.');
        }
      } else {
        console.log('[NoteEditor] Unmount/ContextChange: Conditions for emitting not met.');
      }
    };
  }, [socketContext]); // Dependencies are minimal, ensuring cleanup is primarily for unmount or major context shifts.
                      // Add note?._id and user?._id if re-registering cleanup for new note/user sessions is desired
                      // without full component remount. For now, socketContext is likely sufficient if stable.

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading note...</div>;
  }

  // When navigating back to dashboard via button
  const handleBackToDashboard = () => {
    console.log("[NoteEditor] handleBackToDashboard called.");
    if (userMadeChangesInThisSession && note?._id && user && socketContext.emitUserFinishedEditingWithContent) {
        const currentContentTrimmed = content.trim();
        const contentSnapshotTrimmed = contentOnLoadOrFocus.trim();
        const titleSnapshot = titleOnLoadOrFocus;

        if (currentContentTrimmed !== contentSnapshotTrimmed || title !== titleSnapshot) {
            console.log("[NoteEditor] Pending significant changes detected on navigating back to dashboard. Emitting userFinishedEditingNoteWithContent.");
            socketContext.emitUserFinishedEditingWithContent(note._id, title, content);
            // No need to update snapshot here as we are navigating away
        } else {
            console.log("[NoteEditor] No significant changes on navigating back to dashboard compared to snapshot.");
        }
        setUserMadeChangesInThisSession(false); // Reset regardless of emit, as action is "done"
    } else {
        console.log("[NoteEditor] No pending changes or conditions not met for emitting on back to dashboard.");
    }
    router.push('/dashboard');
  };

  return (
    // Ensure this top-level div and all others use \`className\` for styles
    <div className="container mx-auto p-4 flex flex-col h-full max-h-screen max-w-4xl">
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        note={note}
        onNoteShared={handleNoteShared} 
      />
      <div className="sticky top-0 z-20 bg-card p-3 mb-3 border-b rounded-lg shadow">
        <div className="flex items-center mb-2">
          <Button variant="ghost" size="icon" onClick={handleBackToDashboard} title="Back to Dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {/* Title Input - Placed beside back button for better alignment */}
          <input
            type="text"
            value={title}
            onChange={handleTitleChange} // CORRECTED: Use handleTitleChange
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
            {!isNewNote && canShare && (
              <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(true)} disabled={isSaving || isLoading} title="Share Note">
                <Users className="h-4 w-4 md:mr-2" /> <span className="hidden md:inline">Share</span>
              </Button>
            )}
            {!isNewNote && canDelete && (
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
            <Button onClick={() => handleSave(title, content, true, false)} disabled={isSaving || isReadOnlyView || isLoading} size="sm" title="Save Note">
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
        ref={quillEditorRef} 
        className="flex-grow flex flex-col prose dark:prose-invert max-w-none rounded-md border border-input bg-transparent overflow-hidden"
      >
        <ReactQuill
          value={content}
          onChange={handleQuillChange}
          onBlur={handleEditorBlur} // Add onBlur to ReactQuill
          onFocus={handleEditorFocus} // Add onFocus to ReactQuill
          readOnly={isReadOnlyView || !canEdit || isLoading}
          modules={modules}
          formats={quillFormats}
          theme="snow"
          placeholder={isLoading ? "Loading note..." : (isReadOnlyView ? "This note is read-only." : "Start writing your note...")}
          className="flex-grow min-h-0 h-full bg-transparent text-foreground [&>.ql-container]:border-none [&>.ql-toolbar]:border-none [&>.ql-toolbar]:rounded-t-md [&>.ql-container]:flex-grow [&>.ql-container>.ql-editor]:p-4 md:[&>.ql-container>.ql-editor]:p-6 [&>.ql-container]:overflow-y-auto"
          style={{ height: '60vh' }} // Added fixed height of 60vh
        />
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
