import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Bell, BellOff, AlertTriangle, Coffee, Clock } from "lucide-react";

// Request notification permission
const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    return false;
  }
  
  if (Notification.permission === "granted") {
    return true;
  }
  
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  
  return false;
};

// Show browser notification
const showNotification = (title, body, icon = "/favicon.ico") => {
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon,
      badge: icon,
      vibrate: [200, 100, 200],
      tag: "break-reminder"
    });
  }
};

// Hook for notification management
export const useNotifications = () => {
  const { token, user } = useAuth();
  const { i18n } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [checking, setChecking] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  // Initialize notifications
  useEffect(() => {
    const init = async () => {
      const granted = await requestNotificationPermission();
      setEnabled(granted);
    };
    init();
  }, []);

  // Check for notifications periodically
  const checkNotifications = useCallback(async () => {
    if (!token || checking) return;
    
    setChecking(true);
    try {
      const response = await axios.get(`${API}/notifications/check`, { headers });
      const newNotifications = response.data.notifications || [];
      
      // Show browser notifications for new items
      newNotifications.forEach(notif => {
        const title = i18n.language === "de" ? notif.title : notif.title_en;
        const message = i18n.language === "de" ? notif.message : notif.message_en;
        
        if (enabled) {
          showNotification(title, message);
        }
        
        // Also show toast
        if (notif.priority === "high") {
          toast.warning(message, { duration: 10000 });
        } else {
          toast.info(message);
        }
      });
      
      setNotifications(newNotifications);
    } catch (error) {
      console.error("Failed to check notifications:", error);
    } finally {
      setChecking(false);
    }
  }, [token, enabled, i18n.language, checking]);

  // Auto-check every 5 minutes
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(checkNotifications, 5 * 60 * 1000);
    
    // Initial check
    checkNotifications();
    
    return () => clearInterval(interval);
  }, [token, checkNotifications]);

  return {
    enabled,
    notifications,
    checkNotifications,
    requestPermission: requestNotificationPermission
  };
};

// Notification Bell Component
const NotificationBell = () => {
  const { enabled, notifications, checkNotifications, requestPermission } = useNotifications();
  const { t } = useTranslation();

  const handleClick = async () => {
    if (!enabled) {
      const granted = await requestPermission();
      if (granted) {
        toast.success("Benachrichtigungen aktiviert");
      } else {
        toast.error("Benachrichtigungen blockiert");
      }
    } else {
      checkNotifications();
    }
  };

  const hasWarnings = notifications.some(n => n.priority === "high");

  return (
    <button
      onClick={handleClick}
      className="relative p-2 rounded-lg hover:bg-accent transition-colors"
      data-testid="notification-bell"
      title={enabled ? "Benachrichtigungen aktiv" : "Benachrichtigungen aktivieren"}
    >
      {enabled ? (
        <Bell className={`w-5 h-5 ${hasWarnings ? 'text-warning' : 'text-muted-foreground'}`} />
      ) : (
        <BellOff className="w-5 h-5 text-muted-foreground" />
      )}
      
      {notifications.length > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] font-bold flex items-center justify-center text-destructive-foreground">
          {notifications.length}
        </span>
      )}
    </button>
  );
};

// Notification List Component
export const NotificationList = ({ notifications }) => {
  const { i18n } = useTranslation();

  const getIcon = (type) => {
    switch (type) {
      case "break_reminder":
        return <Coffee className="w-5 h-5 text-primary" />;
      case "weekly_limit":
        return <Clock className="w-5 h-5 text-warning" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="notification-list">
      {notifications.map((notif, idx) => (
        <div 
          key={idx}
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            notif.priority === "high" 
              ? "bg-warning/10 border-warning/30" 
              : "bg-muted/50 border-border"
          }`}
        >
          {getIcon(notif.type)}
          <div>
            <p className="font-medium">
              {i18n.language === "de" ? notif.title : notif.title_en}
            </p>
            <p className="text-sm text-muted-foreground">
              {i18n.language === "de" ? notif.message : notif.message_en}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationBell;
