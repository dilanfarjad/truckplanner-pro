import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Bluetooth,
  BluetoothOff,
  CircleDot,
  Truck,
  Wrench,
  Clock,
  Moon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Zap
} from "lucide-react";

/**
 * Tachograph-Steuerung
 * 
 * Universal-Komponente für:
 * - Manuelle Eingabe
 * - Realistische Simulation mit Zeitlauf
 * - (Zukünftig) Bluetooth-Verbindung
 */

const TachographControl = ({ onDataUpdate, compact = false }) => {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  
  const [loading, setLoading] = useState(false);
  const [tachographTypes, setTachographTypes] = useState([]);
  const [selectedType, setSelectedType] = useState("manual");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [currentActivity, setCurrentActivity] = useState("rest");
  const [tachographData, setTachographData] = useState(null);
  const [complianceStatus, setComplianceStatus] = useState(null);
  
  // Simulation State
  const [simulationState, setSimulationState] = useState(null);
  const [simSpeed, setSimSpeed] = useState(60);
  const pollInterval = useRef(null);
  
  // Aktivitäts-Optionen
  const activities = [
    { id: "driving", icon: Truck, label: i18n.language === "de" ? "Fahrt" : "Driving", color: "text-green-500" },
    { id: "working", icon: Wrench, label: i18n.language === "de" ? "Arbeit" : "Working", color: "text-yellow-500" },
    { id: "available", icon: Clock, label: i18n.language === "de" ? "Bereitschaft" : "Available", color: "text-blue-500" },
    { id: "rest", icon: Moon, label: i18n.language === "de" ? "Ruhe" : "Rest", color: "text-orange-500" },
  ];
  
  // Szenarien
  const scenarios = [
    { id: "fresh", label: i18n.language === "de" ? "Neuer Tag (0h)" : "Fresh (0h)", color: "green" },
    { id: "mid_day", label: i18n.language === "de" ? "Mittag (2h)" : "Mid-day (2h)", color: "yellow" },
    { id: "near_break", label: i18n.language === "de" ? "Vor Pause (4h15)" : "Near Break (4h15)", color: "orange" },
    { id: "overtime", label: i18n.language === "de" ? "Überstunden" : "Overtime", color: "red" },
  ];
  
  useEffect(() => {
    fetchTachographTypes();
    fetchTachographData();
    
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);
  
  // Auto-polling für Simulation
  useEffect(() => {
    const tachType = tachographData?.tachograph_type?.toLowerCase();
    if ((selectedType === "simulation" || tachType === "simulation") && connectionStatus === "connected") {
      pollInterval.current = setInterval(() => {
        fetchTachographData();
        fetchSimulationState();
      }, 1000); // Jede Sekunde updaten
    } else {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
    }
    
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [selectedType, connectionStatus, tachographData?.tachograph_type]);
  
  const fetchTachographTypes = async () => {
    try {
      const response = await axios.get(`${API}/tachograph/available-types`, { headers });
      setTachographTypes(response.data.types);
    } catch (error) {
      console.error("Tachograph types error:", error);
    }
  };
  
  const fetchTachographData = async () => {
    try {
      const [dataRes, complianceRes] = await Promise.all([
        axios.get(`${API}/tachograph/data`, { headers }),
        axios.get(`${API}/tachograph/compliance`, { headers })
      ]);
      
      setTachographData(dataRes.data);
      setComplianceStatus(complianceRes.data);
      setCurrentActivity(dataRes.data.driver_1_activity || "rest");
      setConnectionStatus(dataRes.data.connection_status || "connected");
      
      // Sync selectedType with actual tachograph type
      const actualType = dataRes.data.tachograph_type?.toLowerCase() || "manual";
      if (actualType === "simulation") {
        setSelectedType("simulation");
      }
      
      if (onDataUpdate) {
        onDataUpdate(dataRes.data, complianceRes.data);
      }
    } catch (error) {
      console.error("Tachograph data error:", error);
    }
  };
  
  const fetchSimulationState = async () => {
    try {
      const response = await axios.get(`${API}/tachograph/simulation/state`, { headers });
      if (response.data.is_simulation) {
        setSimulationState(response.data);
      }
    } catch (error) {
      // Silent fail
    }
  };
  
  const connectTachograph = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/tachograph/connect`, {
        tachograph_type: selectedType
      }, { headers });
      
      setConnectionStatus(response.data.status);
      toast.success(
        i18n.language === "de" 
          ? `Verbunden: ${selectedType}` 
          : `Connected: ${selectedType}`
      );
      
      await fetchTachographData();
      if (selectedType === "simulation") {
        await fetchSimulationState();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  };
  
  const changeActivity = async (activity) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/tachograph/activity`, {
        activity: activity
      }, { headers });
      
      if (response.data.success === false) {
        toast.error(i18n.language === "de" 
          ? "Aktivitätswechsel abgelehnt - Pause erforderlich!" 
          : "Activity change rejected - Break required!");
        return;
      }
      
      setCurrentActivity(response.data.current_activity);
      toast.success(
        i18n.language === "de"
          ? `Aktivität: ${activities.find(a => a.id === activity)?.label}`
          : `Activity: ${activities.find(a => a.id === activity)?.label}`
      );
      
      await fetchTachographData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Fehler");
    } finally {
      setLoading(false);
    }
  };
  
  const loadScenario = async (scenario) => {
    setLoading(true);
    try {
      await axios.post(`${API}/tachograph/simulation/scenario/${scenario}`, {}, { headers });
      
      toast.success(
        i18n.language === "de"
          ? `Szenario geladen: ${scenarios.find(s => s.id === scenario)?.label}`
          : `Scenario loaded: ${scenarios.find(s => s.id === scenario)?.label}`
      );
      
      await fetchTachographData();
      await fetchSimulationState();
    } catch (error) {
      toast.error("Szenario Fehler");
    } finally {
      setLoading(false);
    }
  };
  
  const changeSimSpeed = async (speed) => {
    try {
      await axios.post(`${API}/tachograph/simulation/speed/${speed}`, {}, { headers });
      setSimSpeed(speed);
    } catch (error) {
      console.error("Speed change error:", error);
    }
  };
  
  const resetSimulation = async () => {
    try {
      await axios.post(`${API}/tachograph/simulation/reset`, {}, { headers });
      toast.success(i18n.language === "de" ? "Simulation zurückgesetzt" : "Simulation reset");
      await fetchTachographData();
      await fetchSimulationState();
    } catch (error) {
      toast.error("Reset Fehler");
    }
  };
  
  // Formatiere Minuten als "Xh Xmin"
  const formatTime = (minutes) => {
    if (!minutes && minutes !== 0) return "--";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}min`;
  };
  
  // Kompakte Ansicht
  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 bg-card rounded-lg border border-border">
        <div className={`w-3 h-3 rounded-full ${
          connectionStatus === "connected" ? "bg-green-500" : "bg-gray-500"
        }`} />
        
        <div className="flex-1">
          <span className="text-sm font-medium">
            {tachographData?.tachograph_type || "Manual"}
          </span>
        </div>
        
        <div className="flex gap-1">
          {activities.map(act => (
            <Button
              key={act.id}
              variant={currentActivity === act.id ? "default" : "ghost"}
              size="sm"
              className="p-2"
              onClick={() => changeActivity(act.id)}
              disabled={loading}
            >
              <act.icon className={`w-4 h-4 ${currentActivity === act.id ? "" : act.color}`} />
            </Button>
          ))}
        </div>
      </div>
    );
  }
  
  // Vollständige Ansicht
  return (
    <Card className="bg-card border-border" data-testid="tachograph-control">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {connectionStatus === "connected" ? (
            <Bluetooth className="w-5 h-5 text-green-500" />
          ) : (
            <BluetoothOff className="w-5 h-5 text-gray-500" />
          )}
          {i18n.language === "de" ? "Tachograph" : "Tachograph"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Verbindungsstatus */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected" ? "bg-green-500" : "bg-gray-500"
            }`} />
            <span className="text-sm">
              {connectionStatus === "connected" 
                ? (i18n.language === "de" ? "Verbunden" : "Connected")
                : (i18n.language === "de" ? "Getrennt" : "Disconnected")
              }
            </span>
          </div>
          <span className="text-xs text-muted-foreground uppercase">
            {tachographData?.tachograph_type || "Manual"}
          </span>
        </div>
        
        {/* Tachograph-Typ Auswahl */}
        <div className="space-y-2">
          <Label>{i18n.language === "de" ? "Tachograph-Typ" : "Tachograph Type"}</Label>
          <div className="flex gap-2">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tachographTypes.map(type => (
                  <SelectItem 
                    key={type.id} 
                    value={type.id}
                    disabled={!type.available}
                  >
                    {type.name}
                    {!type.available && " (N/A)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={connectTachograph}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
            </Button>
          </div>
        </div>
        
        {/* Aktivitäts-Buttons */}
        <div className="space-y-2">
          <Label>{i18n.language === "de" ? "Aktivität" : "Activity"}</Label>
          <div className="grid grid-cols-4 gap-2">
            {activities.map(act => (
              <Button
                key={act.id}
                variant={currentActivity === act.id ? "default" : "outline"}
                className={`flex flex-col gap-1 h-auto py-3 ${
                  currentActivity === act.id ? "" : act.color
                }`}
                onClick={() => changeActivity(act.id)}
                disabled={loading}
                data-testid={`activity-${act.id}`}
              >
                <act.icon className="w-5 h-5" />
                <span className="text-xs">{act.label}</span>
              </Button>
            ))}
          </div>
        </div>
        
        {/* Compliance Status */}
        {complianceStatus && (
          <div className={`p-4 rounded-lg border-2 ${
            complianceStatus.risk_level === "green" 
              ? "bg-green-500/10 border-green-500/30" 
              : complianceStatus.risk_level === "yellow"
              ? "bg-yellow-500/10 border-yellow-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-center gap-3 mb-2">
              {complianceStatus.is_compliant ? (
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-500" />
              )}
              <span className="font-semibold">
                {complianceStatus.is_compliant 
                  ? (i18n.language === "de" ? "Fahrt erlaubt" : "Driving permitted")
                  : (i18n.language === "de" ? "Pause erforderlich!" : "Break required!")
                }
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  {i18n.language === "de" ? "Noch" : "Remaining"}:
                </span>
                <p className="font-mono font-bold">
                  {Math.floor(complianceStatus.break_required_in_minutes / 60)}h {complianceStatus.break_required_in_minutes % 60}min
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {i18n.language === "de" ? "Entfernung" : "Distance"}:
                </span>
                <p className="font-mono font-bold">
                  {complianceStatus.break_required_in_km} km
                </p>
              </div>
            </div>
            
            {/* Warnungen */}
            {complianceStatus.warnings?.length > 0 && (
              <div className="mt-3 space-y-1">
                {complianceStatus.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-yellow-500">{w}</p>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Erweiterte Simulation-Steuerung */}
        {selectedType === "simulation" && connectionStatus === "connected" && (
          <div className="space-y-4 p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/30">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                {i18n.language === "de" ? "Simulation" : "Simulation"}
              </Label>
              {simulationState?.running && (
                <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full animate-pulse">
                  {i18n.language === "de" ? "Läuft" : "Running"} {simSpeed}x
                </span>
              )}
            </div>
            
            {/* Lenkzeit-Anzeige */}
            {simulationState && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {i18n.language === "de" ? "Lenkzeit seit Pause" : "Driving since break"}:
                  </span>
                  <span className="font-mono font-bold">
                    {formatTime(simulationState.driving_since_break)} / 4h 30min
                  </span>
                </div>
                <Progress 
                  value={(simulationState.driving_since_break / 270) * 100} 
                  className={`h-3 ${
                    simulationState.driving_since_break > 255 ? "bg-red-900" :
                    simulationState.driving_since_break > 240 ? "bg-yellow-900" : "bg-gray-800"
                  }`}
                />
                
                {/* Zwangspause Warnung */}
                {simulationState.forced_break && (
                  <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
                    <div>
                      <p className="font-semibold text-red-400">
                        {i18n.language === "de" ? "ZWANGSPAUSE AKTIV" : "FORCED BREAK ACTIVE"}
                      </p>
                      <p className="text-xs text-red-300">
                        {i18n.language === "de" 
                          ? "45 Minuten Pause erforderlich" 
                          : "45 minutes break required"}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Pausenfortschritt (wenn in Ruhe) */}
                {simulationState.activity === "rest" && simulationState.break_progress_percent > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {i18n.language === "de" ? "Pausenfortschritt" : "Break progress"}:
                      </span>
                      <span className="font-mono text-orange-400">
                        {simulationState.break_progress_percent}%
                      </span>
                    </div>
                    <Progress value={simulationState.break_progress_percent} className="h-2 bg-gray-800" />
                  </div>
                )}
                
                {/* Tagesstatistik */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 bg-gray-800/50 rounded">
                    <span className="text-muted-foreground">
                      {i18n.language === "de" ? "Heute" : "Today"}:
                    </span>
                    <p className="font-mono">{formatTime(simulationState.driving_today)}</p>
                  </div>
                  <div className="p-2 bg-gray-800/50 rounded">
                    <span className="text-muted-foreground">
                      {i18n.language === "de" ? "Woche" : "Week"}:
                    </span>
                    <p className="font-mono">{formatTime(simulationState.driving_week)}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Geschwindigkeits-Regler */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <FastForward className="w-4 h-4" />
                  {i18n.language === "de" ? "Geschwindigkeit" : "Speed"}
                </span>
                <span className="font-mono">{simSpeed}x</span>
              </div>
              <Slider
                value={[simSpeed]}
                min={1}
                max={300}
                step={1}
                onValueChange={(v) => changeSimSpeed(v[0])}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1x (Echtzeit)</span>
                <span>300x (5min/sek)</span>
              </div>
            </div>
            
            {/* Szenario-Buttons */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {i18n.language === "de" ? "Szenario laden" : "Load Scenario"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {scenarios.map(s => (
                  <Button
                    key={s.id}
                    variant="outline"
                    size="sm"
                    onClick={() => loadScenario(s.id)}
                    className={`text-xs ${
                      s.color === "green" ? "border-green-500/50 hover:bg-green-500/10" :
                      s.color === "yellow" ? "border-yellow-500/50 hover:bg-yellow-500/10" :
                      s.color === "orange" ? "border-orange-500/50 hover:bg-orange-500/10" :
                      "border-red-500/50 hover:bg-red-500/10"
                    }`}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Reset */}
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSimulation}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {i18n.language === "de" ? "Simulation zurücksetzen" : "Reset Simulation"}
            </Button>
          </div>
        )}
        
      </CardContent>
    </Card>
  );
};

export default TachographControl;
