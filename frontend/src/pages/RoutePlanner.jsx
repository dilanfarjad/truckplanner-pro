/** 
 * DEPRECATED: Dieser RoutePlanner wird durch SimpleRoutePlanner ersetzt.
 * Nur noch als Referenz vorhanden.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  MapPin, 
  Navigation, 
  Clock, 
  Coffee,
  AlertTriangle,
  Sparkles,
  Loader2,
  Search,
  ParkingCircle,
  Crosshair,
  Play,
  Square,
  Timer,
  CheckCircle2,
  Car,
  Euro
} from "lucide-react";
import RouteMap from "@/components/RouteMap";
import VehicleSelector, { VehicleDetails } from "@/components/VehicleSelector";
import BreakGauge from "@/components/BreakGauge";
import GPSTracker from "@/components/GPSTracker";
import NavigationView from "@/components/NavigationView";
import TachographControl from "@/components/TachographControl";
import DrivingMode from "@/components/DrivingMode";
import CostDisplay from "@/components/CostDisplay";
import SpeedCameraWarning from "@/components/SpeedCameraWarning";

const RoutePlanner = () => {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [truckParking, setTruckParking] = useState([]);
  const [showParking, setShowParking] = useState(true);
  const [currentGpsLocation, setCurrentGpsLocation] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  
  // Maut & Blitzer
  const [tollInfo, setTollInfo] = useState(null);
  const [speedCameras, setSpeedCameras] = useState([]);
  const [showSpeedCameras, setShowSpeedCameras] = useState(true);
  
  // Zeit-basierte Eingabe (HH:MM)
  const [workStartTime, setWorkStartTime] = useState("");
  const [drivingStartTime, setDrivingStartTime] = useState("");
  
  // Current driving status (wird automatisch berechnet)
  const [currentDriving, setCurrentDriving] = useState(0);
  const [currentWork, setCurrentWork] = useState(0);
  
  // Tachograph Data
  const [tachographData, setTachographData] = useState(null);
  const [complianceStatus, setComplianceStatus] = useState(null);
  
  // START/STOP Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };
  
  // Handler für Tachograph-Updates
  const handleTachographUpdate = (data, compliance) => {
    setTachographData(data);
    setComplianceStatus(compliance);
    if (data) {
      setCurrentDriving(data.driving_time_today_minutes || 0);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchTodayStatus();
    
    // Cleanup timer on unmount
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
  
  // Timer effect
  useEffect(() => {
    if (timerRunning && timerStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
        setTimerElapsed(elapsed);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning, timerStartTime]);

  // Auto-calculate driving time from start time (FIXED: no negative values)
  useEffect(() => {
    if (drivingStartTime && !timerRunning) {
      const now = new Date();
      const [hours, minutes] = drivingStartTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);
      
      // Only calculate if start time is in the past
      if (startDate <= now) {
        const diffMinutes = Math.floor((now - startDate) / 60000);
        setCurrentDriving(Math.max(0, Math.min(diffMinutes, 540))); // Max 9h, never negative
      } else {
        // Start time is in the future = 0 driving time
        setCurrentDriving(0);
      }
    } else if (!drivingStartTime && !timerRunning) {
      setCurrentDriving(0);
    }
  }, [drivingStartTime, timerRunning]);

  // Auto-calculate work time from start time (FIXED: no negative values)
  useEffect(() => {
    if (workStartTime) {
      const now = new Date();
      const [hours, minutes] = workStartTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);
      
      // Only calculate if start time is in the past
      if (startDate <= now) {
        const diffMinutes = Math.floor((now - startDate) / 60000);
        setCurrentWork(Math.max(0, Math.min(diffMinutes, 600))); // Max 10h, never negative
      } else {
        // Start time is in the future = 0 work time
        setCurrentWork(0);
      }
    } else {
      setCurrentWork(0);
    }
  }, [workStartTime]);
  
  // Timer functions
  const startTimer = () => {
    const now = new Date();
    setTimerStartTime(Date.now());
    setTimerRunning(true);
    setTimerElapsed(0);
    
    // Set driving start time to current time
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setDrivingStartTime(timeStr);
    
    toast.success(i18n.language === "de" ? "Fahrtzeit-Timer gestartet" : "Driving timer started");
  };
  
  const stopTimer = () => {
    setTimerRunning(false);
    
    // Add timer elapsed to current driving
    const addedMinutes = Math.floor(timerElapsed / 60);
    setCurrentDriving(prev => Math.min(prev + addedMinutes, 540));
    
    toast.success(
      i18n.language === "de" 
        ? `Timer gestoppt: +${addedMinutes} Minuten` 
        : `Timer stopped: +${addedMinutes} minutes`
    );
  };
  
  const formatTimerTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`, { headers });
      setVehicles(response.data);
      const defaultVehicle = response.data.find(v => v.is_default);
      if (defaultVehicle) setSelectedVehicle(defaultVehicle);
    } catch (error) {
      toast.error(t("error"));
    }
  };

  const fetchTodayStatus = async () => {
    try {
      const response = await axios.get(`${API}/driving-logs?days=1`, { headers });
      if (response.data[0]) {
        setCurrentDriving(response.data[0].total_driving_minutes || 0);
        setCurrentWork(response.data[0].total_work_minutes || 0);
        // Set times from log
        if (response.data[0].work_start_time) setWorkStartTime(response.data[0].work_start_time);
        if (response.data[0].driving_start_time) setDrivingStartTime(response.data[0].driving_start_time);
      }
    } catch (error) {
      console.error("Error fetching today status:", error);
    }
  };

  // Fetch truck parking along route
  const fetchTruckParking = async (startLat, startLon, endLat, endLon) => {
    try {
      const response = await axios.get(
        `${API}/parking/along-route?start_lat=${startLat}&start_lon=${startLon}&end_lat=${endLat}&end_lon=${endLon}`,
        { headers }
      );
      setTruckParking(response.data || []);
    } catch (error) {
      console.error("Error fetching parking:", error);
    }
  };

  // Handle GPS location update
  const handleGpsUpdate = (location) => {
    setCurrentGpsLocation(location);
  };

  // Get current location and set as start
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("GPS wird nicht unterstützt");
      return;
    }
    
    toast.info("Standort wird ermittelt...");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Reverse geocode to get address
        try {
          const response = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
          );
          const address = response.data.display_name?.split(",").slice(0, 2).join(", ") || "Mein Standort";
          
          setStartPoint({ lat, lon, name: address });
          setStartQuery(address);
          setCurrentGpsLocation({ lat, lon });
          toast.success("Standort übernommen!");
        } catch (e) {
          setStartPoint({ lat, lon, name: "Mein Standort" });
          setStartQuery("Mein Standort");
          setCurrentGpsLocation({ lat, lon });
          toast.success("Standort übernommen!");
        }
      },
      (error) => {
        toast.error("Standort konnte nicht ermittelt werden: " + error.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Geocoding search using Nominatim (free)
  const searchLocation = async (query, setSuggestions) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=de,at,ch,nl,be,fr,pl,cz`
      );
      setSuggestions(response.data.map(item => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        name: item.display_name
      })));
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedStartSearch = useCallback(
    debounce((q) => searchLocation(q, setStartSuggestions), 300),
    []
  );

  const debouncedEndSearch = useCallback(
    debounce((q) => searchLocation(q, setEndSuggestions), 300),
    []
  );

  const handleStartChange = (e) => {
    setStartQuery(e.target.value);
    debouncedStartSearch(e.target.value);
  };

  const handleEndChange = (e) => {
    setEndQuery(e.target.value);
    debouncedEndSearch(e.target.value);
  };

  const selectStart = (location) => {
    setStartPoint(location);
    setStartQuery(location.name.split(",")[0]);
    setStartSuggestions([]);
  };

  const selectEnd = (location) => {
    setEndPoint(location);
    setEndQuery(location.name.split(",")[0]);
    setEndSuggestions([]);
  };

  const planRoute = async () => {
    if (!startPoint || !endPoint) {
      toast.error(t("startLocation") + " & " + t("destination") + " required");
      return;
    }

    setLoading(true);
    try {
      // HERE Truck Routing mit Maut und Blitzer
      const hereResponse = await axios.post(`${API}/route/here`, {
        start_lat: startPoint.lat,
        start_lon: startPoint.lon,
        end_lat: endPoint.lat,
        end_lon: endPoint.lon,
        vehicle_height: selectedVehicle?.height || 4.0,
        vehicle_width: selectedVehicle?.width || 2.55,
        vehicle_length: selectedVehicle?.length || 16.5,
        vehicle_weight: selectedVehicle?.weight || 40000,
        vehicle_axles: 5,
        include_toll: true,
        include_speed_cameras: true
      }, { headers });

      // Maut und Blitzer speichern
      setTollInfo(hereResponse.data.toll);
      setSpeedCameras(hereResponse.data.speed_cameras || []);
      
      // Auch alten Route-Endpoint für Pausenberechnung aufrufen
      const response = await axios.post(`${API}/routes/plan`, {
        start_lat: startPoint.lat,
        start_lon: startPoint.lon,
        end_lat: endPoint.lat,
        end_lon: endPoint.lon,
        vehicle_profile_id: selectedVehicle?.id,
        current_driving_minutes: currentDriving,
        current_work_minutes: currentWork
      }, { headers });

      // Route-Daten zusammenführen
      const mergedRoute = {
        ...response.data,
        // HERE-Daten überschreiben wenn verfügbar
        route_geometry: hereResponse.data.route?.geometry?.length > 0 
          ? hereResponse.data.route.geometry 
          : response.data.route_geometry,
        truck_compliant: hereResponse.data.route?.truck_compliant,
        routing_source: hereResponse.data.route?.source
      };
      
      setRoute(mergedRoute);
      
      // Fetch truck parking along route
      if (showParking) {
        fetchTruckParking(startPoint.lat, startPoint.lon, endPoint.lat, endPoint.lon);
      }
      
      if (response.data.warnings?.length > 0) {
        response.data.warnings.forEach(w => toast.warning(w));
      }
      
      // Maut-Info Toast
      if (hereResponse.data.toll) {
        toast.info(`💰 Maut: ~${hereResponse.data.toll.toll_cost?.toFixed(2) || 0} €`);
      }
      
      // Blitzer-Info Toast
      if (hereResponse.data.speed_cameras?.length > 0) {
        toast.info(`📸 ${hereResponse.data.speed_cameras.length} Blitzer auf der Route`);
      }
      
      toast.success(`${t("distance")}: ${response.data.distance_km} km | ${t("duration")}: ${Math.round(response.data.duration_minutes)} min`);
    } catch (error) {
      toast.error(error.response?.data?.detail || t("error"));
    } finally {
      setLoading(false);
    }
  };

  const getAiAdvice = async () => {
    if (!route) return;
    
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/ai/break-advice?current_driving_minutes=${currentDriving}&current_work_minutes=${currentWork}&route_duration_minutes=${route.duration_minutes}`,
        {},
        { headers }
      );
      setAiAdvice(response.data);
    } catch (error) {
      toast.error(t("error"));
    } finally {
      setLoading(false);
    }
  };

  const formatMinutes = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6" data-testid="route-planner">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
            {t("routePlanner")}
          </h1>
          <p className="text-muted-foreground mt-1">
            LKW-optimierte Routen mit Pausenberechnung
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Fahrmodus Button */}
          <Button
            onClick={() => setIsDrivingMode(true)}
            className="bg-green-600 hover:bg-green-700"
            data-testid="enter-driving-mode-btn"
          >
            <Car className="w-5 h-5 mr-2" />
            {i18n.language === "de" ? "Fahrmodus" : "Driving Mode"}
          </Button>
          
          {/* GPS Tracker */}
          <GPSTracker onLocationUpdate={handleGpsUpdate} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Controls */}
        <div className="space-y-6">
          {/* Tachograph Control */}
          <TachographControl 
            onDataUpdate={handleTachographUpdate}
          />
          
          {/* Vehicle Selection */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">{t("vehicles")}</CardTitle>
            </CardHeader>
            <CardContent>
              <VehicleSelector
                vehicles={vehicles}
                selectedId={selectedVehicle?.id}
                onSelect={setSelectedVehicle}
              />
              {selectedVehicle && (
                <div className="mt-4">
                  <VehicleDetails vehicle={selectedVehicle} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Route Input */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Navigation className="w-5 h-5 text-primary" />
                Route
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Start Location */}
              <div className="space-y-2 relative">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary" />
                  {t("startLocation")}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="z.B. Hamburg, Berlin..."
                      value={startQuery}
                      onChange={handleStartChange}
                      className="h-14 pl-10"
                      data-testid="start-input"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 px-4"
                    onClick={useCurrentLocation}
                    data-testid="use-my-location-btn"
                    title="Mein Standort"
                  >
                    <Crosshair className="w-5 h-5" />
                  </Button>
                </div>
                {startSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-card border border-border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {startSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectStart(s)}
                        className="w-full text-left px-4 py-3 hover:bg-accent text-sm border-b border-border last:border-0"
                        data-testid={`start-suggestion-${idx}`}
                      >
                        <MapPin className="w-4 h-4 inline mr-2 text-muted-foreground" />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* End Location */}
              <div className="space-y-2 relative">
                <Label className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-destructive" />
                  {t("destination")}
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="z.B. München, Frankfurt..."
                    value={endQuery}
                    onChange={handleEndChange}
                    className="h-14 pl-10"
                    data-testid="end-input"
                  />
                </div>
                {endSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-card border border-border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {endSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectEnd(s)}
                        className="w-full text-left px-4 py-3 hover:bg-accent text-sm border-b border-border last:border-0"
                        data-testid={`end-suggestion-${idx}`}
                      >
                        <MapPin className="w-4 h-4 inline mr-2 text-muted-foreground" />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Status - UHRZEITEN statt Minuten */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-secondary" />
                    {i18n.language === "de" ? "Arbeitsbeginn" : "Work Start"}
                  </Label>
                  <Input
                    type="time"
                    value={workStartTime}
                    onChange={(e) => setWorkStartTime(e.target.value)}
                    className="h-12 font-mono"
                    data-testid="work-start-time-input"
                  />
                  <span className="text-xs text-muted-foreground">
                    {currentWork > 0 && `= ${Math.floor(currentWork / 60)}h ${currentWork % 60}min`}
                  </span>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-primary" />
                    {i18n.language === "de" ? "Lenkzeit-Beginn" : "Driving Start"}
                  </Label>
                  <Input
                    type="time"
                    value={drivingStartTime}
                    onChange={(e) => setDrivingStartTime(e.target.value)}
                    className="h-12 font-mono"
                    data-testid="driving-start-time-input"
                    disabled={timerRunning}
                  />
                  <span className="text-xs text-muted-foreground">
                    {currentDriving > 0 && `= ${Math.floor(currentDriving / 60)}h ${currentDriving % 60}min`}
                  </span>
                </div>
              </div>

              {/* START/STOP TIMER */}
              <div className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-semibold">
                    <Timer className="w-5 h-5 text-primary" />
                    {i18n.language === "de" ? "Fahrtzeit-Timer" : "Driving Timer"}
                  </Label>
                  {timerRunning && (
                    <span className="text-2xl font-mono font-bold text-primary animate-pulse">
                      {formatTimerTime(timerElapsed)}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {!timerRunning ? (
                    <Button
                      onClick={startTimer}
                      className="flex-1 h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
                      data-testid="start-timer-btn"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      {i18n.language === "de" ? "Start" : "Start"}
                    </Button>
                  ) : (
                    <Button
                      onClick={stopTimer}
                      variant="destructive"
                      className="flex-1 h-14 text-lg font-semibold"
                      data-testid="stop-timer-btn"
                    >
                      <Square className="w-5 h-5 mr-2" />
                      {i18n.language === "de" ? "Stop" : "Stop"}
                    </Button>
                  )}
                </div>
                
                {timerRunning && (
                  <p className="text-xs text-muted-foreground text-center">
                    {i18n.language === "de" 
                      ? "Timer läuft... Drücken Sie Stop um die Zeit zu speichern"
                      : "Timer running... Press Stop to save time"
                    }
                  </p>
                )}
              </div>

              <Button
                onClick={planRoute}
                disabled={loading || !startPoint || !endPoint}
                className="w-full h-14 text-lg font-semibold"
                data-testid="plan-route-btn"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Navigation className="w-5 h-5 mr-2" />
                )}
                {t("planRoute")}
              </Button>
              
              {/* Navigation starten Button */}
              {route && route.navigation_steps?.length > 0 && (
                <Button
                  onClick={() => setIsNavigating(true)}
                  variant="secondary"
                  className="w-full h-14 text-lg font-semibold"
                  data-testid="start-navigation-btn"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {i18n.language === "de" ? "Navigation starten" : "Start Navigation"}
                </Button>
              )}
              
              {/* Parking Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Label className="flex items-center gap-2">
                  <ParkingCircle className="w-4 h-4 text-primary" />
                  {t("truckParking")} anzeigen
                </Label>
                <Switch
                  checked={showParking}
                  onCheckedChange={setShowParking}
                  data-testid="show-parking-switch"
                />
              </div>
            </CardContent>
          </Card>

          {/* Current Break Status */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coffee className="w-5 h-5 text-primary" />
                {t("breakRequired")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BreakGauge
                currentMinutes={currentDriving % 270}
                maxMinutes={270}
                label={i18n.language === "de" ? "Bis Pause (max 4,5h)" : "Until break (max 4.5h)"}
              />
              <BreakGauge
                currentMinutes={currentDriving}
                maxMinutes={540}
                label={t("dailyDriving")}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Map & Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Map */}
          <div className="h-[400px] md:h-[500px]">
            <RouteMap
              routeGeometry={route?.route_geometry || []}
              startPoint={startPoint}
              endPoint={endPoint}
              breakSuggestions={route?.break_suggestions || []}
              restStops={[...(route?.rest_stops || []), ...(showParking ? truckParking : []), ...(route?.optimal_rest_stop ? [route.optimal_rest_stop] : [])]}
              currentLocation={currentGpsLocation}
            />
          </div>
          
          {/* Optimal Rest Stop Info */}
          {route?.optimal_rest_stop && (
            <Card className="bg-secondary/10 border-secondary/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                    <Coffee className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="font-semibold text-secondary">
                      {i18n.language === "de" ? "Empfohlener Rastplatz" : "Recommended Rest Stop"}
                    </p>
                    <p className="text-lg font-bold">{route.optimal_rest_stop.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {route.optimal_rest_stop.type} - {route.optimal_rest_stop.distance_to_route_km} km von Route
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* 3 REST STOP OPTIONS */}
          {route?.rest_stop_options?.length > 0 && (
            <Card className="bg-card border-border" data-testid="rest-stop-options">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-primary" />
                  {i18n.language === "de" ? "3 Rastplatz-Optionen" : "3 Rest Stop Options"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {route.rest_stop_options.map((option, idx) => (
                    <div 
                      key={idx}
                      className={`p-4 rounded-xl border-2 transition-all hover:scale-[1.02] cursor-pointer ${
                        option.color === 'green' 
                          ? 'bg-green-500/10 border-green-500/30 hover:border-green-500'
                          : option.color === 'yellow'
                          ? 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500'
                          : 'bg-red-500/10 border-red-500/30 hover:border-red-500'
                      }`}
                      data-testid={`rest-stop-option-${option.type}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className={`w-5 h-5 ${
                          option.color === 'green' ? 'text-green-500' :
                          option.color === 'yellow' ? 'text-yellow-500' : 'text-red-500'
                        }`} />
                        <span className="font-semibold">
                          {i18n.language === "de" ? option.label : option.label_en}
                        </span>
                      </div>
                      
                      <p className={`text-sm font-medium mb-1 ${
                        option.color === 'green' ? 'text-green-500' :
                        option.color === 'yellow' ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {i18n.language === "de" ? option.rating : option.rating_en}
                      </p>
                      
                      <p className="text-sm text-muted-foreground">
                        {i18n.language === "de" ? "Nach" : "After"} {option.distance_from_start_km} km
                      </p>
                      
                      {option.rest_stop_name && (
                        <p className="text-sm font-medium mt-2 truncate">
                          📍 {option.rest_stop_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Truck Parking Info */}
          {showParking && truckParking.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ParkingCircle className="w-5 h-5 text-primary" />
                  {t("truckParking")} ({truckParking.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                  {truckParking.slice(0, 9).map((spot, idx) => (
                    <div key={idx} className="text-xs p-2 bg-muted/50 rounded">
                      <p className="font-medium truncate">{spot.name}</p>
                      <p className="text-muted-foreground">{spot.type}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Route Results */}
          {route && (
            <Card className="bg-card border-border" data-testid="route-results">
              <CardHeader>
                <CardTitle className="text-lg">Routenergebnis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-primary/10 rounded-lg text-center">
                    <p className="data-value text-primary">{route.distance_km}</p>
                    <p className="text-xs text-muted-foreground">{t("km")}</p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg text-center">
                    <p className="data-value text-secondary">{formatMinutes(route.duration_minutes)}</p>
                    <p className="text-xs text-muted-foreground">{t("duration")}</p>
                  </div>
                  <div className="p-4 bg-warning/10 rounded-lg text-center">
                    <p className="data-value text-warning">{route.break_suggestions?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Pausen</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="data-value">{route.rest_stops?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">{t("restStops")}</p>
                  </div>
                </div>

                {/* Maut & Kraftstoffkosten */}
                {tollInfo && (
                  <CostDisplay 
                    tollCost={tollInfo}
                    distanceKm={route.distance_km}
                    fuelConsumption={selectedVehicle?.fuel_consumption || 32}
                    fuelPrice={1.85}
                  />
                )}

                {/* Blitzer-Warnungen */}
                {speedCameras.length > 0 && (
                  <SpeedCameraWarning 
                    cameras={speedCameras}
                    showOnMap={showSpeedCameras}
                    onToggleShow={setShowSpeedCameras}
                  />
                )}

                {/* Warnings */}
                {route.warnings?.length > 0 && (
                  <div className="space-y-2">
                    {route.warnings.map((warning, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg"
                      >
                        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                        <span className="text-sm">{warning}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Break Suggestions */}
                {route.break_suggestions?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold">{t("breakSuggestion")}</h4>
                    {route.break_suggestions.map((brk, idx) => (
                      <div 
                        key={idx}
                        className="p-4 bg-primary/5 border border-primary/20 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-primary">
                            {t(brk.break_type)} ({brk.duration_minutes} min)
                          </span>
                          <span className="text-sm text-muted-foreground">
                            nach {brk.distance_from_start_km} km
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{brk.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Advice Button */}
                <Button
                  onClick={getAiAdvice}
                  variant="outline"
                  className="w-full h-14"
                  disabled={loading}
                  data-testid="ai-advice-btn"
                >
                  <Sparkles className="w-5 h-5 mr-2 text-primary" />
                  {t("getAdvice")}
                </Button>

                {/* AI Advice */}
                {aiAdvice?.advice && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      {t("aiAdvice")}
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{aiAdvice.advice}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {/* Full-Screen Navigation View */}
      {isNavigating && route?.navigation_steps && (
        <NavigationView
          steps={route.navigation_steps}
          onClose={() => setIsNavigating(false)}
          optimalRestStop={route.optimal_rest_stop}
          breakSuggestion={route.break_suggestions?.[0]}
          totalDistance={route.distance_km}
          remainingDistance={route.distance_km}
          eta={route.duration_minutes}
        />
      )}
      
      {/* Fahrmodus Overlay */}
      {isDrivingMode && (
        <DrivingMode 
          onClose={() => setIsDrivingMode(false)}
          currentLocation={currentGpsLocation}
          destination={endPoint}
        />
      )}
    </div>
  );
};

export default RoutePlanner;
