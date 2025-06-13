import api from "@/lib/api";
import { Note } from "@/types";

// Define a type for the search results, which might be slightly different
// or include a score if the backend provides it. For now, assume it's Note[].
export interface SearchNoteResult extends Note {
  // Add any search-specific fields if necessary, e.g., score
}

export const searchNotes = async (
  query: string
): Promise<SearchNoteResult[]> => {
  try {
    const response = await api.get<SearchNoteResult[]>(
      `/notes/search?q=${encodeURIComponent(query)}`
    );
    // The backend returns an array of notes directly.
    // So, response.data should be SearchNoteResult[]
    return response.data;
  } catch (error) {
    console.error("Error searching notes:", error);
    throw error; // Re-throw to be handled by the caller
  }
};

// Add other note service functions here as needed (create, update, delete, get by ID, etc.)
// For example:
/*
export const getNoteById = async (id: string): Promise<Note> => {
  const response = await api.get<Note>(`/notes/${id}`);
  return response.data;
};

export const createNote = async (noteData: Partial<Note>): Promise<Note> => {
  const response = await api.post<Note>('/notes', noteData);
  return response.data;
};

export const updateNote = async (id: string, noteData: Partial<Note>): Promise<Note> => {
  const response = await api.put<Note>(`/notes/${id}`, noteData);
  return response.data;
};

export const deleteNote = async (id: string): Promise<void> => {
  await api.delete(`/notes/${id}`);
};

export const archiveNote = async (id: string): Promise<Note> => {
  const response = await api.put<Note>(`/notes/${id}/archive`);
  return response.data;
};

export const unarchiveNote = async (id: string): Promise<Note> => {
  const response = await api.put<Note>(`/notes/${id}/unarchive`);
  return response.data;
};

export const shareNote = async (id: string, email: string, role: 'read' | 'write'): Promise<Note> => {
  const response = await api.post<Note>(`/notes/${id}/share`, { email, role });
  return response.data;
};

export const unshareNote = async (id: string, userIdToUnshare: string): Promise<Note> => {
  const response = await api.delete<Note>(`/notes/${id}/share/${userIdToUnshare}`);
  return response.data;
};
*/
