'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext'; // Corrected useAuth import path
import api from '@/lib/api';
import { Note } from '@/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'; // Added ArrowUpDown
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
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); 

  const fetchNotes = useCallback(async ( 
    myPage: number = 1, 
    sharedPage: number = 1,
    mySort: string = myNotesSortBy,
    sharedSort: string = sharedNotesSortBy 
  ) => {
    if (!token) return;
    setIsLoading(true);

    const [mySortField, mySortOrder] = mySort.split('_');
    const [sharedSortField, sharedSortOrder] = sharedSort.split('_');

    try {
      const [myNotesRes, sharedNotesRes] = await Promise.all([
        api.get(`/notes/mynotes?page=${myPage}&limit=${NOTES_PER_PAGE}&sortBy=${mySortField}&sortOrder=${mySortOrder}`),
        api.get(`/notes/sharedwithme?page=${sharedPage}&limit=${NOTES_PER_PAGE}&sortBy=${sharedSortField}&sortOrder=${sharedSortOrder}`),
      ]);
      
      setMyNotes(myNotesRes.data.notes);
      setMyNotesTotalPages(myNotesRes.data.totalPages);
      setMyNotesPage(myNotesRes.data.currentPage);
      setMyNotesTotalCount(myNotesRes.data.totalNotes);

      setSharedNotes(sharedNotesRes.data.notes);
      setSharedNotesTotalPages(sharedNotesRes.data.totalPages);
      setSharedNotesPage(sharedNotesRes.data.currentPage);
      setSharedNotesTotalCount(sharedNotesRes.data.totalNotes);

    } catch (error) {
      console.error('Failed to fetch notes:', error);
      toast({
        title: 'Error fetching notes',
        description: 'Could not load your notes. Please try again later.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  }, [token, toast, myNotesSortBy, sharedNotesSortBy]);

  useEffect(() => {
    fetchNotes(myNotesPage, sharedNotesPage, myNotesSortBy, sharedNotesSortBy);
  }, [fetchNotes, myNotesPage, sharedNotesPage, myNotesSortBy, sharedNotesSortBy]); 

  const handleCreateNewNote = () => {
    setIsCreateModalOpen(true); // Open the modal
    // router.push('/notes/new'); // Remove direct navigation if modal is used
    // toast({ title: 'Note Creation', description: 'Navigate to new note page (placeholder)'}); // Remove toast if modal is used
  };

  const handleNoteCreated = (newNote: Note) => {
    setMyNotesPage(1); 
    fetchNotes(1, sharedNotesPage, myNotesSortBy, sharedNotesSortBy); 
    router.push(`/notes/${newNote._id}`);
  };

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

  const handleMyNotesSortChange = (sortValue: string) => {
    setMyNotesSortBy(sortValue);
    setMyNotesPage(1); // Reset to page 1 when sort changes
  };

  const handleSharedNotesSortChange = (sortValue: string) => {
    setSharedNotesSortBy(sortValue);
    setSharedNotesPage(1); // Reset to page 1 when sort changes
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
        onNoteCreated={handleNoteCreated} // Use the new handler
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
            <div className="space-y-4">
              {myNotes.map((note) => (
                <NoteItem key={note._id} note={note} /> // Used NoteItem component
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
            <div className="space-y-4">
              {sharedNotes.map((note) => (
                <NoteItem key={note._id} note={note} showCreator={true} /> // Used NoteItem component and showCreator prop
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
      </div>
    </div>
  );
};

export default DashboardClient;
