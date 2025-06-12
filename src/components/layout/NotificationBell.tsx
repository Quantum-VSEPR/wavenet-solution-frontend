'use client';

import React, { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePathname } from 'next/navigation'; // Import usePathname

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname(); // Get current pathname

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 w-4 min-w-0 justify-center rounded-full p-0.5 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 md:w-96">
        <DropdownMenuLabel className="flex justify-between items-center">
          <span>Notifications</span>
          {notifications.length > 0 && (
            <Button variant="link" size="sm" onClick={handleMarkAllAsRead} className="p-0 h-auto text-xs">
              Mark all as read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <DropdownMenuItem disabled className="text-center text-muted-foreground py-4">
            No new notifications
          </DropdownMenuItem>
        ) : (
          <ScrollArea className="h-[300px]">
            {notifications.map((notification) => {
              let finalActionLink = notification.actionLink;
              // If the notification's actionLink is the current page, append a refresh query param
              if (notification.actionLink && pathname.startsWith(notification.actionLink)) {
                finalActionLink = `${notification.actionLink}?refresh=${Date.now()}`;
              }

              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex flex-col items-start p-2 hover:bg-muted/50 ${notification.read ? 'opacity-70' : ''}`}
                  onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                >
                  <div className="flex justify-between w-full items-center">
                    <span className={`font-medium text-sm ${notification.type === 'error' ? 'text-destructive' : notification.type === 'success' ? 'text-green-600' : 'text-foreground'}`}>
                        {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}
                    </span>
                    {!notification.read && <CheckCheck className="h-4 w-4 text-blue-500 ml-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notification.id);}}/>}
                  </div> 
                  <p className="text-xs text-muted-foreground whitespace-normal break-words">
                    {notification.message}
                  </p>
                  {notification.actionLink && notification.actionable && !notification.isArchived && (
                    <Link 
                      href={`${notification.actionLink}${notification.refreshKey ? `?refresh=${notification.refreshKey}` : ''}`}
                      className="text-blue-500 hover:underline mt-1 block"
                      onClick={() => setIsOpen(false)}
                    >
                      View Note
                    </Link>
                  )}
                  {/* Show (Note is archived) if the notification is related to a note and it is archived, regardless of actionability */}
                  {notification.actionLink && notification.isArchived && (
                    <span className="text-xs text-muted-foreground mt-1">
                      (Note is archived)
                    </span>
                  )}
                  {/* Show (Access revoked) if the notification had an actionLink but is no longer actionable and not archived */}
                  {notification.actionLink && !notification.actionable && !notification.isArchived && (
                    <span className="text-xs text-muted-foreground mt-1">
                      (Access revoked or action not applicable)
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground/70 mt-1 self-end">
                    {new Date(notification.timestamp).toLocaleTimeString()} - {new Date(notification.timestamp).toLocaleDateString()}
                  </span>
                   <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => {e.stopPropagation(); removeNotification(notification.id);}}>
                      &times;
                  </Button>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
