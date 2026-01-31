import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { 
  X, 
  Coffee, 
  AlertTriangle,
  Navigation,
  Clock,
  MapPin,
  Volume2,
  VolumeX
} from "lucide-react";

/**
 * Fahrmodus-Ansicht
 * 
 * Minimalistischer Bildschirm während der Fahrt
 * Nur 3 Infos: Restlenkzeit, km bis Pause, Warnung
 * 
 * Design-Prinzipien:
 * - Große Schrift
 * - Hoher Kontrast
 * - Keine Ablenkung
 */

const DrivingMode = ({ onClose, currentLocation, destination }) => {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  
  const [displayData, setDisplayData] = useState({
    remaining_time: "-- : --",
    remaining_km: "--",
    warning: null,
    risk_level: "green",
    is_compliant: true
  });
  
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastWarningLevel, setLastWarningLevel] = useState("green");
  
  // Daten alle 10 Sekunden aktualisieren
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${API}/tachograph/driving-mode`, { headers });
        setDisplayData(response.data);
        
        // Akustische Warnung bei Wechsel zu "red"
        if (response.data.risk_level === "red" && lastWarningLevel !== "red" && soundEnabled) {
          playWarningSound();
        }
        setLastWarningLevel(response.data.risk_level);
      } catch (error) {
        console.error("Fahrmodus-Daten Fehler:", error);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10 Sekunden
    
    return () => clearInterval(interval);
  }, [lastWarningLevel, soundEnabled]);
  
  // Akustische Warnung
  const playWarningSound = () => {
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...");
      // Fallback: Browser-Benachrichtigungston
      if ('Notification' in window) {
        new Notification(i18n.language === "de" ? "Pause erforderlich!" : "Break required!");
      }
    } catch (e) {
      console.log("Audio nicht verfügbar");
    }
  };
  
  // Farbe basierend auf Risk Level
  const getRiskColor = () => {
    switch (displayData.risk_level) {
      case "red": return "text-red-500";
      case "yellow": return "text-yellow-500";
      default: return "text-green-500";
    }
  };
  
  const getBgColor = () => {
    switch (displayData.risk_level) {
      case "red": return "bg-red-500/10 border-red-500/50";
      case "yellow": return "bg-yellow-500/10 border-yellow-500/50";
      default: return "bg-green-500/10 border-green-500/50";
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      data-testid="driving-mode"
    >
      {/* Header - Minimal */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Navigation className="w-8 h-8 text-primary" />
          <span className="text-xl font-bold text-white">
            {i18n.language === "de" ? "FAHRMODUS" : "DRIVING MODE"}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-gray-400 hover:text-white"
          >
            {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            data-testid="close-driving-mode"
          >
            <X className="w-8 h-8" />
          </Button>
        </div>
      </div>
      
      {/* Hauptbereich - 3 große Infos */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8 overflow-hidden">
        
        {/* Warnung (wenn vorhanden) */}
        {displayData.warning && (
          <div className={`w-full max-w-2xl p-6 rounded-2xl border-2 ${getBgColor()} animate-pulse`}>
            <div className="flex items-center gap-4">
              <AlertTriangle className={`w-12 h-12 ${getRiskColor()}`} />
              <span className={`text-2xl font-bold ${getRiskColor()}`}>
                {displayData.warning}
              </span>
            </div>
          </div>
        )}
        
        {/* Restlenkzeit */}
        <div className={`text-center p-8 rounded-3xl border-2 ${getBgColor()} w-full max-w-xl`}>
          <div className="flex items-center justify-center gap-4 mb-4">
            <Clock className={`w-10 h-10 ${getRiskColor()}`} />
            <span className="text-gray-400 text-xl">
              {i18n.language === "de" ? "NOCH FAHRZEIT" : "REMAINING TIME"}
            </span>
          </div>
          <div className={`text-6xl md:text-7xl font-mono font-bold ${getRiskColor()}`}>
            {displayData.remaining_time}
          </div>
        </div>
        
        {/* Restkilometer */}
        <div className="text-center p-8 rounded-3xl border-2 border-gray-700 bg-gray-900/50 w-full max-w-xl">
          <div className="flex items-center justify-center gap-4 mb-4">
            <MapPin className="w-10 h-10 text-primary" />
            <span className="text-gray-400 text-xl">
              {i18n.language === "de" ? "PAUSE SPÄTESTENS IN" : "BREAK LATEST IN"}
            </span>
          </div>
          <div className="text-6xl md:text-7xl font-mono font-bold text-primary">
            {displayData.remaining_km}
          </div>
        </div>
        
        {/* Status-Indikator */}
        <div className="flex items-center gap-4 mt-4">
          <div className={`w-6 h-6 rounded-full ${
            displayData.risk_level === "green" ? "bg-green-500" :
            displayData.risk_level === "yellow" ? "bg-yellow-500" : "bg-red-500"
          } ${displayData.risk_level !== "green" ? "animate-pulse" : ""}`} />
          <span className="text-gray-400 text-lg">
            {displayData.is_compliant 
              ? (i18n.language === "de" ? "Fahrt erlaubt" : "Driving permitted")
              : (i18n.language === "de" ? "PAUSE ERFORDERLICH" : "BREAK REQUIRED")
            }
          </span>
        </div>
      </div>
      
      {/* Footer - Pause-Button */}
      <div className="p-6 border-t border-gray-800">
        <div className="flex items-center justify-center gap-4 text-gray-500 text-sm mb-4">
          <AlertTriangle className="w-4 h-4" />
          {i18n.language === "de" 
            ? "Maßgeblich ist ausschließlich das digitale Kontrollgerät"
            : "The digital control device remains authoritative"
          }
        </div>
        
        {!displayData.is_compliant && (
          <Button
            className="w-full h-20 text-2xl bg-red-600 hover:bg-red-700"
            onClick={onClose}
          >
            <Coffee className="w-8 h-8 mr-4" />
            {i18n.language === "de" ? "PAUSE EINLEGEN" : "TAKE BREAK"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default DrivingMode;
