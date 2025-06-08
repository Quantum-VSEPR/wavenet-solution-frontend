'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext'; // Corrected useAuth import path
import api from '@/lib/api';
import { Note } from '@/types';
import { Button } from '@/components/ui/button';
// Removed Archive, Unarchive icons as they are not used yet
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
  const { token } = useAuth(); 
  const router = useRouter();
  const { toast } = useToast();
  
  const [myNotes, setMyNotes] = useState<Note[]>([]);
  const [myNotesPage, setMyNotesPage] = useState(1);
  const [myNotesTotalPages, setMyNotesTotalPages] = useState(1);
  const [myNotesTotalCount, setMyNotesTotalCount] = useState(0);
  const [myNotesSortBy, setMyNotesSortBy] = useState<string>(sortOptions[0].value); // Default sort

  const [sharedNotes, setSharedNotes] = useState<Note[]>([]);
  const [sharedNotesPage, setSharedNotesPage] = useState(1);
  const [sharedNotesTotalPages, setSharedNotesTotalPages] = useState(1);
  const [sharedNotesTotalCount, setSharedNotesTotalCount] = useState(0);
  const [sharedNotesSortBy, setSharedNotesSortBy] = useState<string>(sortOptions[0].value); // Default sort

  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
  const [archivedNotesPage, setArchivedNotesPage] = useState(1);
  const [archivedNotesTotalPages, setArchivedNotesTotalPages] = useState(1);
  const [archivedNotesTotalCount, setArchivedNotesTotalCount] = useState(0);
  const [archivedNotesSortBy, setArchivedNotesSortBy] = useState<string>(sortOptions[0].value); // Default sort
  
  const [isLoading, setIsLoading] = useState(true); // Initialize isLoading to true
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); 

  const fetchNotes = useCallback(async ( 
    myPageToFetch: number,
    sharedPageToFetch: number,
    archivedPageToFetch: number,
    mySortToUse: string,
    sharedSortToUse: string,
    archivedSortToUse: string 
  ) => {
    if (!token) {
      setIsLoading(false); 
      setMyNotes([]);
      setMyNotesPage(1);
      setMyNotesTotalPages(1);
      setMyNotesTotalCount(0);
      setSharedNotes([]);
      setSharedNotesPage(1);
      setSharedNotesTotalPages(1);
      setSharedNotesTotalCount(0);
      setArchivedNotes([]);
      setArchivedNotesPage(1);
      setArchivedNotesTotalPages(1);
      setArchivedNotesTotalCount(0);
      return; 
    }
    setIsLoading(true); 

    const [mySortField, mySortOrder] = mySortToUse.split('_');
    const [sharedSortField, sharedSortOrder] = sharedSortToUse.split('_');
    const [archivedSortField, archivedSortOrder] = archivedSortToUse.split('_');

    // Use Promise.allSettled or map promises to handle individual errors
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

    // The setIsLoading(false) was moved up to ensure it's called once after Promise.all
    const myNotesResult = results.find(r => r.type === 'myNotes');
    if (myNotesResult && myNotesResult.status === 'fulfilled') {
      const { data } = myNotesResult.value;
      console.log('My Notes API Response Data:', data); // Added console.log
      setMyNotes(data.notes);
      setMyNotesTotalPages(data.totalPages);
      setMyNotesPage(data.currentPage);
      setMyNotesTotalCount(data.totalNotes);
    } else if (myNotesResult && myNotesResult.status === 'rejected') {
      console.error('Failed to fetch my notes:', myNotesResult.reason);
      setMyNotes([]);
      setMyNotesTotalPages(1);
      setMyNotesPage(1);
      setMyNotesTotalCount(0);
      toast({
        title: 'Error fetching My Notes',
        description: myNotesResult.reason?.response?.data?.message || 'Could not load your notes.',
        variant: 'destructive',
      });
    }

    const sharedNotesResult = results.find(r => r.type === 'sharedNotes');
    if (sharedNotesResult && sharedNotesResult.status === 'fulfilled') {
      const { data } = sharedNotesResult.value;
      console.log('Shared Notes API Response Data:', data); // Added console.log
      setSharedNotes(data.notes);
      setSharedNotesTotalPages(data.totalPages);
      setSharedNotesPage(data.currentPage);
      setSharedNotesTotalCount(data.totalNotes);
    } else if (sharedNotesResult && sharedNotesResult.status === 'rejected') {
      console.error('Failed to fetch shared notes:', sharedNotesResult.reason);
      setSharedNotes([]);
      setSharedNotesTotalPages(1);
      setSharedNotesPage(1);
      setSharedNotesTotalCount(0);
      toast({
        title: 'Error fetching Shared Notes',
        description: sharedNotesResult.reason?.response?.data?.message || 'Could not load notes shared with you.',
        variant: 'destructive',
      });
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
      setArchivedNotes([]);
      setArchivedNotesTotalPages(1);
      setArchivedNotesPage(1);
      setArchivedNotesTotalCount(0);
      toast({
        title: 'Error fetching Archived Notes',
        description: archivedNotesResult.reason?.response?.data?.message || 'Could not load archived notes.',
        variant: 'destructive',
      });
    }
    setIsLoading(false); 
  }, [token, toast]); // Simplified dependencies for fetchNotes

  useEffect(() => {
    if (token) {
      // When any of these dependencies change, fetchNotes will be called.
      fetchNotes(myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy);
    } else {
      setIsLoading(false);
      setMyNotes([]);
      setMyNotesPage(1);
      setMyNotesTotalPages(1);
      setMyNotesTotalCount(0);
      setSharedNotes([]);
      setSharedNotesPage(1);
      setSharedNotesTotalPages(1);
      setSharedNotesTotalCount(0);
      setArchivedNotes([]);
      setArchivedNotesPage(1);
      setArchivedNotesTotalPages(1);
      setArchivedNotesTotalCount(0);
    }
    // The dependencies array for this useEffect ensures that fetchNotes is called
    // whenever the token changes, or when page/sort parameters change, triggering a re-fetch.
  }, [token, myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy, fetchNotes]);

  const handleCreateNewNote = () => {
    setIsCreateModalOpen(true); 
  };

  const handleNoteCreated = (newNote: Note) => {
    // After creating a note, it should appear in "My Notes". 
    // Reset "My Notes" to page 1. The useEffect will handle fetching.
    setMyNotesPage(1); 
    router.push(`/notes/${newNote._id}`);
  };

  // This function is passed to NoteItem. When called, it will trigger fetchNotes
  // with the current state values for pagination and sorting.
  const handleNoteUpdate = useCallback(() => {
    fetchNotes(myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy);
  }, [fetchNotes, myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy]);

  const handleMyNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= myNotesTotalPages) {
      setMyNotesPage(newPage);
    }
  };

  const handleSharedNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= sharedNotesTotalPages) {
      setSharedNotesPage(newPage);
    }
  };

  const handleArchivedNotesPageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= archivedNotesTotalPages) {
      setArchivedNotesPage(newPage);
    }
  };

  const handleMyNotesSortChange = (sortValue: string) => {
    setMyNotesSortBy(sortValue);
    setMyNotesPage(1); // Reset to page 1 when sort changes
  };

  const handleSharedNotesSortChange = (sortValue: string) => {
    setSharedNotesSortBy(sortValue);
    setSharedNotesPage(1); // Reset to page 1 when sort changes
  };

  const handleArchivedNotesSortChange = (sortValue: string) => {
    setArchivedNotesSortBy(sortValue);
    setArchivedNotesPage(1); // Reset to page 1 when sort changes
  };

  if (isLoading) {
    return <p>Loading notes...</p>;
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

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="active">My Notes</TabsTrigger>
          <TabsTrigger value="shared">Shared With Me</TabsTrigger>
          <TabsTrigger value="archived">Archived Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">My Notes ({myNotesTotalCount})</h2>
              <Select value={myNotesSortBy} onValueChange={handleMyNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm">
                  <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {myNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myNotes.map((note) => (
                  <NoteItem 
                    key={note._id} 
                    note={note} 
                    currentTab="myNotes" 
                    onNoteUpdate={handleNoteUpdate} // Pass the stable callback
                  />
                ))}
              </div>
            ) : (
              <p>You haven&apos;t created any notes yet.</p>
            )}
            {myNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMyNotesPageChange(myNotesPage - 1)}
                  disabled={myNotesPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {myNotesPage} of {myNotesTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleMyNotesPageChange(myNotesPage + 1)}
                  disabled={myNotesPage >= myNotesTotalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="shared">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Shared With Me ({sharedNotesTotalCount})</h2>
              <Select value={sharedNotesSortBy} onValueChange={handleSharedNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm">
                  <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {sharedNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sharedNotes.map((note) => (
                  <NoteItem 
                    key={note._id} 
                    note={note} 
                    showCreator={true} 
                    currentTab="sharedNotes" 
                    onNoteUpdate={handleNoteUpdate} // Pass the stable callback
                  />
                ))}
              </div>
            ) : (
              <p>No notes have been shared with you yet.</p>
            )}
            {sharedNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSharedNotesPageChange(sharedNotesPage - 1)}
                  disabled={sharedNotesPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {sharedNotesPage} of {sharedNotesTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSharedNotesPageChange(sharedNotesPage + 1)}
                  disabled={sharedNotesPage >= sharedNotesTotalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </section>
        </TabsContent>
        
        <TabsContent value="archived">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Archived Notes ({archivedNotesTotalCount})</h2>
              <Select value={archivedNotesSortBy} onValueChange={handleArchivedNotesSortChange}>
                <SelectTrigger className="w-[220px] text-sm">
                  <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-sm">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {archivedNotes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archivedNotes.map((note) => (
                  <NoteItem 
                    key={note._id} 
                    note={note} 
                    currentTab="archivedNotes" 
                    onNoteUpdate={handleNoteUpdate} // Pass the stable callback
                  /> 
                ))}
              </div>
            ) : (
              <p>You have no archived notes.</p>
            )}
            {archivedNotesTotalPages > 1 && (
              <div className="flex justify-center items-center mt-6 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchivedNotesPageChange(archivedNotesPage - 1)}
                  disabled={archivedNotesPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {archivedNotesPage} of {archivedNotesTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchivedNotesPageChange(archivedNotesPage + 1)}
                  disabled={archivedNotesPage >= archivedNotesTotalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardClient;
