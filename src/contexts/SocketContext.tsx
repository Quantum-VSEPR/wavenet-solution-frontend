"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuth } from './AuthContext'; // Assuming useAuth provides user status
import { useNotifications } from './NotificationContext'; // Added

interface SocketContextType {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const { user, token, isLoading } = useAuth(); // Get user, token, and loading state
  const { addNotification } = useNotifications(); // Added

  const connect = useCallback(() => {
    if (user && token && (!socketInstance || !socketInstance.connected)) {
      console.log("Attempting to connect socket...");
      const newSocket = getSocket();
      setSocketInstance(newSocket);
    }
  }, [user, token, socketInstance]);

  const disconnect = useCallback(() => {
    if (socketInstance) {
      console.log("Attempting to disconnect socket...");
      disconnectSocket();
      setSocketInstance(null);
    }
  }, [socketInstance]);

  useEffect(() => {
    // Wait for auth check to complete
    if (isLoading) {
      return;
    }

    if (user && token) {
      connect();
    } else {
      disconnect();
    }

    // Cleanup on component unmount
    return () => {
      // Disconnect if the component unmounts and the socket is still active
      // This is a general cleanup, specific logic for user logout is handled by `user` and `token` dependency
      if (socketInstance?.connected) {
        disconnect();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, isLoading, socketInstance]); // connect and disconnect are stable due to useCallback without socketInstance in their deps

  // General notification listener
  useEffect(() => {
    if (socketInstance) {
      const handleReceiveNotification = (data: { message: string, type: "info" | "success" | "error" | "warning", noteId?: string }) => {
        addNotification(data.message, data.type, data.noteId);
      };

      socketInstance.on('receiveNotification', handleReceiveNotification);

      return () => {
        socketInstance.off('receiveNotification', handleReceiveNotification);
      };
    }
  }, [socketInstance, addNotification]);

  return (
    <SocketContext.Provider value={{ socket: socketInstance, connect, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
