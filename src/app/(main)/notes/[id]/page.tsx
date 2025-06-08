'use client';

import React from 'react';
import NoteEditor from '@/components/notes/NoteEditor';
import { useParams } from 'next/navigation';

const NotePage = () => {
  const params = useParams();
  const noteId = params?.id as string | undefined;

  if (!noteId) {
    // This case should ideally be handled by routing or a specific error component
    // For example, if the route is /notes/new, this page shouldn't be rendered.
    // Or, if ID is somehow missing from a valid route, show an error.
    return <p>Note ID not found.</p>;
  }

  // Handle the 'new' case specifically, or pass it to NoteEditor if it can handle it.
  // For now, assuming NoteEditor will fetch or determine if it's a new note based on ID.
  return <NoteEditor noteId={noteId} />;
};

export default NotePage;
