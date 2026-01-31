import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Navigation, 
  Clock, 
  Coffee,
  Truck,
  AlertTriangle,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Calendar,
  Settings,
  FileText,
  User,
  Bell,
  Globe,
  Edit,
  Plus,
  Trash2,
  Play,
  Pause,
  Square,
  Briefcase,
  Timer,
  Car
} from "lucide-react";
import { toast } from "sonner";

/**
 * Fahrer Dashboard mit:
 * - 4 Arbeitsmodi (Lenkzeit, Arbeitszeit, Bereitschaft, Fahrtunterbrechung)
 * - Live-Fahrtenbuch Tracking
 * - Automatische Eintragung bei Routenstart
 */

// Arbeitsmodi
const WORK_MODES = {
  DRIVING: 'driving',      // Lenkzeit
  WORKING: 'working',      // Arbeitszeit  
  AVAILABLE: 'available',  // Bereitschaft
  BREAK: 'break'           // Fahrtunterbrechung
};

const DriverDashboard = () => {
  const { t, i18n } = useTranslation();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}` };
  const timerRef = useRef(null);
  
  // State
  const [showSidebar, setShowSidebar] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Activity State - Live Tracking
  const [currentActivity, setCurrentActivity] = useState(null); // {mode, startTime, elapsed}
  const [liveEntry, setLiveEntry] = useState(null); // Current fahrtenbuch entry
  const [elapsedTime, setElapsedTime] = useState(0); // In seconds
  
  // Driving Status
  const [drivingStatus, setDrivingStatus] = useState({
    drivingToday: 0,
    drivingSinceBreak: 0,
    remainingDrive: 270,
    remainingDaily: 540,
    riskLevel: "green",
    isCompliant: true
  });
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [recentLogs, setRecentLogs] = useState([]);
  
  useEffect(() => {
    fetchAllData();
    requestNotificationPermission();
    checkForActiveEntry();
    
    // Timer for live updates
    const interval = setInterval(() => {
      if (currentActivity) {
        setElapsedTime(prev => prev + 1);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [currentActivity]);

  useEffect(() => {
    if (currentActivity) {
      checkDrivingTimeWarning();
    }
  }, [elapsedTime]);
  
  // Check for active entry on load
  const checkForActiveEntry = async () => {
    try {
      const response = await axios.get(`${API}/driving-logs/active`, { headers });
      if (response.data && response.data.is_active) {
        setLiveEntry(response.data);
        setCurrentActivity({
          mode: response.data.activity_type || WORK_MODES.DRIVING,
          startTime: new Date(response.data.start_time)
        });
        // Calculate elapsed time
        const start = new Date(response.data.start_time);
        const now = new Date();
        setElapsedTime(Math.floor((now - start) / 1000));
      }
    } catch (error) {
      // No active entry
    }
  };
  
  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };
  
  const checkDrivingTimeWarning = () => {
    if (!currentActivity || currentActivity.mode !== WORK_MODES.DRIVING) return;
    
    const remainingMinutes = 270 - (drivingStatus.drivingSinceBreak + Math.floor(elapsedTime / 60));
    
    // Stoneridge/VDO style warnings at 30, 15, 5, 0 minutes
    if ([30, 15, 5, 0, -1].includes(remainingMinutes)) {
      sendDrivingWarning(remainingMinutes);
    }
  };
  
  const sendDrivingWarning = (minutesRemaining) => {
    const title = minutesRemaining <= 0 
      ? (i18n.language === "de" ? "⚠️ LENKZEIT ÜBERSCHRITTEN!" : "⚠️ DRIVING EXCEEDED!")
      : (i18n.language === "de" ? `⚠️ Pause in ${minutesRemaining} min!` : `⚠️ Break in ${minutesRemaining} min!`);
    
    const body = i18n.language === "de" 
      ? "EU 561/2006: Fahrtunterbrechung erforderlich"
      : "EU 561/2006: Break required";

    if (notificationPermission === "granted" && "Notification" in window) {
      new Notification(title, {
        body: body,
        icon: "/logo192.png",
        tag: "driving-warning",
        requireInteraction: true
      });
    }

    if (minutesRemaining <= 0) {
      toast.error(title, { duration: 10000, position: "top-center" });
    } else {
      toast.warning(title, { duration: 5000 });
    }
  };
  
  const fetchAllData = async () => {
    try {
      const [complianceRes, vehicleRes, weeklyRes, logsRes] = await Promise.all([
        axios.get(`${API}/tachograph/compliance`, { headers }),
        axios.get(`${API}/vehicles`, { headers }),
        axios.get(`${API}/driving-logs/summary`, { headers }).catch(() => ({ data: null })),
        axios.get(`${API}/driving-logs?limit=5`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      if (complianceRes.data) {
        setDrivingStatus({
          drivingToday: complianceRes.data.driving_today || 0,
          drivingSinceBreak: complianceRes.data.driving_since_break || 0,
          remainingDrive: complianceRes.data.break_required_in_minutes || 270,
          remainingDaily: 540 - (complianceRes.data.driving_today || 0),
          riskLevel: complianceRes.data.risk_level || "green",
          isCompliant: complianceRes.data.is_compliant !== false
        });
      }
      
      if (vehicleRes.data?.length > 0) {
        setVehicles(vehicleRes.data);
        setSelectedVehicle(vehicleRes.data.find(v => v.is_default) || vehicleRes.data[0]);
      }
      
      if (weeklyRes.data) setWeeklyStats(weeklyRes.data);
      if (logsRes.data) setRecentLogs(logsRes.data);
    } catch (error) {
      console.error("Dashboard error:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // START Activity - Creates live Fahrtenbuch entry
  const startActivity = async (mode) => {
    if (currentActivity) {
      // Stop current activity first
      await stopActivity();
    }
    
    try {
      const response = await axios.post(`${API}/driving-logs/start`, {
        activity_type: mode,
        vehicle_id: selectedVehicle?.id
      }, { headers });
      
      setLiveEntry(response.data);
      setCurrentActivity({
        mode,
        startTime: new Date()
      });
      setElapsedTime(0);
      
      const modeLabels = {
        [WORK_MODES.DRIVING]: i18n.language === "de" ? "Lenkzeit" : "Driving",
        [WORK_MODES.WORKING]: i18n.language === "de" ? "Arbeitszeit" : "Working",
        [WORK_MODES.AVAILABLE]: i18n.language === "de" ? "Bereitschaft" : "Available",
        [WORK_MODES.BREAK]: i18n.language === "de" ? "Fahrtunterbrechung" : "Break"
      };
      
      toast.success(`${modeLabels[mode]} ${i18n.language === "de" ? "gestartet" : "started"}`);
    } catch (error) {
      console.error("Start activity error:", error);
      toast.error(i18n.language === "de" ? "Fehler beim Starten" : "Error starting activity");
    }
  };
  
  // STOP Activity - Finalizes Fahrtenbuch entry
  const stopActivity = async () => {
    if (!liveEntry) return;
    
    try {
      await axios.post(`${API}/driving-logs/stop`, {
        entry_id: liveEntry.id
      }, { headers });
      
      setCurrentActivity(null);
      setLiveEntry(null);
      setElapsedTime(0);
      
      toast.success(i18n.language === "de" ? "Eintrag beendet" : "Entry finished");
      
      // Refresh data
      fetchAllData();
    } catch (error) {
      console.error("Stop activity error:", error);
      toast.error(i18n.language === "de" ? "Fehler beim Beenden" : "Error stopping");
    }
  };
  
  // Format elapsed time
  const formatElapsed = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  
  const formatTime = (minutes) => {
    if (!minutes && minutes !== 0) return "0min";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m}min`;
    return `${h}h ${m}min`;
  };
  
  const getRiskColor = (level) => {
    switch(level) {
      case "green": return "bg-emerald-500";
      case "yellow": return "bg-amber-500";
      case "red": return "bg-red-500";
      default: return "bg-emerald-500";
    }
  };
  
  const getModeColor = (mode) => {
    switch(mode) {
      case WORK_MODES.DRIVING: return "bg-blue-500";
      case WORK_MODES.WORKING: return "bg-orange-500";
      case WORK_MODES.AVAILABLE: return "bg-purple-500";
      case WORK_MODES.BREAK: return "bg-emerald-500";
      default: return "bg-zinc-500";
    }
  };
  
  const getModeIcon = (mode) => {
    switch(mode) {
      case WORK_MODES.DRIVING: return <Car className="w-5 h-5" />;
      case WORK_MODES.WORKING: return <Briefcase className="w-5 h-5" />;
      case WORK_MODES.AVAILABLE: return <Timer className="w-5 h-5" />;
      case WORK_MODES.BREAK: return <Coffee className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };
  
  // Vehicle CRUD
  const saveVehicle = async (vehicle) => {
    try {
      if (vehicle.id) {
        await axios.put(`${API}/vehicles/${vehicle.id}`, vehicle, { headers });
        toast.success(i18n.language === "de" ? "Fahrzeug aktualisiert" : "Vehicle updated");
      } else {
        await axios.post(`${API}/vehicles`, vehicle, { headers });
        toast.success(i18n.language === "de" ? "Fahrzeug hinzugefügt" : "Vehicle added");
      }
      setEditingVehicle(null);
      fetchAllData();
    } catch (error) {
      toast.error(i18n.language === "de" ? "Fehler beim Speichern" : "Error saving");
    }
  };
  
  const deleteVehicle = async (vehicleId) => {
    if (!confirm(i18n.language === "de" ? "Fahrzeug wirklich löschen?" : "Really delete?")) return;
    try {
      await axios.delete(`${API}/vehicles/${vehicleId}`, { headers });
      toast.success(i18n.language === "de" ? "Fahrzeug gelöscht" : "Vehicle deleted");
      fetchAllData();
    } catch (error) {
      toast.error(i18n.language === "de" ? "Fehler beim Löschen" : "Error deleting");
    }
  };
  
  const setDefaultVehicle = async (vehicleId) => {
    try {
      await axios.put(`${API}/vehicles/${vehicleId}/default`, {}, { headers });
      toast.success(i18n.language === "de" ? "Standardfahrzeug gesetzt" : "Default set");
      fetchAllData();
    } catch (error) {
      toast.error(i18n.language === "de" ? "Fehler" : "Error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden pb-32">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => setShowSidebar(true)}
          className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800"
          data-testid="menu-btn"
        >
          <Menu className="w-6 h-6" />
        </button>
        
        <h1 className="text-xl font-bold">Dashboard</h1>
        
        <button
          onClick={() => { logout(); navigate("/"); }}
          className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-zinc-800 text-zinc-400 hover:text-red-400"
          data-testid="logout-btn"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
      
      {/* Welcome */}
      <div className="px-4 mb-4">
        <p className="text-zinc-500 text-sm">
          {i18n.language === "de" ? "Guten Tag" : "Hello"}, {user?.name?.split(" ")[0] || "Fahrer"}
        </p>
      </div>
      
      {/* ============ DIGITALER TACHOGRAPH DISPLAY (Stoneridge/VDO Style) ============ */}
      <div className="px-4 mb-6">
        <div className="bg-zinc-950 rounded-2xl border-2 border-zinc-700 overflow-hidden shadow-2xl">
          
          {/* Header - wie echtes Gerät */}
          <div className="bg-zinc-800 px-4 py-2 flex items-center justify-between border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-zinc-400 font-mono">TACHO</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-mono">
                {new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                drivingStatus.riskLevel === 'green' ? 'bg-green-500/20 text-green-400' :
                drivingStatus.riskLevel === 'yellow' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400 animate-pulse'
              }`}>
                {drivingStatus.isCompliant ? 'OK' : '!'}
              </div>
            </div>
          </div>
          
          {/* Haupt-Display */}
          <div className="p-4 space-y-4">
            
            {/* Aktuelle Aktivität - großes Display */}
            <div className={`rounded-xl p-4 ${
              currentActivity?.mode === WORK_MODES.DRIVING ? 'bg-blue-500/10 border border-blue-500/30' :
              currentActivity?.mode === WORK_MODES.WORKING ? 'bg-orange-500/10 border border-orange-500/30' :
              currentActivity?.mode === WORK_MODES.AVAILABLE ? 'bg-purple-500/10 border border-purple-500/30' :
              currentActivity?.mode === WORK_MODES.BREAK ? 'bg-green-500/10 border border-green-500/30' :
              'bg-zinc-900 border border-zinc-800'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {currentActivity ? (
                    <>
                      <div className={`w-3 h-3 rounded-full animate-pulse ${getModeColor(currentActivity.mode)}`} />
                      <span className="text-sm font-medium text-white">
                        {currentActivity.mode === WORK_MODES.DRIVING && (i18n.language === "de" ? "LENKZEIT" : "DRIVING")}
                        {currentActivity.mode === WORK_MODES.WORKING && (i18n.language === "de" ? "ARBEIT" : "WORK")}
                        {currentActivity.mode === WORK_MODES.AVAILABLE && (i18n.language === "de" ? "BEREITSCHAFT" : "AVAILABLE")}
                        {currentActivity.mode === WORK_MODES.BREAK && (i18n.language === "de" ? "PAUSE" : "BREAK")}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-zinc-500">
                      {i18n.language === "de" ? "Keine Aktivität" : "No activity"}
                    </span>
                  )}
                </div>
                {currentActivity && (
                  <Button
                    onClick={stopActivity}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Square className="w-3 h-3 mr-1" />
                    STOP
                  </Button>
                )}
              </div>
              
              {/* Großer Timer */}
              <div className="text-center">
                <span className="text-5xl font-bold font-mono tracking-tight text-white">
                  {formatElapsed(elapsedTime)}
                </span>
              </div>
            </div>
            
            {/* ============ LENKZEIT-BLÖCKE (wie Stoneridge/VDO) ============ */}
            <div className="grid grid-cols-2 gap-3">
              
              {/* Block 1: Lenkzeit seit letzter Pause (max 4:30) */}
              <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 font-mono">BLOCK 1</span>
                  <Car className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs text-zinc-400 mb-1">
                  {i18n.language === "de" ? "Seit Pause" : "Since break"}
                </p>
                <div className="flex items-end gap-1">
                  <span className={`text-2xl font-bold font-mono ${
                    (drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) > 240 
                      ? 'text-red-400' 
                      : (drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) > 210 
                        ? 'text-amber-400' 
                        : 'text-white'
                  }`}>
                    {formatTime(drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0))}
                  </span>
                  <span className="text-xs text-zinc-500 mb-1">/4:30</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      (drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) > 240 
                        ? 'bg-red-500' 
                        : (drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) > 210 
                          ? 'bg-amber-500' 
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, ((drivingStatus.drivingSinceBreak + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) / 270) * 100)}%` }}
                  />
                </div>
              </div>
              
              {/* Block 2: Restlenkzeit bis Pause */}
              <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 font-mono">REST</span>
                  <Coffee className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xs text-zinc-400 mb-1">
                  {i18n.language === "de" ? "Bis Pause" : "Until break"}
                </p>
                <div className="flex items-end gap-1">
                  <span className={`text-2xl font-bold font-mono ${
                    Math.max(0, drivingStatus.remainingDrive - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) < 15 
                      ? 'text-red-500 animate-[pulse_0.5s_infinite]' 
                      : Math.max(0, drivingStatus.remainingDrive - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) < 45 
                        ? 'text-amber-500' 
                        : 'text-emerald-500'
                  }`}>
                    {formatTime(Math.max(0, drivingStatus.remainingDrive - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)))}
                  </span>
                </div>
                {/* Visual Warning Bar for Stoneridge Feel */}
                {Math.max(0, drivingStatus.remainingDrive - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) < 15 && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse" />
                )}
                {/* Warning Message */}
                {Math.max(0, drivingStatus.remainingDrive - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) < 30 && (
                  <div className="mt-2 flex items-center gap-1 text-red-500 font-bold">
                    <AlertTriangle className="w-3 h-3 animate-bounce" />
                    <span className="text-[10px] uppercase tracking-tighter">
                      {i18n.language === "de" ? "STOPP: PAUSE!" : "STOP: BREAK!"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* ============ TAGES- UND WOCHENÜBERSICHT ============ */}
            <div className="grid grid-cols-3 gap-2">
              
              {/* Tageslenkzeit */}
              <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                <p className="text-xs text-zinc-500 mb-1">
                  {i18n.language === "de" ? "Heute" : "Today"}
                </p>
                <span className="text-lg font-bold font-mono text-white">
                  {formatTime(drivingStatus.drivingToday + (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0))}
                </span>
                <span className="text-xs text-zinc-500 ml-1">/9h</span>
              </div>
              
              {/* Restlenkzeit Tag */}
              <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                <p className="text-xs text-zinc-500 mb-1">
                  {i18n.language === "de" ? "Rest Tag" : "Left Today"}
                </p>
                <span className={`text-lg font-bold font-mono ${
                  Math.max(0, 540 - drivingStatus.drivingToday - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)) < 60 
                    ? 'text-amber-400' 
                    : 'text-emerald-400'
                }`}>
                  {formatTime(Math.max(0, 540 - drivingStatus.drivingToday - (currentActivity?.mode === WORK_MODES.DRIVING ? Math.floor(elapsedTime / 60) : 0)))}
                </span>
              </div>
              
              {/* Wochenlenkzeit */}
              <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                <p className="text-xs text-zinc-500 mb-1">
                  {i18n.language === "de" ? "Woche" : "Week"}
                </p>
                <span className="text-lg font-bold font-mono text-white">
                  {formatTime(weeklyStats?.current_week_driving_minutes || 0)}
                </span>
                <span className="text-xs text-zinc-500 ml-1">/56h</span>
              </div>
            </div>
            
            {/* Arbeitszeit heute */}
            <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-400/70 mb-1">
                    {i18n.language === "de" ? "Arbeitszeit heute" : "Work time today"}
                  </p>
                  <span className="text-xl font-bold font-mono text-orange-400">
                    {formatTime((weeklyStats?.today_working_minutes || 0) + (currentActivity?.mode === WORK_MODES.WORKING ? Math.floor(elapsedTime / 60) : 0))}
                  </span>
                </div>
                <Briefcase className="w-6 h-6 text-orange-400/50" />
              </div>
            </div>
            
          </div>
        </div>
      </div>
      
      {/* ============ 4 ARBEITSMODI BUTTONS ============ */}
      <div className="px-4 mb-6">
        <p className="text-xs text-zinc-500 mb-3">
          {i18n.language === "de" ? "Aktivität wählen" : "Select Activity"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {/* Lenkzeit */}
          <button
            onClick={() => startActivity(WORK_MODES.DRIVING)}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
              currentActivity?.mode === WORK_MODES.DRIVING 
                ? "bg-blue-500 border-blue-400 text-white" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-blue-500"
            }`}
            data-testid="mode-driving"
          >
            <Car className="w-6 h-6" />
            <span className="text-xs font-medium">
              {i18n.language === "de" ? "Lenkzeit" : "Driving"}
            </span>
          </button>
          
          {/* Arbeitszeit */}
          <button
            onClick={() => startActivity(WORK_MODES.WORKING)}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
              currentActivity?.mode === WORK_MODES.WORKING 
                ? "bg-orange-500 border-orange-400 text-white" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-orange-500"
            }`}
            data-testid="mode-working"
          >
            <Briefcase className="w-6 h-6" />
            <span className="text-xs font-medium">
              {i18n.language === "de" ? "Arbeit" : "Work"}
            </span>
          </button>
          
          {/* Bereitschaft */}
          <button
            onClick={() => startActivity(WORK_MODES.AVAILABLE)}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
              currentActivity?.mode === WORK_MODES.AVAILABLE 
                ? "bg-purple-500 border-purple-400 text-white" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-purple-500"
            }`}
            data-testid="mode-available"
          >
            <Timer className="w-6 h-6" />
            <span className="text-xs font-medium">
              {i18n.language === "de" ? "Bereit" : "Available"}
            </span>
          </button>
          
          {/* Fahrtunterbrechung */}
          <button
            onClick={() => startActivity(WORK_MODES.BREAK)}
            className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
              currentActivity?.mode === WORK_MODES.BREAK 
                ? "bg-emerald-500 border-emerald-400 text-white" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-emerald-500"
            }`}
            data-testid="mode-break"
          >
            <Coffee className="w-6 h-6" />
            <span className="text-xs font-medium">
              {i18n.language === "de" ? "Pause" : "Break"}
            </span>
          </button>
        </div>
      </div>
      
      {/* Fahrzeug & Route Button */}
      <div className="px-4 space-y-4">
        {selectedVehicle && (
          <button
            onClick={() => { setShowSidebar(true); setActivePanel('vehicles'); }}
            className="w-full bg-zinc-900 rounded-2xl p-5 border border-zinc-800 text-left hover:border-orange-500/50 transition"
            data-testid="vehicle-card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">{selectedVehicle.name}</p>
                  <p className="text-zinc-500 text-sm">
                    {selectedVehicle.height}m × {selectedVehicle.width}m | {(selectedVehicle.weight/1000).toFixed(0)}t
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-500" />
            </div>
          </button>
        )}
        
        {/* Letzte Einträge */}
        {recentLogs.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">
                {i18n.language === "de" ? "Letzte Einträge" : "Recent Entries"}
              </span>
              <button
                onClick={() => { setShowSidebar(true); setActivePanel('driving-log'); }}
                className="text-xs text-orange-400"
              >
                {i18n.language === "de" ? "Alle anzeigen" : "Show all"}
              </button>
            </div>
            <div className="space-y-2">
              {recentLogs.slice(0, 3).map((log, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getModeColor(log.activity_type || WORK_MODES.DRIVING)}`} />
                    <span className="text-sm text-zinc-300">{log.date?.slice(0, 10)}</span>
                  </div>
                  <span className="text-sm text-zinc-500">
                    {log.driving_minutes || 0} min
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Big Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-gradient-to-t from-black via-black to-transparent">
        <Button
          onClick={() => {
            // Auto-start driving when navigating to route planner
            if (!currentActivity || currentActivity.mode !== WORK_MODES.DRIVING) {
              startActivity(WORK_MODES.DRIVING);
            }
            navigate("/route-planner");
          }}
          className="w-full h-16 bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold rounded-2xl shadow-lg shadow-orange-500/30"
          data-testid="plan-route-btn"
        >
          <Navigation className="w-6 h-6 mr-3" />
          {i18n.language === "de" ? "Route planen" : "Plan Route"}
        </Button>
      </div>
      
      {/* ============ SIDEBAR ============ */}
      {showSidebar && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowSidebar(false); setActivePanel(null); }} />
          
          <div className="relative w-80 h-full bg-zinc-900 border-r border-zinc-800 overflow-y-auto animate-in slide-in-from-left">
            {/* Header */}
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold">
                  {user?.name?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="font-semibold text-white">{user?.name}</p>
                  <p className="text-xs text-zinc-500">{user?.email}</p>
                </div>
              </div>
              <button onClick={() => { setShowSidebar(false); setActivePanel(null); }} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            
            {/* Menu */}
            {!activePanel && (
              <div className="p-4 space-y-2">
                <button onClick={() => setActivePanel('vehicles')} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left text-white flex items-center gap-3" data-testid="menu-vehicles">
                  <Truck className="w-5 h-5 text-orange-500" />
                  <div className="flex-1">
                    <p className="font-medium">{i18n.language === "de" ? "Fahrzeuge" : "Vehicles"}</p>
                    <p className="text-xs text-zinc-500">{vehicles.length} {i18n.language === "de" ? "Fahrzeuge" : "vehicles"}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500" />
                </button>
                
                <button onClick={() => setActivePanel('driving-log')} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left text-white flex items-center gap-3" data-testid="menu-driving-log">
                  <FileText className="w-5 h-5 text-blue-500" />
                  <div className="flex-1">
                    <p className="font-medium">{i18n.language === "de" ? "Fahrtenbuch" : "Driving Log"}</p>
                    <p className="text-xs text-zinc-500">{i18n.language === "de" ? "Letzte 56 Tage" : "Last 56 days"}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500" />
                </button>
                
                <button onClick={() => setActivePanel('weekly')} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left text-white flex items-center gap-3" data-testid="menu-weekly">
                  <Calendar className="w-5 h-5 text-emerald-500" />
                  <div className="flex-1">
                    <p className="font-medium">{i18n.language === "de" ? "Lenkzeiten" : "Driving Times"}</p>
                    <p className="text-xs text-zinc-500">{i18n.language === "de" ? "Wochenübersicht" : "Weekly overview"}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500" />
                </button>
                
                <button onClick={() => setActivePanel('settings')} className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-left text-white flex items-center gap-3" data-testid="menu-settings">
                  <Settings className="w-5 h-5 text-zinc-400" />
                  <div className="flex-1">
                    <p className="font-medium">{i18n.language === "de" ? "Einstellungen" : "Settings"}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
            )}
            
            {/* Vehicles Panel */}
            {activePanel === 'vehicles' && (
              <div className="p-4">
                <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
                  <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === "de" ? "Zurück" : "Back"}
                </button>
                <h3 className="text-lg font-bold mb-4">{i18n.language === "de" ? "Fahrzeuge" : "Vehicles"}</h3>
                
                <button onClick={() => setEditingVehicle({ name: "", height: 4.0, width: 2.55, length: 16.5, weight: 40000 })} className="w-full p-3 mb-4 border-2 border-dashed border-zinc-700 hover:border-orange-500 rounded-xl text-zinc-400 hover:text-orange-500 flex items-center justify-center gap-2" data-testid="add-vehicle-btn">
                  <Plus className="w-5 h-5" />{i18n.language === "de" ? "Hinzufügen" : "Add"}
                </button>
                
                <div className="space-y-3">
                  {vehicles.map((v) => (
                    <div key={v.id} className={`p-4 rounded-xl border ${v.is_default ? "bg-orange-500/10 border-orange-500/50" : "bg-zinc-800 border-zinc-700"}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-white">{v.name}</p>
                          <p className="text-xs text-zinc-500">{v.height}m × {v.width}m × {v.length}m | {(v.weight/1000).toFixed(0)}t</p>
                        </div>
                        {v.is_default && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">Standard</span>}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => setEditingVehicle(v)} className="flex-1 p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-white flex items-center justify-center gap-1">
                          <Edit className="w-4 h-4" />{i18n.language === "de" ? "Bearbeiten" : "Edit"}
                        </button>
                        {!v.is_default && (
                          <>
                            <button onClick={() => setDefaultVehicle(v.id)} className="p-2 bg-zinc-700 hover:bg-orange-500 rounded-lg"><Truck className="w-4 h-4" /></button>
                            <button onClick={() => deleteVehicle(v.id)} className="p-2 bg-zinc-700 hover:bg-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Driving Log Panel */}
            {activePanel === 'driving-log' && (
              <div className="p-4">
                <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
                  <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === "de" ? "Zurück" : "Back"}
                </button>
                <h3 className="text-lg font-bold mb-4">{i18n.language === "de" ? "Fahrtenbuch" : "Driving Log"}</h3>
                
                <div className="space-y-3">
                  {/* Recent entries summary */}
                  <div className="p-3 bg-zinc-800 rounded-xl">
                    <p className="text-xs text-zinc-500 mb-2">{i18n.language === "de" ? "Letzte 56 Tage" : "Last 56 days"}</p>
                    <p className="text-white font-bold">{recentLogs.length} {i18n.language === "de" ? "Einträge" : "entries"}</p>
                  </div>
                  
                  <div className="pt-3 border-t border-zinc-700">
                    <p className="text-xs text-zinc-500 mb-2">{i18n.language === "de" ? "Export (EU 561/2006 konform)" : "Export (EU 561/2006 compliant)"}</p>
                    <div className="flex gap-2">
                      <Button 
                        onClick={async () => {
                          try {
                            const response = await axios.get(`${API}/driving-logs/export?format=csv`, {
                              headers,
                              responseType: 'blob'
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data]));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `fahrtenbuch_${new Date().toISOString().slice(0,10)}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            toast.success(i18n.language === "de" ? "CSV heruntergeladen" : "CSV downloaded");
                          } catch (error) {
                            toast.error(i18n.language === "de" ? "Download fehlgeschlagen" : "Download failed");
                          }
                        }} 
                        variant="outline" 
                        className="flex-1 border-zinc-700"
                        data-testid="export-csv-btn"
                      >
                        📄 CSV
                      </Button>
                      <Button 
                        onClick={async () => {
                          try {
                            const response = await axios.get(`${API}/driving-logs/export?format=pdf`, {
                              headers,
                              responseType: 'blob'
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `fahrtenbuch_${new Date().toISOString().slice(0,10)}.pdf`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                            toast.success(i18n.language === "de" ? "PDF heruntergeladen" : "PDF downloaded");
                          } catch (error) {
                            toast.error(i18n.language === "de" ? "Download fehlgeschlagen" : "Download failed");
                          }
                        }} 
                        variant="outline" 
                        className="flex-1 border-zinc-700"
                        data-testid="export-pdf-btn"
                      >
                        📋 PDF
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-2">
                      {i18n.language === "de" ? "Für Kontrollen durch BAG/Polizei" : "For official inspections"}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Weekly Panel */}
            {activePanel === 'weekly' && (
              <div className="p-4">
                <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
                  <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === "de" ? "Zurück" : "Back"}
                </button>
                <h3 className="text-lg font-bold mb-4">{i18n.language === "de" ? "Lenkzeiten" : "Driving Times"}</h3>
                
                <div className="space-y-4">
                  <div className="p-4 bg-zinc-800 rounded-xl">
                    <div className="flex justify-between mb-2">
                      <span className="text-zinc-400 text-sm">{i18n.language === "de" ? "Diese Woche" : "This Week"}</span>
                      <span className="text-xs text-zinc-500">max 56h</span>
                    </div>
                    <span className="text-2xl font-bold">{formatTime(weeklyStats?.current_week_driving_minutes || 0)}</span>
                    <div className="mt-2 h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, ((weeklyStats?.current_week_driving_minutes || 0) / 3360) * 100)}%` }} />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-zinc-800 rounded-xl">
                    <span className="text-zinc-400 text-sm">{i18n.language === "de" ? "Letzte Woche" : "Last Week"}</span>
                    <p className="text-xl font-bold mt-1">{formatTime(weeklyStats?.last_week_driving_minutes || 0)}</p>
                  </div>
                  
                  <div className="p-4 bg-zinc-800 rounded-xl">
                    <div className="flex justify-between mb-2">
                      <span className="text-zinc-400 text-sm">{i18n.language === "de" ? "2-Wochen" : "2-Week"}</span>
                      <span className="text-xs text-zinc-500">max 90h</span>
                    </div>
                    <span className="text-xl font-bold">{formatTime(weeklyStats?.two_week_total_minutes || 0)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Settings Panel */}
            {activePanel === 'settings' && (
              <div className="p-4">
                <button onClick={() => setActivePanel(null)} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4">
                  <ChevronRight className="w-4 h-4 rotate-180" />{i18n.language === "de" ? "Zurück" : "Back"}
                </button>
                <h3 className="text-lg font-bold mb-4">{i18n.language === "de" ? "Einstellungen" : "Settings"}</h3>
                
                <div className="space-y-3">
                  <div className="p-4 bg-zinc-800 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-zinc-400" />
                      <span>{i18n.language === "de" ? "Sprache" : "Language"}</span>
                    </div>
                    <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} className="bg-zinc-700 rounded-lg px-3 py-2">
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  
                  <div className="p-4 bg-zinc-800 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-zinc-400" />
                      <span>{i18n.language === "de" ? "Benachrichtigungen" : "Notifications"}</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${notificationPermission === 'granted' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                      {notificationPermission === 'granted' ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Edit Vehicle Modal */}
      {editingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditingVehicle(null)} />
          <div className="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-md border border-zinc-800">
            <h3 className="text-lg font-bold mb-4">
              {editingVehicle.id ? (i18n.language === "de" ? "Bearbeiten" : "Edit") : (i18n.language === "de" ? "Neu" : "New")}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Name</label>
                <Input value={editingVehicle.name} onChange={(e) => setEditingVehicle({...editingVehicle, name: e.target.value})} className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">{i18n.language === "de" ? "Höhe (m)" : "Height (m)"}</label>
                  <Input type="number" step="0.1" value={editingVehicle.height} onChange={(e) => setEditingVehicle({...editingVehicle, height: parseFloat(e.target.value)})} className="bg-zinc-800 border-zinc-700" />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">{i18n.language === "de" ? "Breite (m)" : "Width (m)"}</label>
                  <Input type="number" step="0.1" value={editingVehicle.width} onChange={(e) => setEditingVehicle({...editingVehicle, width: parseFloat(e.target.value)})} className="bg-zinc-800 border-zinc-700" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">{i18n.language === "de" ? "Länge (m)" : "Length (m)"}</label>
                  <Input type="number" step="0.1" value={editingVehicle.length} onChange={(e) => setEditingVehicle({...editingVehicle, length: parseFloat(e.target.value)})} className="bg-zinc-800 border-zinc-700" />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">{i18n.language === "de" ? "Gewicht (kg)" : "Weight (kg)"}</label>
                  <Input type="number" step="1000" value={editingVehicle.weight} onChange={(e) => setEditingVehicle({...editingVehicle, weight: parseInt(e.target.value)})} className="bg-zinc-800 border-zinc-700" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setEditingVehicle(null)} className="flex-1 border-zinc-700">{i18n.language === "de" ? "Abbrechen" : "Cancel"}</Button>
              <Button onClick={() => saveVehicle(editingVehicle)} className="flex-1 bg-orange-500 hover:bg-orange-600">{i18n.language === "de" ? "Speichern" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;
