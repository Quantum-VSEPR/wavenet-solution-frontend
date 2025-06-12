import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5001";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"], // Explicitly define transports
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
    console.log("Socket disconnected manually");
  }
  socket = null;
};

export const registerSocketUser = (userId: string) => {
  if (socket && socket.connected && userId) {
    socket.emit("registerUser", userId);
    console.log(`[socket.ts] Emitted 'registerUser' for userId: ${userId}`);
  } else {
    console.warn(
      "[socket.ts] Socket not connected or userId not provided for registerSocketUser"
    );
  }
};

export const joinNoteRoom = (noteId: string) => {
  if (socket && socket.connected && noteId) {
    socket.emit("joinNoteRoom", noteId);
    console.log(`[socket.ts] Emitted 'joinNoteRoom' for noteId: ${noteId}`);
  }
};

export const leaveNoteRoom = (noteId: string) => {
  if (socket && socket.connected && noteId) {
    socket.emit("leaveNoteRoom", noteId);
    console.log(`[socket.ts] Emitted 'leaveNoteRoom' for noteId: ${noteId}`);
  }
};

export const emitNoteContentChange = (
  noteId: string,
  content: string,
  updatedBy: string
) => {
  if (socket && socket.connected) {
    socket.emit("noteContentChange", { noteId, content, updatedBy });
  }
};

export const emitUserStartedEditing = (
  noteId: string,
  userId: string,
  username: string
) => {
  if (socket && socket.connected) {
    socket.emit("userStartedEditingNote", { noteId, userId, username });
  }
};

export const emitUserStoppedEditing = (
  noteId: string,
  userId: string,
  username: string
) => {
  if (socket && socket.connected) {
    socket.emit("userStoppedEditingNote", { noteId, userId, username });
  }
};
