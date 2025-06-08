'use client';

import React from 'react';
import { Note } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext'; // Corrected useAuth import path

interface NoteItemProps {
  note: Note;
  showCreator?: boolean; // Optional: to show creator email, useful for shared notes
}

const NoteItem: React.FC<NoteItemProps> = ({ note, showCreator = false }) => {
  const router = useRouter();
  const { user } = useAuth(); // Get current user

  const handleViewNote = () => {
    router.push(`/notes/${note._id}`);
  };

  const isOwner = typeof note.creator === 'string' ? note.creator === user?._id : note.creator._id === user?._id;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="truncate">{note.title}</CardTitle>
        {showCreator && typeof note.creator !== 'string' && (
          <p className="text-xs text-muted-foreground">By: {note.creator.email}</p>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground break-words line-clamp-3">
          {note.content || 'No content'}
        </p>
      </CardContent>
      <CardFooter className="flex justify-between items-center"> {/* Adjusted alignment */}
        <div>
          {/* Placeholder for note role or other badges */}
          {isOwner ? <Badge variant="outline">Owner</Badge> : <Badge variant="secondary">Shared</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={handleViewNote}>
          View Note
        </Button>
      </CardFooter>
    </Card>
  );
};

export default NoteItem;
