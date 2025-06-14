'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Users, Trash2, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
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
import { debounce } from 'lodash';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import TurndownService from 'turndown';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DOMPurify from 'dompurify';
import htmlDocx from 'html-docx-js/dist/html-docx';
import { DeltaStatic, Sources } from 'quill';
import ReactQuillType from 'react-quill'; // Import ReactQuill type

// Define the list of fonts to be whitelisted and used in the toolbar
const QUILL_FONT_WHITELIST = [
  'sans-serif', // Default
  'serif',      // Default
  'monospace',  // Default
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
  const isNewNote = noteId === 'new';
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

  const quillRef = useRef<ReactQuillType>(null); // Correctly typed ref for ReactQuill
  const quillEditorRef = useRef<HTMLDivElement>(null); // For PDF export, if needed for direct DOM access

  const localStateRef = useRef({
    title,
    content,
    userMadeChangesInThisSession,
    contentOnLoadOrFocus,
    titleOnLoadOrFocus,
    note,
    user,
    isNewNote
  });

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
  }), []);

  const ReactQuill = useMemo(() => dynamic(() =>
    import('react-quill').then((reactQuillModule) => {
      if (reactQuillModule.Quill) {
        const QuillInstance = reactQuillModule.Quill;
        const Font = QuillInstance.import('formats/font');
        Font.whitelist = QUILL_FONT_WHITELIST;
        QuillInstance.register(Font, true);
      } else {
        console.error('[NoteEditor] Could not obtain Quill instance from react-quill module to register fonts.');
      }
      return reactQuillModule;
    }), { ssr: false }
  ), []);

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

  useEffect(() => {
    if (isNewNote) {
      setIsLoading(false);
      setTitle('Untitled Note');
      setContent('');
      setContentOnLoadOrFocus('');
      setTitleOnLoadOrFocus('Untitled Note');
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
        setContentOnLoadOrFocus(response.data.content);
        setTitleOnLoadOrFocus(response.data.title);
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
  }, [noteId, router, toast, isNewNote]); // Removed notesVersion from dependencies

  useEffect(() => {
    if (!socketContext || !socketContext.socketInstance || !note || !socket) {
      return;
    }
    const currentNoteId = note._id;
    socketContext.socketInstance.emit('joinNoteRoom', currentNoteId);

    const handleRemoteNoteContentUpdated = (updatedNoteData: Note) => {
      // Ensure we are dealing with the current note
      if (updatedNoteData._id !== localStateRef.current.note?._id) {
        return;
      }

      const isContentDifferent = updatedNoteData.content !== localStateRef.current.content;
      const isTitleDifferent = updatedNoteData.title !== localStateRef.current.title;
      const isNewer = new Date(updatedNoteData.updatedAt).getTime() > (lastSaved?.getTime() || 0);

      if ((isContentDifferent || isTitleDifferent) && isNewer) {
        const editor = quillRef.current?.getEditor();
        
        // If the current user has focus in the editor, they are actively editing.
        // Don't apply incoming content changes to prevent disruption.
        if (editor?.hasFocus()) {
          toast({
            title: "Collaborator saved changes",
            description: "Another user saved changes. Your editor content was not updated to prevent disruption. Save your work to sync.",
            variant: "info",
            duration: 7000
          });
          
          // Update the underlying 'note' state to reflect the true backend state (including new content)
          // Also update title state and lastSaved.
          // The editor's displayed content (local `content` state) remains untouched for now.
          setNote(updatedNoteData); 
          setTitle(updatedNoteData.title); 
          setLastSaved(new Date(updatedNoteData.updatedAt));
          // DO NOT call setContent(updatedNoteData.content) here to avoid disrupting focused user
        } else {
          // If current user is not focused, apply all updates.
          setNote(updatedNoteData);
          setTitle(updatedNoteData.title);
          setContent(updatedNoteData.content); // Apply content change
          setLastSaved(new Date(updatedNoteData.updatedAt));
          setSyncStatus('synced');
          // Check if the update was by the current user (e.g. an autosave confirmation)
          // This check would be more robust if backend sent lastModifiedBy user ID
          if (socketContext?.socketInstance?.id && updatedNoteData.lastModifiedBy !== user?._id) { // Assuming lastModifiedBy is available
             toast({ title: 'Note Updated Externally', description: 'Content was updated by another collaborator.' });
          } else if (localStateRef.current.content !== updatedNoteData.content || localStateRef.current.title !== updatedNoteData.title) {
             // Fallback toast if not clearly by another user but changes were applied
             toast({ title: 'Note Synced', description: 'The note has been updated.' });
          }
        }
      }
    };

    const handleNoteSharingUpdated = (updatedSharedNote: Note) => {
      if (updatedSharedNote._id === currentNoteId && user) {
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

    const handleNoteUnshared = (unshareData: { noteId: string; title: string; unsharerId?: string }) => {
      if (unshareData.noteId === currentNoteId && user) {
        setNote(prevNote => {
          if (!prevNote) return null;
          const userWasUnshared = !prevNote.sharedWith.some(s => (typeof s.userId === 'string' ? s.userId === user._id : (s.userId as User)?._id === user._id));
          if (userWasUnshared) {
             toast({
              title: 'Access Changed',
              description: `You have been unshared from the note \"${unshareData.title}\".`,
              variant: 'default',
            });
          }
          return prevNote;
        });
      }
    };

    socket.on('noteUpdated', handleRemoteNoteContentUpdated);
    socket.on('noteSharingUpdated', handleNoteSharingUpdated);
    socket.on('noteUnshared', handleNoteUnshared);

    return () => {
      if (socketContext.socketInstance && socketContext.socketInstance.connected && note && note._id) {
        const noteIdToLeave = note._id;
        socketContext.socketInstance.emit('leaveNoteRoom', noteIdToLeave);
      }
      socketContext.socketInstance?.off('noteUpdated', handleRemoteNoteContentUpdated);
      socketContext.socketInstance?.off('noteSharingUpdated', handleNoteSharingUpdated);
      socketContext.socketInstance?.off('noteUnshared', handleNoteUnshared);
    };
  }, [socketContext, note, user, toast, title, content, lastSaved, canEdit, setNote, setTitle, setContent, setLastSaved, setSyncStatus, socket]);

  const handleSave = useCallback(async (currentTitle: string, currentContent: string, showSuccessToast = false, isAuto = false) => {
    if (!user || isSaving) {
      return;
    }
    if (isReadOnlyView) {
      if (showSuccessToast) {
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
    const payload = { title: currentTitle.slice(0, MAX_TITLE_LENGTH), content: currentContent, isAutoSave: isAuto };
    let savedNoteData: Note | null = null;
    try {
      let response;
      if (isNewNote && !note?._id) {
        response = await api.post('/notes', payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData);
        router.replace(`/notes/${savedNoteData._id}`);
        toast({ title: 'Note Created', description: 'Your note has been saved.' });
      } else if (note?._id) {
        response = await api.put(`/notes/${note._id}`, payload);
        savedNoteData = response.data as Note;
        setNote(savedNoteData);
        if (showSuccessToast) {
          toast({ title: 'Note Saved', description: 'Your changes have been saved.' });
        }
      } else {
        console.error("handleSave called without a note ID for an existing note or for a new note properly.");
        toast({title: "Save Error", description: "Cannot determine save operation.", variant: "destructive"});
        setSyncStatus('error');
        return;
      }
      if (savedNoteData) {
        setTitle(savedNoteData.title);
        setLastSaved(new Date(savedNoteData.updatedAt));
        setSyncStatus('synced');
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
        setIsSaving(false);
    }
  }, [user, isSaving, isReadOnlyView, toast, isNewNote, note?._id, router]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(async (currentTitle: string, currentContent: string) => {
      await handleSave(currentTitle, currentContent, false, true);
    }, 1500),
    [handleSave]
  );

  const handleContentChange = (newContent: string, _delta: DeltaStatic, source: Sources) => { // Restored original signature
    if (source === 'user') {
      const cleanContent = DOMPurify.sanitize(newContent);
      setContent(cleanContent);
      setUserMadeChangesInThisSession(true);
      debouncedSave(title, cleanContent);
    }
  };

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = event.target.value;
    setTitle(newTitle.slice(0, MAX_TITLE_LENGTH));
    setUserMadeChangesInThisSession(true);
    debouncedSave(newTitle.slice(0, MAX_TITLE_LENGTH), content);
  };

  const handleContentFocus = () => { // Restored
    setContentOnLoadOrFocus(content);
    setTitleOnLoadOrFocus(title);
    setUserMadeChangesInThisSession(false);
  };

  const handleContentBlur = () => { // Restored
    if (!userMadeChangesInThisSession) {
        return;
    }
    if (note?._id && user && socketContext.emitUserFinishedEditingWithContent) {
      const currentContentTrimmed = content.trim();
      const contentSnapshotTrimmed = contentOnLoadOrFocus.trim();
      const titleSnapshot = titleOnLoadOrFocus;
      if (currentContentTrimmed !== contentSnapshotTrimmed || title !== titleSnapshot) {
        socketContext.emitUserFinishedEditingWithContent(note._id, title, content);
        setContentOnLoadOrFocus(content);
        setTitleOnLoadOrFocus(title);
        setUserMadeChangesInThisSession(false);
      }
    }
  };
  
  const handleTitleFocus = () => { // Added for consistency, mirrors handleContentFocus
    setContentOnLoadOrFocus(content);
    setTitleOnLoadOrFocus(title);
    setUserMadeChangesInThisSession(false);
  };

  const handleTitleBlur = () => { // Added for consistency, mirrors handleContentBlur
     if (!userMadeChangesInThisSession) {
        return;
    }
    if (note?._id && user && socketContext.emitUserFinishedEditingWithContent) {
      const currentContentTrimmed = content.trim();
      const contentSnapshotTrimmed = contentOnLoadOrFocus.trim();
      const titleSnapshot = titleOnLoadOrFocus;
      if (currentContentTrimmed !== contentSnapshotTrimmed || title !== titleSnapshot) {
        socketContext.emitUserFinishedEditingWithContent(note._id, title, content);
        setContentOnLoadOrFocus(content);
        setTitleOnLoadOrFocus(title);
        setUserMadeChangesInThisSession(false);
      }
    }
  };


  // Export functions - restored
  const handleExportAsMarkdown = () => {
    if (!note && !isNewNote) { // Check if note exists or if it's a new note
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';
    const markdownTitle = `# ${currentTitle}\n\n`;
    const markdownBody = turndownService.turndown(DOMPurify.sanitize(currentEditorContent));
    const fullMarkdownContent = markdownTitle + markdownBody;
    const blob = new Blob([fullMarkdownContent], { type: 'text/markdown;charset=utf-8' });
    saveAs(blob, `${currentTitle}.md`);
    toast({ title: "Exported as Markdown", description: `Note downloaded as ${currentTitle}.md` });
  };

  const handleExportAsText = () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = DOMPurify.sanitize(currentEditorContent);
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    const textBlob = new Blob([`${currentTitle}\n\n${plainText}`], { type: 'text/plain;charset=utf-8' });
    saveAs(textBlob, `${currentTitle}.txt`);
    toast({ title: "Exported as Plain Text", description: `Note downloaded as ${currentTitle}.txt` });
  };

  const handleExportAsHTML = () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';
    const htmlBlob = new Blob([`<h1>${currentTitle}</h1>\n${DOMPurify.sanitize(currentEditorContent)}`], { type: 'text/html;charset=utf-8' });
    saveAs(htmlBlob, `${currentTitle}.html`);
    toast({ title: "Exported as HTML", description: `Note downloaded as ${currentTitle}.html` });
  };

  const handleExportAsPDF = async () => {
    if ((!note && !isNewNote) || !quillRef.current) {
        toast({ title: "Cannot Export", description: "Note data or editor instance is not available for PDF export.", variant: "destructive" });
        return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';

    toast({ title: "Generating PDF...", description: "Please wait while the PDF is being prepared.", variant: "default" });
    const actualEditorContentElement = quillRef.current?.getEditor().root;
    if (!actualEditorContentElement) {
        toast({ title: "Export Error", description: "Editor content area not found for PDF export.", variant: "destructive" });
        return;
    }

    const exportableRoot = document.createElement('div');
    exportableRoot.style.padding = '20px';
    exportableRoot.style.width = actualEditorContentElement.clientWidth > 0 ? actualEditorContentElement.clientWidth + 'px' : '800px'; // Fallback width
    exportableRoot.style.fontFamily = getComputedStyle(actualEditorContentElement).fontFamily || 'sans-serif';
    exportableRoot.style.fontSize = getComputedStyle(actualEditorContentElement).fontSize || '16px';
    exportableRoot.style.lineHeight = getComputedStyle(actualEditorContentElement).lineHeight || 'normal';
    // Apply basic Quill classes for structure if needed, but prioritize direct styling for PDF
    // exportableRoot.className = 'ql-editor'; 

    const titleElement = document.createElement('h1');
    titleElement.textContent = currentTitle;
    titleElement.style.marginBottom = '20px';
    titleElement.style.fontSize = '24pt'; // Example: make title larger
    titleElement.style.fontWeight = 'bold';
    exportableRoot.appendChild(titleElement);

    const contentCloneContainer = document.createElement('div');
    contentCloneContainer.innerHTML = DOMPurify.sanitize(currentEditorContent, { USE_PROFILES: { html: true } });
    exportableRoot.appendChild(contentCloneContainer);

    // Temporarily append to body to ensure styles are computed for html2canvas
    document.body.appendChild(exportableRoot);

    try {
        const canvas = await html2canvas(exportableRoot, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            logging: false, // Reduce console noise
            width: exportableRoot.offsetWidth,
            height: exportableRoot.offsetHeight,
            windowWidth: exportableRoot.scrollWidth,
            windowHeight: exportableRoot.scrollHeight
        });
        document.body.removeChild(exportableRoot); // Clean up

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 10; // mm
        const contentWidth = pdfWidth - (2 * margin);
        const contentHeight = pdfHeight - (2 * margin);

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = imgWidth / imgHeight;

        let newImgHeight = contentWidth / ratio;
        let newImgWidth = contentWidth;

        if (newImgHeight > contentHeight) { // If image is too tall for one page (after fitting width)
            // This part handles multi-page PDF generation for tall content
            let currentPosition = margin;
            let remainingImgHeight = imgHeight;
            let sourceY = 0;

            while (remainingImgHeight > 0) {
                const pageCanvasHeight = Math.min(remainingImgHeight, (contentHeight / newImgHeight) * imgHeight );
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = imgWidth;
                pageCanvas.height = pageCanvasHeight;
                const pageCtx = pageCanvas.getContext('2d');

                if (pageCtx) {
                    pageCtx.drawImage(canvas, 0, sourceY, imgWidth, pageCanvasHeight, 0, 0, imgWidth, pageCanvasHeight);
                    const pageImgData = pageCanvas.toDataURL('image/png');
                    const renderedSliceHeight = (newImgWidth / (imgWidth / pageCanvasHeight));
                    pdf.addImage(pageImgData, 'PNG', margin, currentPosition, newImgWidth, renderedSliceHeight);
                    remainingImgHeight -= pageCanvasHeight;
                    sourceY += pageCanvasHeight;
                    if (remainingImgHeight > 0) {
                        pdf.addPage();
                        currentPosition = margin; // Reset position for new page
                    }
                } else {
                    throw new Error("Failed to get 2D context for PDF page slicing.");
                }
            }
        } else {
             // Single page PDF
            pdf.addImage(imgData, 'PNG', margin, margin, newImgWidth, newImgHeight);
        }

        pdf.save(`${currentTitle}.pdf`);
        toast({ title: "Exported as PDF", description: `Note downloaded as ${currentTitle}.pdf` });
    } catch (pdfError) {
        console.error("Failed to export PDF:", pdfError);
        toast({ title: "PDF Export Failed", description: `Could not generate PDF. ${pdfError instanceof Error ? pdfError.message : ''}`, variant: "destructive" });
        if (document.body.contains(exportableRoot)) {
            document.body.removeChild(exportableRoot); // Ensure cleanup on error
        }
    }
  };

  const handleExportAsDOCX = () => {
    if (!note && !isNewNote) {
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';

    toast({ title: "Generating Word Document...", description: "Please wait while the .docx is being prepared.", variant: "default" });
    try {
        const fullHtml = `
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${DOMPurify.sanitize(currentTitle)}</title>
            <style>
                body { font-family: Calibri, sans-serif; font-size: 11pt; margin: 1in; }
                h1.doc-title { font-size: 22pt; font-weight: bold; margin-bottom: 20px; color: #2F5496; }
                h1 { font-size: 16pt; color: #2F5496; margin-top: 24px; margin-bottom: 6px; }
                h2 { font-size: 14pt; color: #2F5496; margin-top: 18px; margin-bottom: 4px; }
                h3 { font-size: 12pt; color: #4F81BD; margin-top: 12px; margin-bottom: 3px; }
                p { margin-bottom: 10px; line-height: 1.15; }
                strong { font-weight: bold; }
                em { font-style: italic; }
                u { text-decoration: underline; }
                s { text-decoration: line-through; }
                blockquote { border-left: 4px solid #AEAAAA; margin-left: 0; padding-left: 1em; color: #555555; font-style: italic; }
                ul, ol { margin-left: 20px; padding-left: 20px; }
                li { margin-bottom: 5px; }
                a { color: #0563C1; text-decoration: underline; }
                pre, code { font-family: Consolas, monospace; background-color: #F5F5F5; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
                pre { padding: 10px; overflow-x: auto; }
                /* Add more specific Quill format mappings if necessary */
            </style>
            </head><body>
            <h1 class="doc-title">${DOMPurify.sanitize(currentTitle)}</h1>
            ${DOMPurify.sanitize(currentEditorContent, { USE_PROFILES: { html: true } })}
            </body></html>`;

        const converted = htmlDocx.asBlob(fullHtml, { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } }); // 720 TWIPs = 0.5 inch
        saveAs(converted, `${currentTitle}.docx`);
        toast({ title: "Exported as Word", description: `Note downloaded as ${currentTitle}.docx` });
    } catch (docxError) {
        console.error("Failed to export Word document:", docxError);
        toast({ title: "Word Export Failed", description: `Could not generate .docx file. ${docxError instanceof Error ? docxError.message : ''}`, variant: "destructive" });
    }
  };

  const handleManualSave = () => {
    if (title.trim() === '' && content.trim() === '') {
      toast({
        title: "Cannot Save Empty Note",
        description: "Please add a title or some content before saving.",
        variant: "destructive",
      });
      return;
    }
    handleSave(title, content, true, false);
  };

  const handleDelete = async () => { // Renamed from confirmDelete for clarity
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
    setIsDeleteDialogOpen(false);
  };

  const exportNote = async (format: 'txt' | 'md' | 'html' | 'pdf' | 'docx') => {
    if (!note && !isNewNote && format !== 'txt') { // Allow empty export for txt
      toast({ title: "Cannot Export", description: "Note data is not available for export.", variant: "destructive" });
      return;
    }
    const currentTitle = title || 'Untitled Note';
    const currentEditorContent = content || '';
    const isEmptyContent = currentEditorContent.trim() === '' || currentEditorContent.trim() === '<p><br></p>' || currentEditorContent.trim() === '<p></p>';

    if (isEmptyContent && !title && format !== 'txt') {
      toast({ title: 'Nothing to Export', description: 'Note title and content are empty.', variant: "default" });
      return;
    }

    switch (format) {
      case 'txt':
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = currentEditorContent;
        const plainText = tempDiv.textContent || tempDiv.innerText || "";
        const textBlob = new Blob([`${currentTitle}\n\n${plainText}`], { type: 'text/plain;charset=utf-8' });
        saveAs(textBlob, `${currentTitle}.txt`);
        toast({ title: "Exported as Plain Text", description: `Note downloaded as ${currentTitle}.txt` });
        break;
      case 'md':
        const markdownTitle = `# ${currentTitle}\n\n`;
        const markdownBody = turndownService.turndown(currentEditorContent);
        const fullMarkdownContent = markdownTitle + markdownBody;
        const mdBlob = new Blob([fullMarkdownContent], { type: 'text/markdown;charset=utf-8' });
        saveAs(mdBlob, `${currentTitle}.md`);
        toast({ title: "Exported as Markdown", description: `Note downloaded as ${currentTitle}.md` });
        break;
      case 'html':
        const htmlBlob = new Blob([`<h1>${currentTitle}</h1>\n${currentEditorContent}`], { type: 'text/html;charset=utf-8' });
        saveAs(htmlBlob, `${currentTitle}.html`);
        toast({ title: "Exported as HTML", description: `Note downloaded as ${currentTitle}.html` });
        break;
      case 'pdf':
        toast({ title: "Generating PDF...", description: "Please wait while the PDF is being prepared.", variant: "default" });
        const actualEditorContentElement = quillRef.current?.getEditor().root; // Use Quill's root
        if (!actualEditorContentElement) {
          toast({ title: "Export Error", description: "Editor content area not found for PDF export.", variant: "destructive" });
          return;
        }
        const exportableRoot = document.createElement('div');
        exportableRoot.style.padding = '20px';
        exportableRoot.style.width = actualEditorContentElement.clientWidth + 'px';
        const titleElement = document.createElement('h1');
        titleElement.textContent = currentTitle;
        titleElement.style.marginBottom = '20px'; titleElement.style.fontSize = '24pt'; titleElement.style.fontWeight = 'bold';
        exportableRoot.appendChild(titleElement);
        const contentClone = actualEditorContentElement.cloneNode(true) as HTMLElement;
        contentClone.style.width = '100%';
        exportableRoot.appendChild(contentClone);
        document.body.appendChild(exportableRoot);
        try {
          const canvas = await html2canvas(exportableRoot, { useCORS: true, logging: false, width: exportableRoot.offsetWidth, height: exportableRoot.offsetHeight });
          document.body.removeChild(exportableRoot);
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
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
              pageCanvas.width = imgWidth; pageCanvas.height = actualSliceHeight;
              const pageCtx = pageCanvas.getContext('2d');
              if (pageCtx) {
                pageCtx.drawImage(canvas, 0, sourceY, imgWidth, actualSliceHeight, 0, 0, imgWidth, actualSliceHeight);
                const pageImgData = pageCanvas.toDataURL('image/png');
                const renderedSliceHeight = (newImgWidthConst / (imgWidth / actualSliceHeight));
                pdf.addImage(pageImgData, 'PNG', 10, currentPosition, newImgWidthConst, renderedSliceHeight);
                remainingImgHeight -= actualSliceHeight; sourceY += actualSliceHeight;
                if (remainingImgHeight > 0) { pdf.addPage(); currentPosition = 10; }
              } else { throw new Error("Failed to get 2D context for PDF page."); }
            }
          }
          pdf.save(`${currentTitle}.pdf`);
          toast({ title: "Exported as PDF", description: `Note downloaded as ${currentTitle}.pdf` });
        } catch (pdfError) {
          console.error("Failed to export PDF:", pdfError);
          toast({ title: "PDF Export Failed", description: "Could not generate PDF.", variant: "destructive" });
          if (document.body.contains(exportableRoot)) document.body.removeChild(exportableRoot);
        }
        break;
      case 'docx':
        toast({ title: "Generating Word Document...", description: "Please wait while the .docx is being prepared.", variant: "default" });
        try {
          const fullHtml = `
            <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${currentTitle}</title>
            <style>body{font-family:sans-serif;font-size:11pt;margin:20px;}h1.doc-title{font-size:24pt;font-weight:bold;margin-bottom:20px;}h1,h2,h3,h4,h5,h6{margin-top:1em;margin-bottom:0.5em;}p{margin-bottom:10px;line-height:1.5;}strong{font-weight:bold;}em{font-style:italic;}u{text-decoration:underline;}s{text-decoration:line-through;}blockquote{border-left:4px solid #ccc;margin-left:0;padding-left:1em;color:#555;}ul,ol{margin-left:20px;padding-left:20px;}li{margin-bottom:5px;}a{color:blue;text-decoration:underline;}</style>
            </head><body><h1 class="doc-title">${currentTitle}</h1>${currentEditorContent}</body></html>`;
          const converted = htmlDocx.asBlob(fullHtml);
          saveAs(converted, `${currentTitle}.docx`);
          toast({ title: "Exported as Word", description: `Note downloaded as ${currentTitle}.docx` });
        } catch (docxError) {
          console.error("Failed to export Word document:", docxError);
          toast({ title: "Word Export Failed", description: "Could not generate .docx file.", variant: "destructive" });
        }
        break;
      default:
        toast({ title: "Export Error", description: "Invalid export format selected.", variant: "destructive" });
    }
  };
  
  const handleInitialSave = () => { // For "Create Note" button on new notes
    handleSave(title, content, true, false);
  };

  useEffect(() => {
    return () => {
      const {
        userMadeChangesInThisSession: madeChanges,
        note: currentNoteVal, // Renamed to avoid conflict
        title: currentTitleVal, // Renamed
        content: currentContentVal, // Renamed
        user: currentUserVal, // Renamed
        contentOnLoadOrFocus: snapshotContentVal, // Renamed
        titleOnLoadOrFocus: snapshotTitleVal, // Renamed
        isNewNote: isCurrentlyNewNoteVal // Renamed
      } = localStateRef.current;

      if (isCurrentlyNewNoteVal && !currentNoteVal?._id) {
        return;
      }
      if (madeChanges && currentNoteVal?._id && currentUserVal && socketContext.emitUserFinishedEditingWithContent) {
        const currentContentTrimmed = currentContentVal.trim();
        const contentSnapshotTrimmed = snapshotContentVal.trim();
        const titleSnapshot = snapshotTitleVal;
        if (currentContentTrimmed !== contentSnapshotTrimmed || currentTitleVal !== titleSnapshot) {
          socketContext.emitUserFinishedEditingWithContent(currentNoteVal._id, currentTitleVal, currentContentVal);
        }
      }
    };
  }, [socketContext]);


  if (isLoading && !isNewNote) { // Allow new note to render form immediately
    return (
      <div className="flex justify-center items-center h-screen bg-background text-foreground">
        <Loader2 className="h-12 w-12 animate-spin text-accent" />
        <p className="ml-4 text-lg">Loading note...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground p-2 sm:p-4 md:p-6 flex flex-col items-center">
      {/* Centering and max-width container for the entire editor content */}
      <div className="w-full max-w-4xl mx-auto">
        {/* Back Button and Title Input Row */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" onClick={() => router.back()} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex items-center space-x-2">
            {syncStatus === 'syncing' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {syncStatus === 'synced' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {syncStatus === 'error' && <AlertTriangle className="h-5 w-5 text-red-500" />}
            <span className="text-sm text-muted-foreground">
              {lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : (isNewNote ? 'Not saved yet' : '')}
            </span>
          </div>
        </div>

        {/* Action Buttons Moved Here */}
        {!isReadOnlyView && (
          <div className="flex flex-wrap items-center justify-end gap-2 mb-4 p-2 rounded-md bg-card border border-border">
            <Button onClick={handleManualSave} disabled={isSaving || isLoading} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>

            {canShare && !isNewNote && (
              <Button variant="outline" onClick={() => setIsShareModalOpen(true)} className="border-accent-foreground/30 hover:bg-accent/20">
                <Users className="mr-2 h-4 w-4 text-accent" /> Share
              </Button>
            )}

            {canDelete && !isNewNote && (
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-background border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the note.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="hover:bg-muted/50">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            {!isNewNote && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-accent-foreground/30 hover:bg-accent/20">
                    <Download className="mr-2 h-4 w-4 text-accent" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground">
                  <DropdownMenuItem onClick={handleExportAsMarkdown} className="hover:bg-accent/10 focus:bg-accent/20">Markdown (.md)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportAsText} className="hover:bg-accent/10 focus:bg-accent/20">Text (.txt)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportAsHTML} className="hover:bg-accent/10 focus:bg-accent/20">HTML (.html)</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem onClick={handleExportAsPDF} className="hover:bg-accent/10 focus:bg-accent/20">PDF (.pdf)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportAsDOCX} className="hover:bg-accent/10 focus:bg-accent/20">Word (.docx)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          onFocus={handleTitleFocus}
          onBlur={handleTitleBlur}
          placeholder="Note Title"
          className="text-2xl font-bold p-2 rounded-md bg-input border border-border focus:ring-2 focus:ring-accent-foreground text-foreground placeholder-muted-foreground"
          maxLength={MAX_TITLE_LENGTH}
          disabled={isLoading || isReadOnlyView}
        />
        {title.length >= MAX_TITLE_LENGTH && (
          <p className="text-xs text-red-500">Maximum title length of {MAX_TITLE_LENGTH} characters reached.</p>
        )}

        <div ref={quillEditorRef} className="flex-grow ql-editor-container bg-card border border-border rounded-md p-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : (
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={content}
              onChange={handleContentChange}
              onFocus={handleContentFocus} // Restored
              onBlur={handleContentBlur}   // Restored
              modules={modules}
              formats={quillFormats}
              readOnly={isReadOnlyView}
              placeholder="Start writing your masterpiece..."
              className="prose dark:prose-invert max-w-none" // Removed min-h-[500px] as it's now handled by globals.css
            />
          )}
        </div>

        {note && !isNewNote && (
          <ShareModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            note={note}
            onNoteShared={async () => {
              // Re-fetch note data to update sharing status and content if necessary
              if (note?._id) {
                try {
                  const response = await api.get(`/notes/${note._id}`);
                  setNote(response.data);
                  // Optionally, update title and content if they could have changed due to sharing actions (e.g., if a shared user edited)
                  // setTitle(response.data.title);
                  // setContent(response.data.content);
                  // setLastSaved(new Date(response.data.updatedAt));
                  toast({ title: "Sharing Updated", description: "Note sharing information has been refreshed." });
                } catch (error) {
                  console.error("[NoteEditor] Error re-fetching note after share:", error);
                  toast({ title: "Refresh Error", description: "Could not refresh note details after sharing.", variant: "destructive" });
                }
              }
            }}
          />
        )}
      </div> 
    </div>
  );
};

export default NoteEditor;
