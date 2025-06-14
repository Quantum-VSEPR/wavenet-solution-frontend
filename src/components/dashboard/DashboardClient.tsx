'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext'; // Corrected useAuth import path
import { useSocket } from '@/contexts/SocketContext'; // Added useSocket import
import api from '@/lib/api';
import { Note } from '@/types';
import { Button } from '@/components/ui/button';
// Removed Archive, Unarchive icons as they are not used yet
import { PlusCircle, ChevronLeft, ChevronRight, ArrowUpDown, Search, Loader2 } from 'lucide-react'; // Added Search and Loader2 icons
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
import { searchNotes, SearchNoteResult } from "@/services/noteService"; // Added searchNotes service

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
  const { socket } = useSocket(); // Get socket instance
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchNoteResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const results = await searchNotes(query);
        setSearchResults(results);
      } catch (error: any) { // Add :any to error type for now to access response
        console.error("Search failed in DashboardClient:", error);
        // Log more details if available from the error object
        if (error.response) {
          console.error("Search error response:", error.response.data);
          console.error("Search error status:", error.response.status);
          console.error("Search error headers:", error.response.headers);
        } else if (error.request) {
          console.error("Search error request:", error.request);
        } else {
          console.error("Search error message:", error.message);
        }
        toast({
          title: "Search Failed",
          description: "Could not fetch search results.",
          variant: "destructive",
        });
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 500), // 500ms debounce delay
    [toast] // toast is a stable dependency from useToast
  );

  useEffect(() => {
    if (searchQuery.trim()) {
      debouncedSearch(searchQuery);
    }
    // Cleanup function to cancel any pending debounced calls if the component unmounts
    // or if searchQuery changes rapidly before the debounce delay.
    return () => {
      debouncedSearch.cancel(); // Assuming debounce utility provides a cancel method
    };
  }, [searchQuery, debouncedSearch]);


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

    // If there's an active search query, re-trigger the search to include the new note
    if (searchQuery.trim()) {
      debouncedSearch(searchQuery); 
    }

    router.push(`/notes/${newNote._id}`);
  };

  // This function is passed to NoteItem. When called, it will trigger fetchNotes
  // with the current state values for pagination and sorting.
  const handleNoteUpdate = useCallback(() => {
    fetchNotes(myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy);
  }, [fetchNotes, myNotesPage, sharedNotesPage, archivedNotesPage, myNotesSortBy, sharedNotesSortBy, archivedNotesSortBy]);

  // Effect to listen for real-time updates for shared notes
  useEffect(() => {
    if (socket) {
      const realtimeSharedNoteUpdateHandler = (data: { noteId: string; noteTitle: string; sharedByUsername: string; message: string; }) => {
        console.log('[DashboardClient] Received noteSharedWithYou event:', data);
        // We have a notification for this already from SocketContext.
        // Here, we just need to refresh the list of shared notes.
        // Calling handleNoteUpdate will re-fetch all lists, including shared notes.
        handleNoteUpdate();
      };

      socket.on('noteSharedWithYou', realtimeSharedNoteUpdateHandler);
      console.log('[DashboardClient] Subscribed to noteSharedWithYou');

      return () => {
        socket.off('noteSharedWithYou', realtimeSharedNoteUpdateHandler);
        console.log('[DashboardClient] Unsubscribed from noteSharedWithYou');
      };
    }
  }, [socket, handleNoteUpdate]);

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

  const renderPaginationControls = (
    currentPage: number,
    totalPages: number,
    onPageChange: (page: number) => void,
    notesCount: number,
    isLoadingState: boolean
  ) => {
    if (totalPages <= 1) return null; // No pagination needed if only one page

    return (
      <div className="flex justify-center items-center mt-6 space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoadingState}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoadingState}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    );
  };

  const renderSortDropdown = (
    currentSort: string,
    onSortChange: (sortValue: string) => void,
    isLoadingState: boolean
  ) => {
    return (
      <Select value={currentSort} onValueChange={onSortChange} disabled={isLoadingState}>
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
    );
  };
  
  const renderNotesList = (notes: Note[], type: 'my' | 'shared' | 'archived') => {
    if (isLoading) {
      return (
        <div className="col-span-full flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      );
    }

    if (searchQuery.trim() && !isSearching && searchResults.length === 0) {
      return <p className="text-center text-muted-foreground col-span-full">No notes found matching your search.</p>;
    }
    
    const notesToDisplay = searchQuery.trim() ? searchResults : notes;

    if (notesToDisplay.length === 0) {
      return <p className="text-center text-muted-foreground col-span-full">No notes here yet. Create one to get started!</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notesToDisplay.map((note) => (
          <NoteItem 
            key={note._id} 
            note={note} 
            currentTab={type === 'my' ? 'myNotes' : type === 'shared' ? 'sharedNotes' : 'archivedNotes'} 
            onNoteUpdate={handleNoteUpdate} // Pass the stable callback
          />
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6  text-foreground min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Reverted H1 styling */}
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          My Dashboard
        </h1>
        {/* Ensured Button structure is correct for functionality */}
        <Button 
          onClick={handleCreateNewNote} 
          className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 flex items-center space-x-2"
        >
          <PlusCircle className="h-5 w-5" />
          <span>Create New Note</span>
        </Button>
      </div>

      {/* Centered and Styled Search Bar - This part remains as per your previous request */}
      <div className="my-6 flex justify-center">
        <div className="relative w-full max-w-xl lg:max-w-2xl"> {/* Increased max-width */}
          <input
            type="search"
            placeholder="Search all your notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-14 pr-6 rounded-full bg-card/80 border-2 border-border focus:ring-2 focus:ring-accent focus:border-accent outline-none text-foreground placeholder-muted-foreground transition-all duration-300 ease-in-out shadow-lg hover:shadow-xl focus:shadow-2xl text-base" 
          />
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none"> {/* Adjusted padding */}
            <Search className="h-6 w-6 text-muted-foreground" /> {/* Increased icon size */}
          </div>
          {isSearching && (
            <div className="absolute inset-y-0 right-0 pr-5 flex items-center"> {/* Adjusted padding */}
              <Loader2 className="h-6 w-6 animate-spin text-accent" /> {/* Increased icon size */}
            </div>
          )}
        </div>
      </div>
      
      {searchQuery.trim() && !isSearching && (
        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-3 text-center">Search Results ({searchResults.length})</h2>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((noteResult) => (
                <NoteItem 
                  key={noteResult._id} 
                  note={noteResult} 
                  onUpdate={handleNoteUpdate} 
                  // Determine if the note is shared or archived based on its properties for correct actions
                  isSharedWithMe={noteResult.sharedWith?.some(s => s.userId === token) && noteResult.creator !== token} // Example logic
                  isArchived={noteResult.isArchived || false} // Example logic
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">No notes found matching your search criteria.</p>
          )}
        </div>
      )}

      {!searchQuery.trim() && ( // Only show tabs if not searching
        <Tabs defaultValue="my-notes" className="w-full">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto sm:h-12 bg-muted/50 rounded-lg p-1">
            <TabsTrigger value="my-notes" className="py-2.5 text-sm sm:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all duration-200">
              My Notes
            </TabsTrigger>
            <TabsTrigger value="shared" className="py-2.5 text-sm sm:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all duration-200">
              Shared With Me
            </TabsTrigger>
            <TabsTrigger value="archived" className="py-2.5 text-sm sm:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all duration-200">
              Archived Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-notes">
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">My Notes ({myNotesTotalCount})</h2>
                {renderSortDropdown(myNotesSortBy, handleMyNotesSortChange, isLoading)}
              </div>
              {renderNotesList(myNotes, 'my')}
              {renderPaginationControls(myNotesPage, myNotesTotalPages, handleMyNotesPageChange, myNotesTotalCount, isLoading)}
            </section>
          </TabsContent>

          <TabsContent value="shared">
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">Shared With Me ({sharedNotesTotalCount})</h2>
                {renderSortDropdown(sharedNotesSortBy, handleSharedNotesSortChange, isLoading)}
              </div>
              {renderNotesList(sharedNotes, 'shared')}
              {renderPaginationControls(sharedNotesPage, sharedNotesTotalPages, handleSharedNotesPageChange, sharedNotesTotalCount, isLoading)}
            </section>
          </TabsContent>
          
          <TabsContent value="archived">
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold">Archived Notes ({archivedNotesTotalCount})</h2>
                {renderSortDropdown(archivedNotesSortBy, handleArchivedNotesSortChange, isLoading)}
              </div>
              {renderNotesList(archivedNotes, 'archived')}
              {renderPaginationControls(archivedNotesPage, archivedNotesTotalPages, handleArchivedNotesPageChange, archivedNotesTotalCount, isLoading)}
            </section>
          </TabsContent>
        </Tabs>
      )}

      {/* Add the CreateNoteModal here */}
      <CreateNoteModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onNoteCreated={handleNoteCreated} 
      />
    </div>
  );
};

// Basic debounce function (consider using a library like lodash.debounce for more features)
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  // Add a cancel method to the debounced function
  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced as F & { cancel: () => void };
}

export default DashboardClient;
