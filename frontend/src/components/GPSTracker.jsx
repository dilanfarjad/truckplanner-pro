import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { MapPin, Navigation, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GPSTracker = ({ onLocationUpdate, autoTrack = false }) => {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const sendLocationToServer = async (position) => {
    try {
      await axios.post(`${API}/location/update`, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        speed: position.coords.speed ? position.coords.speed * 3.6 : null, // m/s to km/h
        heading: position.coords.heading,
        accuracy: position.coords.accuracy
      }, { headers });
      
      if (onLocationUpdate) {
        onLocationUpdate({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          speed: position.coords.speed ? position.coords.speed * 3.6 : 0,
          heading: position.coords.heading
        });
      }
    } catch (err) {
      console.error("Failed to send location:", err);
    }
  };

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation wird nicht unterstützt");
      toast.error("GPS nicht verfügbar");
      return;
    }

    setTracking(true);
    setError(null);

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          speed: position.coords.speed ? position.coords.speed * 3.6 : 0,
          accuracy: position.coords.accuracy
        });
        sendLocationToServer(position);
      },
      (err) => {
        setError(err.message);
        toast.error("GPS-Fehler: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          speed: position.coords.speed ? position.coords.speed * 3.6 : 0,
          accuracy: position.coords.accuracy
        });
        sendLocationToServer(position);
      },
      (err) => {
        setError(err.message);
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000,
        maximumAge: 5000 // Cache for 5 seconds
      }
    );
  }, [token]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    if (autoTrack) {
      startTracking();
    }
    
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [autoTrack, startTracking]);

  return (
    <div className="space-y-4" data-testid="gps-tracker">
      <div className="flex items-center gap-4">
        <Button
          onClick={tracking ? stopTracking : startTracking}
          variant={tracking ? "destructive" : "default"}
          className="h-14 px-6"
          data-testid="gps-toggle-btn"
        >
          {tracking ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              GPS Stoppen
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5 mr-2" />
              GPS Starten
            </>
          )}
        </Button>
        
        {currentLocation && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-mono">
              {currentLocation.lat.toFixed(5)}, {currentLocation.lon.toFixed(5)}
            </span>
            {currentLocation.speed > 0 && (
              <span className="ml-2 text-secondary">
                {currentLocation.speed.toFixed(0)} km/h
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {tracking && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
          "bg-secondary/10 text-secondary"
        )}>
          <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          GPS-Tracking aktiv
        </div>
      )}
    </div>
  );
};

export default GPSTracker;
