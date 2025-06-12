'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Notification } from '@/types';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: Notification['type'], noteId?: string, isArchived?: boolean, actionable?: boolean, refreshKey?: string) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: Notification['type'], noteId?: string, isArchived?: boolean, actionable?: boolean, refreshKey?: string) => {
    console.log('[NotificationContext] addNotification called. Message:', message, 'Type:', type, 'NoteID:', noteId, 'IsArchived:', isArchived, 'Actionable:', actionable, 'RefreshKey:', refreshKey);
    const newNotification: Notification = {
      id: uuidv4(),
      message,
      type,
      timestamp: new Date(),
      read: false,
      actionLink: noteId ? `/notes/${noteId}` : undefined,
      actionable: noteId ? (actionable !== undefined ? actionable : true) : false, 
      isArchived, 
      refreshKey: refreshKey || uuidv4(), // Assign provided refreshKey or generate a new one
    };
    setNotifications((prevNotifications) => {
      const updatedNotifications = [newNotification, ...prevNotifications];
      console.log('[NotificationContext] Notifications state updated. New count:', updatedNotifications.length);
      return updatedNotifications;
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prevNotifications) =>
      prevNotifications.filter((notification) => notification.id !== id)
    );
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((notification) => ({ ...notification, read: true }))
    );
  }, []);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  // Log when notifications or unreadCount actually change
  useEffect(() => {
    console.log('[NotificationContext] Notifications state changed. Count:', notifications.length, 'Unread:', unreadCount);
  }, [notifications, unreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        markAsRead,
        markAllAsRead,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
