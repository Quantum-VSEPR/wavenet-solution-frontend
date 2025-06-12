'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import api from '@/lib/api';
import { Note, User } from '@/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import NoteItem from '@/components/notes/NoteItem';
import CreateNoteModal from '@/components/notes/CreateNoteModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

const NOTES_PER_PAGE = 10;

interface SortOption {
  value: string;
  label: string;
}

const sortOptions: SortOption[] = [
  { value: 'updatedAt_desc', label: 'Last Updated (Newest)' },
  { value: 'updatedAt_asc', label: 'Last Updated (Oldest)' },
  { value: 'createdAt_desc', label: 'Date Created (Newest)' },
  { value: 'createdAt_asc', label: 'Date Created (Oldest)' },
  { value: 'title_asc', label: 'Title (A-Z)' },
  { value: 'title_desc', label: 'Title (Z-A)' },
];

const DashboardClient = () => {
  const { token, user } = useAuth();
  const { socket, notesVersion, newSharedItemCounter } = useSocket();
  const router = useRouter();
  const { toast } = useToast();
  
  const [myNotes, setMyNotes] = useState<Note[]>([]);
  const [myNotesPage, setMyNotesPage] = useState(1);
  const [myNotesTotalPages, setMyNotesTotalPages] = useState(1);
  const [myNotesTotalCount, setMyNotesTotalCount] = useState(0);
  const [myNotesSortBy, setMyNotesSortBy] = useState<string>(sortOptions[0].value);

  const [sharedNotes, setSharedNotes] = useState<Note[]>([]);
  const [sharedNotesPage, setSharedNotesPage] = useState(1);
  const [sharedNotesTotalPages, setSharedNotesTotalPages] = useState(1);
  const [sharedNotesTotalCount, setSharedNotesTotalCount] = useState(0);
  const [sharedNotesSortBy, setSharedNotesSortBy] = useState<string>(sortOptions[0].value);

  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
  const [archivedNotesPage, setArchivedNotesPage] = useState(1);
  const [archivedNotesTotalPages, setArchivedNotesTotalPages] = useState(1);
  const [archivedNotesTotalCount, setArchivedNotesTotalCount] = useState(0);
  const [archivedNotesSortBy, setArchivedNotesSortBy] = useState<string>(sortOptions[0].value);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); 
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active"); // To track current tab

  const initialFetchDone = useRef(false);
  const newSharedItemCounterRef = useRef(newSharedItemCounter);
  const isFetchingRef = useRef(false); // Ref to track if a fetch is in progress

  const handleNoteDeletedClientSide = useCallback((noteId: string, noteType: 'myNotes' | 'archivedNotes') => {
    if (noteType === 'myNotes') {
      setMyNotes(prevNotes => prevNotes.filter(note => note._id !== noteId));
      setMyNotesTotalCount(prevCount => prevCount - 1);
    } else if (noteType === 'archivedNotes') {
      setArchivedNotes(prevArchivedNotes => prevArchivedNotes.filter(note => note._id !== noteId));
      setArchivedNotesTotalCount(prevCount => prevCount - 1);
    }
    console.log(`[DashboardClient] Optimistically removed note ${noteId} from ${noteType} list and updated count.`);
  }, []);

  const handleNoteArchiveStatusChangedClientSide = useCallback((changedNote: Note, isArchived: boolean) => {
    const noteId = changedNote._id;
    console.log(`[DashboardClient] Optimistic archive/unarchive. Note ID: ${noteId}, Target archived state: ${isArchived}`);
    console.log(`[DashboardClient] Counts BEFORE: My: ${myNotesTotalCount}, Archived: ${archivedNotesTotalCount}`);

    if (isArchived) { // Moving from My Notes to Archived Notes
      setMyNotes(prevNotes => prevNotes.filter(n => n._id !== noteId));
      setArchivedNotes(prevArchivedNotes => 
        [{ ...changedNote, isArchived: true, updatedAt: new Date().toISOString() }, ...prevArchivedNotes.filter(n => n._id !== noteId)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
      setMyNotesTotalCount(prevCount => {
        console.log(`[DashboardClient] Decrementing myNotesTotalCount. Prev: ${prevCount}, New: ${prevCount - 1}`);
        return prevCount - 1;
      });
      setArchivedNotesTotalCount(prevCount => {
        console.log(`[DashboardClient] Incrementing archivedNotesTotalCount. Prev: ${prevCount}, New: ${prevCount + 1}`);
        return prevCount + 1;
      });
      console.log(`[DashboardClient] Optimistically moved note ${noteId} to Archived Notes.`);
    } else { // Moving from Archived Notes to My Notes
      setArchivedNotes(prevArchivedNotes => prevArchivedNotes.filter(n => n._id !== noteId));
      setMyNotes(prevNotes => 
        [{ ...changedNote, isArchived: false, updatedAt: new Date().toISOString() }, ...prevNotes.filter(n => n._id !== noteId)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
      setArchivedNotesTotalCount(prevCount => {
        console.log(`[DashboardClient] Decrementing archivedNotesTotalCount. Prev: ${prevCount}, New: ${prevCount - 1}`);
        return prevCount - 1;
      });
      setMyNotesTotalCount(prevCount => {
        console.log(`[DashboardClient] Incrementing myNotesTotalCount. Prev: ${prevCount}, New: ${prevCount + 1}`);
        return prevCount + 1;
      });
      console.log(`[DashboardClient] Optimistically moved note ${noteId} to My Notes.`);
    }
    // Note: Logging myNotesTotalCount & archivedNotesTotalCount here won't show updated values due to async nature of setState.
    // The functional updates with console.log inside them are more reliable for seeing prev/new.
  }, [myNotesTotalCount, archivedNotesTotalCount]); // Added counts to dependency array for logging "BEFORE" state accurately.


  const fetchNotes = useCallback(async ( 
    myPageToFetch: number,
    sharedPageToFetch: number,
    archivedPageToFetch: number,
    mySortToUse: string,
    sharedSortToUse: string,
    archivedSortToUse: string,
    options: { isInitialLoad?: boolean, triggeredBy?: string } = {}
  ) => {
    const { isInitialLoad = false, triggeredBy = 'unknown' } = options;

    if (!token) {
      setIsLoading(false); 
      setMyNotes([]); setMyNotesPage(1); setMyNotesTotalPages(1); setMyNotesTotalCount(0);
      setSharedNotes([]); setSharedNotesPage(1); setSharedNotesTotalPages(1); setSharedNotesTotalCount(0);
      setArchivedNotes([]); setArchivedNotesPage(1); setArchivedNotesTotalPages(1); setArchivedNotesTotalCount(0);
      initialFetchDone.current = false; // Reset on logout
      return; 
    }

    // Prevent concurrent fetches
    if (isFetchingRef.current && !isInitialLoad) {
      console.log(`[DashboardClient] Fetch already in progress. Triggered by: ${triggeredBy}. Aborting new fetch.`);
      return;
    }

    isFetchingRef.current = true;
    if (isInitialLoad || !initialFetchDone.current) { // Show loading spinner for initial load or if not yet done
        setIsLoading(true);
    }
    
    console.log(`[DashboardClient] Fetching notes. Trigger: ${triggeredBy}, Initial: ${isInitialLoad}, MyPage: ${myPageToFetch}, SharedPage: ${sharedPageToFetch}, ArchivedPage: ${archivedPageToFetch}`);

    const [mySortField, mySortOrder] = mySortToUse.split('_');
    const [sharedSortField, sharedSortOrder] = sharedSortToUse.split('_');
    const [archivedSortField, archivedSortOrder] = archivedSortToUse.split('_');

    const results = await Promise.all([
      api.get(`/notes/mynotes?page=${myPageToFetch}&limit=${NOTES_PER_PAGE}&sortBy=${mySortField}&sortOrder=${mySortOrder}`)
        .then(res => ({ status: 'fulfilled' as const, value: res, type: 'myNotes' }))
        .catch(err => ({ status: 'rejected' as const, reason: err, type: 'myNotes' })),
      api.get(`/notes/sharedwithme?page=${sharedPageToFetch}&limit=${NOTES_PER_PAGE}&sortBy=${sharedSortField}&sortOrder=${sharedSortOrder}`)
        .then(res => ({ status: 'fulfilled' as const, value: res, type: 'sharedNotes' }))
        .catch(err => ({ status: 'rejected' as const, reason: err, type: 'sharedNotes' })),
      api.get(`/notes/archived?page=${archivedPageToFetch}&limit=${NOTES_PER_PAGE}&sortBy=${archivedSortField}&sortOrder=${archivedSortOrder}`)
        .then(res => ({ status: 'fulfilled' as const, value: res, type: 'archivedNotes' }))
        .catch(err => ({ status: 'rejected' as const, reason: err, type: 'archivedNotes' })),
    ]);

    const myNotesResult = results.find(r => r.type === 'myNotes');
    if (myNotesResult && myNotesResult.status === 'fulfilled') {
      const { data } = myNotesResult.value;
      setMyNotes(data.notes);
      setMyNotesTotalPages(data.totalPages);
      setMyNotesPage(data.currentPage);
      setMyNotesTotalCount(data.totalNotes);
    } else if (myNotesResult && myNotesResult.status === 'rejected') {
      console.error('Failed to fetch my notes:', myNotesResult.reason);
      setMyNotes([]); setMyNotesTotalPages(1); setMyNotesPage(1); setMyNotesTotalCount(0);
      toast({ title: 'Error fetching My Notes', description: myNotesResult.reason?.response?.data?.message || 'Could not load your notes.', variant: 'destructive'});
    }

    const sharedNotesResult = results.find(r => r.type === 'sharedNotes');
    if (sharedNotesResult && sharedNotesResult.status === 'fulfilled') {
      const { data } = sharedNotesResult.value;
      setSharedNotes(data.notes);
      setSharedNotesTotalPages(data.totalPages);
      setSharedNotesPage(data.currentPage);
      setSharedNotesTotalCount(data.totalNotes);
    } else if (sharedNotesResult && sharedNotesResult.status === 'rejected') {
      console.error('Failed to fetch shared notes:', sharedNotesResult.reason);
      setSharedNotes([]); setSharedNotesTotalPages(1); setSharedNotesPage(1); setSharedNotesTotalCount(0);
      toast({ title: 'Error fetching Shared Notes', description: sharedNotesResult.reason?.response?.data?.message || 'Could not load notes shared with you.', variant: 'destructive'});
    }

    const archivedNotesResult = results.find(r => r.type === 'archivedNotes');
    if (archivedNotesResult && archivedNotesResult.status === 'fulfilled') {
      const { data } = archivedNotesResult.value;
      setArchivedNotes(data.notes);
      setArchivedNotesTotalPages(data.totalPages);
      setArchivedNotesPage(data.currentPage);
      setArchivedNotesTotalCount(data.totalNotes);
    } else if (archivedNotesResult && archivedNotesResult.status === 'rejected') {
      console.error('Failed to fetch archived notes:', archivedNotesResult.reason);
      setArchivedNotes([]); setArchivedNotesTotalPages(1); setArchivedNotesPage(1); setArchivedNotesTotalCount(0);
      // Only show toast if the archived tab is active or it's an initial load
      if (activeTab === "archived" || isInitialLoad) {
        toast({ title: 'Error fetching Archived Notes', description: archivedNotesResult.reason?.response?.data?.message || 'Could not load archived notes.', variant: 'destructive'});
      }
    }
    
    setIsLoading(false); 
    isFetchingRef.current = false;
    if (isInitialLoad) initialFetchDone.current = true;
  }, [token, toast, activeTab]); // Added activeTab

  // Effect for initial load and general updates (pagination, sorting, notesVersion)
  useEffect(() => {
    if (token && !isFetchingRef.current) { // Ensure token exists and no fetch is currently in progress
      if (!initialFetchDone.current) { // Initial load
        console.log("[DashboardClient] Initial fetch triggered by token/mount.");
        fetchNotes(myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy, { isInitialLoad: true, triggeredBy: 'initialLoad' });
      } else { // Subsequent updates (pagination, sorting, notesVersion)
        console.log("[DashboardClient] General update fetch triggered. notesVersion:", notesVersion);
        fetchNotes(myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy, { triggeredBy: 'generalUpdate' });
      }
    } else if (!token) {
      setIsLoading(false);
      setMyNotes([]); setMyNotesPage(1); setMyNotesTotalPages(1); setMyNotesTotalCount(0);
      setSharedNotes([]); setSharedNotesPage(1); setSharedNotesTotalPages(1); setSharedNotesTotalCount(0);
      setArchivedNotes([]); setArchivedNotesPage(1); setArchivedNotesTotalPages(1); setArchivedNotesTotalCount(0);
      initialFetchDone.current = false;
      isFetchingRef.current = false;
    }
  }, [token, myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy, notesVersion, fetchNotes]);


  // Effect specifically for new shared notes, triggered by newSharedItemCounter
  useEffect(() => {
    if (token && initialFetchDone.current && newSharedItemCounter > newSharedItemCounterRef.current && !isFetchingRef.current) {
      console.log("[DashboardClient] New shared item counter changed. Old:", newSharedItemCounterRef.current, "New:", newSharedItemCounter, ". Fetching page 1 of shared notes.");
      // Fetch page 1 of shared notes, keep other tabs on their current page/sort
      fetchNotes(myNotesPage, 1, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy, { triggeredBy: 'newSharedItem' });
      setSharedNotesPage(1); 
    }
    newSharedItemCounterRef.current = newSharedItemCounter;
  }, [newSharedItemCounter, token, fetchNotes, myNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy]); 
  
  const handleCreateNewNote = () => {
    setIsCreateModalOpen(true); 
  };

  const handleNoteCreated = (newNote: Note) => {
    setMyNotesPage(1); 
    router.push(`/notes/${newNote._id}`);
    // notesVersion will be incremented by SocketContext, triggering the general useEffect
  };

  const handleNoteUpdate = useCallback(() => {
    // notesVersion change in SocketContext will trigger the general useEffect
    console.log("[DashboardClient] handleNoteUpdate called. Refresh will be triggered by notesVersion change.");
  }, []); 

  // Effect to listen for socket events (for logging or specific UI cues if needed)
  useEffect(() => {
    if (socket && user) {
      const logNewSharedNote = (note: any) => console.log('[DashboardClient] Socket event: newSharedNote received (for logging)', note);
      const logNoteSharingUpdated = (updatedNote: any) => console.log('[DashboardClient] Socket event: noteSharingUpdated received (for logging)', updatedNote);
      const logNoteUnshared = (data: any) => console.log('[DashboardClient] Socket event: noteUnshared received (for logging)', data);

      socket.on('newSharedNote', logNewSharedNote);
      socket.on('noteSharingUpdated', logNoteSharingUpdated);
      socket.on('noteUnshared', logNoteUnshared);
      console.log('[DashboardClient] Subscribed to socket events for logging. Data refresh via notesVersion/newSharedItemCounter.');

      return () => {
        socket.off('newSharedNote', logNewSharedNote);
        socket.off('noteSharingUpdated', logNoteSharingUpdated);
        socket.off('noteUnshared', logNoteUnshared);
        console.log('[DashboardClient] Unsubscribed from socket events for logging.');
      };
    }
  }, [socket, user]);

  const handleMyNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= myNotesTotalPages) setMyNotesPage(newPage);
  };

  const handleSharedNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= sharedNotesTotalPages) setSharedNotesPage(newPage);
  };

  const handleArchivedNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= archivedNotesTotalPages) setArchivedNotesPage(newPage);
  };

  const handleMyNotesSortChange = (sortValue: string) => {
    setMyNotesSortBy(sortValue); setMyNotesPage(1);
  };

  const handleSharedNotesSortChange = (sortValue: string) => {
    setSharedNotesSortBy(sortValue); setSharedNotesPage(1);
  };

  const handleArchivedNotesSortChange = (sortValue: string) => {
    setArchivedNotesSortBy(sortValue); setArchivedNotesPage(1);
  };

  const filteredMyNotes = useMemo(() => {
    if (!myNotes) return [];
    return myNotes.filter(note => 
      !note.isArchived && // Ensure not archived
      user && (typeof note.creator === 'string' ? note.creator === user._id : note.creator?._id === user._id) && // Belongs to user
      note.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [myNotes, searchTerm, user]);

  const filteredSharedNotes = useMemo(() => {
    if (!sharedNotes) return [];
    return sharedNotes.filter(note => 
      !note.isArchived && // Ensure not archived
      user && 
      note.sharedWith.some(s => (typeof s.userId === 'string' ? s.userId === user._id : (s.userId as User)?._id === user._id)) && // Shared with user
      (typeof note.creator === 'string' ? note.creator !== user._id : note.creator?._id !== user._id) && // Not created by user
      note.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sharedNotes, searchTerm, user]);

  const filteredArchivedNotes = useMemo(() => {
    if (!archivedNotes) return [];
    return archivedNotes.filter(note => 
      note.isArchived && // Ensure archived
      user && (typeof note.creator === 'string' ? note.creator === user._id : note.creator?._id === user._id) && // Belongs to user
      note.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [archivedNotes, searchTerm, user]);


  if (isLoading && !initialFetchDone.current) { // Show loading only on initial full load
    return <div className="flex justify-center items-center h-screen"><p className="text-lg">Loading your Wavenet dashboard...</p></div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={handleCreateNewNote}>
          <PlusCircle className="mr-2 h-4 w-4" /> Create New Note
        </Button>
      </div>

      <CreateNoteModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onNoteCreated={handleNoteCreated}
      />

      <div className="mb-6 relative">
        <Input 
          type="search" 
          placeholder="Search all notes by title..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2 lg:w-1/3" 
        />
      </div>

      <Tabs defaultValue="active" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="active">My Notes ({myNotesTotalCount})</TabsTrigger>
          <TabsTrigger value="shared">Shared With Me ({sharedNotesTotalCount})</TabsTrigger>
          <TabsTrigger value="archived">Archived Notes ({archivedNotesTotalCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">My Notes</h2>
              <Select value={myNotesSortBy} onValueChange={handleMyNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm"><ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" /><SelectValue /></SelectTrigger>
                <SelectContent>{sortOptions.map(option => <SelectItem key={option.value} value={option.value} className="text-sm">{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {isLoading && <p>Loading My Notes...</p>}
            {!isLoading && filteredMyNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMyNotes.map((note) => (
                  <NoteItem 
                    key={note._id} 
                    note={note} 
                    currentTab="myNotes" 
                    onNoteUpdate={handleNoteUpdate} 
                    onNoteDeleted={(id) => handleNoteDeletedClientSide(id, 'myNotes')}
                    onNoteArchiveStatusChanged={handleNoteArchiveStatusChangedClientSide}
                  />
                ))}
              </div>
            ) : !isLoading && (<p>You haven&apos;t created any notes yet, or no notes match your search.</p>)}
            {myNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button variant="outline" size="sm" onClick={() => handleMyNotesPageChange(myNotesPage - 1)} disabled={myNotesPage <= 1}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button>
                <span className="text-sm text-muted-foreground">Page {myNotesPage} of {myNotesTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => handleMyNotesPageChange(myNotesPage + 1)} disabled={myNotesPage >= myNotesTotalPages}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="shared">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Shared With Me</h2>
              <Select value={sharedNotesSortBy} onValueChange={handleSharedNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm"><ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" /><SelectValue /></SelectTrigger>
                <SelectContent>{sortOptions.map(option => <SelectItem key={option.value} value={option.value} className="text-sm">{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {isLoading && <p>Loading Shared Notes...</p>}
            {!isLoading && filteredSharedNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSharedNotes.map((note) => (
                  <NoteItem key={note._id} note={note} showCreator={true} currentTab="sharedNotes" onNoteUpdate={handleNoteUpdate} />
                ))}
              </div>
            ) : !isLoading && (<p>No notes have been shared with you yet, or no notes match your search.</p>)}
            {sharedNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button variant="outline" size="sm" onClick={() => handleSharedNotesPageChange(sharedNotesPage - 1)} disabled={sharedNotesPage <= 1}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button>
                <span className="text-sm text-muted-foreground">Page {sharedNotesPage} of {sharedNotesTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => handleSharedNotesPageChange(sharedNotesPage + 1)} disabled={sharedNotesPage >= sharedNotesTotalPages}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            )}
          </section>
        </TabsContent>
        
        <TabsContent value="archived">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Archived Notes</h2>
              <Select value={archivedNotesSortBy} onValueChange={handleArchivedNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm"><ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" /><SelectValue /></SelectTrigger>
                <SelectContent>{sortOptions.map(option => <SelectItem key={option.value} value={option.value} className="text-sm">{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {isLoading && <p>Loading Archived Notes...</p>}
            {!isLoading && filteredArchivedNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredArchivedNotes.map((note) => (
                  <NoteItem 
                    key={note._id} 
                    note={note} 
                    currentTab="archivedNotes" 
                    onNoteUpdate={handleNoteUpdate} 
                    onNoteDeleted={(id) => handleNoteDeletedClientSide(id, 'archivedNotes')}
                    onNoteArchiveStatusChanged={handleNoteArchiveStatusChangedClientSide}
                  />
                ))}
              </div>
            ) : !isLoading && (<p>You have no archived notes, or no notes match your search.</p>)}
            {archivedNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button variant="outline" size="sm" onClick={() => handleArchivedNotesPageChange(archivedNotesPage - 1)} disabled={archivedNotesPage <= 1}><ChevronLeft className="h-4 w-4 mr-1" />Previous</Button>
                <span className="text-sm text-muted-foreground">Page {archivedNotesPage} of {archivedNotesTotalPages}</span>
                <Button variant="outline" size="sm" onClick={() => handleArchivedNotesPageChange(archivedNotesPage + 1)} disabled={archivedNotesPage >= archivedNotesTotalPages}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardClient;
