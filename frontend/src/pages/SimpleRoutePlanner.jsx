import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, API } from "@/App";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  ArrowLeft,
  Navigation,
  MapPin,
  Clock,
  Euro,
  Coffee,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  Locate,
  Route as RouteIcon,
  Mic,
  MicOff,
  ParkingCircle,
  Users,
  Plus,
  GripVertical,
  AlertTriangle,
  RefreshCw,
  Fuel,
  Utensils,
  Leaf
} from "lucide-react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import TurnByTurnNavigation from "@/components/TurnByTurnNavigation";

// Custom icons
const startIcon = new L.DivIcon({
  className: "custom-marker",
  html: `<div style="background: #10B981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const endIcon = new L.DivIcon({
  className: "custom-marker",
  html: `<div style="background: #EF4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const restStopIcon = new L.DivIcon({
  className: "custom-marker",
  html: `<div style="background: #8B5CF6; width: 24px; height: 24px; border-radius: 8px; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Map controller
const MapController = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds?.length >= 2) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  return null;
};

const SimpleRoutePlanner = () => {
  const { t, i18n } = useTranslation();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const headers = { Authorization: `Bearer ${token}` };
  const searchTimeout = useRef(null);
  const recognitionRef = useRef(null);
  const trafficCheckInterval = useRef(null);

  // Basic State
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);  // null = hidden, false = collapsed, true = expanded
  const [mapBounds, setMapBounds] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Multiple Routes (3 Routenvorschläge)
  const [allRoutes, setAllRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const route = allRoutes[selectedRouteIndex] || null;
  
  // Waypoints / Zwischenziele (bis zu 7)
  const [waypoints, setWaypoints] = useState([]);
  const [waypointSuggestions, setWaypointSuggestions] = useState({});
  
  // Eco Routing - Kraftstoffsparende Route
  const [ecoRouting, setEcoRouting] = useState(false);
  
  // Break Suggestions
  const [breakSuggestions, setBreakSuggestions] = useState([]);
  const [selectedBreak, setSelectedBreak] = useState(null);
  const [showCustomBreakInput, setShowCustomBreakInput] = useState(false);
  const [customBreakKm, setCustomBreakKm] = useState("");
  const [customBreakFeasibility, setCustomBreakFeasibility] = useState(null);
  
  // Rest Stops along route
  const [allRestStopsOnRoute, setAllRestStopsOnRoute] = useState([]);
  const [showAllRestStops, setShowAllRestStops] = useState(false);
  
  // Compliance & Traffic
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [trafficAlert, setTrafficAlert] = useState(null);
  const [alternativeRoute, setAlternativeRoute] = useState(null);
  
  // Voice & Location
  const [isListening, setIsListening] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);

  // Initialize
  useEffect(() => {
    autoDetectLocation();
    fetchComplianceStatus();
    return () => {
      if (trafficCheckInterval.current) clearInterval(trafficCheckInterval.current);
    };
  }, []);

  // Auto-locate
  const autoDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setStartCoords({ lat: latitude, lon: longitude });
          setLocationPermissionGranted(true);
          try {
            const response = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            setStartText(response.data.display_name?.split(",").slice(0, 2).join(", ") || "Mein Standort");
          } catch {
            setStartText(i18n.language === "de" ? "Mein Standort" : "My Location");
          }
        },
        () => console.log("Location permission denied"),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  const fetchComplianceStatus = async () => {
    try {
      const response = await axios.get(`${API}/tachograph/compliance`, { headers });
      setComplianceStatus(response.data);
    } catch (error) {
      console.error("Compliance error:", error);
    }
  };

  // Voice Input
  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error(i18n.language === "de" ? "Spracheingabe nicht unterstützt" : "Voice input not supported");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = i18n.language === "de" ? "de-DE" : "en-US";
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.onstart = () => setIsListening(true);
    recognitionRef.current.onend = () => setIsListening(false);
    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setEndText(transcript);
      handleEndChange(transcript);
      toast.success(`"${transcript}"`);
    };
    recognitionRef.current.onerror = () => {
      setIsListening(false);
      toast.error(i18n.language === "de" ? "Spracherkennung fehlgeschlagen" : "Voice recognition failed");
    };
    recognitionRef.current.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Geocoding using TomTom Search API (more reliable than Nominatim)
  const searchLocation = async (query, setter) => {
    if (query.length < 3) {
      setter([]);
      return;
    }
    try {
      // Use TomTom Search API
      const apiKey = process.env.REACT_APP_TOMTOM_API_KEY || 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX';
      const response = await axios.get(
        `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?key=${apiKey}&countrySet=DE,AT,CH,FR,IT,NL,BE,PL,CZ&limit=5&language=de-DE`
      );
      setter(response.data.results?.map(r => ({
        name: r.address?.freeformAddress || r.poi?.name || query,
        lat: r.position.lat,
        lon: r.position.lon
      })) || []);
    } catch (error) {
      console.error("Geocoding error:", error);
      // Fallback to Nominatim via backend proxy if TomTom fails
      try {
        const response = await axios.get(`${API}/geocode?q=${encodeURIComponent(query)}`, { headers });
        setter(response.data || []);
      } catch {
        setter([]);
      }
    }
  };

  const handleStartChange = (text) => {
    setStartText(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchLocation(text, setStartSuggestions), 300);
  };

  const handleEndChange = (text) => {
    setEndText(text);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchLocation(text, setEndSuggestions), 300);
  };

  const selectStart = (s) => {
    setStartText(s.name);
    setStartCoords({ lat: s.lat, lon: s.lon });
    setStartSuggestions([]);
  };

  const selectEnd = (s) => {
    setEndText(s.name);
    setEndCoords({ lat: s.lat, lon: s.lon });
    setEndSuggestions([]);
  };

  // Waypoints
  const addWaypoint = () => {
    if (waypoints.length >= 7) {
      toast.error(i18n.language === "de" ? "Maximal 7 Zwischenziele" : "Maximum 7 waypoints");
      return;
    }
    setWaypoints([...waypoints, { text: "", coords: null }]);
  };

  const removeWaypoint = (index) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
    const newSuggestions = { ...waypointSuggestions };
    delete newSuggestions[index];
    setWaypointSuggestions(newSuggestions);
  };

  const updateWaypointText = (index, text) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = { ...newWaypoints[index], text };
    setWaypoints(newWaypoints);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchWaypointLocation(text, index), 300);
  };

  const searchWaypointLocation = async (query, index) => {
    if (query.length < 3) {
      setWaypointSuggestions(prev => ({ ...prev, [index]: [] }));
      return;
    }
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=de,at,ch&limit=5`
      );
      setWaypointSuggestions(prev => ({
        ...prev,
        [index]: response.data.map(r => ({
          name: r.display_name.split(",").slice(0, 2).join(", "),
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        }))
      }));
    } catch (error) {
      console.error("Waypoint geocoding error:", error);
    }
  };

  const selectWaypoint = (index, suggestion) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = { text: suggestion.name, coords: { lat: suggestion.lat, lon: suggestion.lon } };
    setWaypoints(newWaypoints);
    setWaypointSuggestions(prev => ({ ...prev, [index]: [] }));
  };

  // Calculate Route - with improved error handling and logging
  const calculateRoute = async () => {
    if (!startCoords || !endCoords) {
      toast.error(i18n.language === "de" ? "Bitte Start und Ziel eingeben" : "Please enter start and destination");
      return;
    }
    
    console.log("[RouteCalc] Starting calculation...");
    setLoading(true);
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setBreakSuggestions([]);
    setAllRestStopsOnRoute([]);
    setShowAllRestStops(false);
    setTrafficAlert(null);
    
    try {
      const waypointCoords = waypoints.filter(wp => wp.coords).map(wp => [wp.coords.lat, wp.coords.lon]);
      
      console.log("[RouteCalc] Fetching from API...");
      const [routeResponse, complianceResponse] = await Promise.all([
        axios.post(`${API}/route/professional`, {
          start_lat: startCoords.lat,
          start_lon: startCoords.lon,
          end_lat: endCoords.lat,
          end_lon: endCoords.lon,
          waypoints: waypointCoords,
          vehicle_height: 4.0,
          vehicle_width: 2.55,
          vehicle_length: 16.5,
          vehicle_weight: 40000,
          vehicle_axles: 5,
          include_toll: true,
          include_speed_cameras: true,
          alternatives: 2,
          eco_routing: ecoRouting
        }, { headers }),
        axios.get(`${API}/tachograph/compliance`, { headers })
      ]);
      
      console.log("[RouteCalc] API response received:", routeResponse.data ? "OK" : "NULL");
      console.log("[RouteCalc] Route data present:", !!routeResponse.data?.route);
      
      setComplianceStatus(complianceResponse.data);
      
      const routes = [];
      const mainRoute = routeResponse.data.route;
      const tollData = routeResponse.data.toll;
      const alternativeRoutes = routeResponse.data.alternatives || [];
      const restStopSuggestions = routeResponse.data.rest_stop_suggestions || [];
      const complianceData = routeResponse.data.compliance || {};
      
      if (!mainRoute || !mainRoute.geometry) {
        console.error("[RouteCalc] No route geometry in response");
        toast.error(i18n.language === "de" ? "Keine Route gefunden" : "No route found");
        setLoading(false);
        return;
      }
      
      // Process main route
      const mainGeometry = mainRoute.geometry.map(coord => [coord[1], coord[0]]);
      console.log("[RouteCalc] Main geometry points:", mainGeometry.length);
      
      // Use backend rest stop suggestions if available, otherwise calculate locally
      const mainBreaks = restStopSuggestions.length > 0 
        ? formatBackendBreakSuggestions(restStopSuggestions)
        : calculateBreakSuggestions(mainRoute.distance_km || 0, mainRoute.duration_minutes || 0);
      
      routes.push({
        geometry: mainGeometry,
        distance_km: mainRoute.distance_km?.toFixed(1) || 0,
        duration_minutes: Math.round(mainRoute.duration_minutes) || 0,
        toll_cost: tollData?.toll_cost || 0,
        fuel_cost: (mainRoute.distance_km / 100 * 32 * 1.85).toFixed(2),
        traffic_delay: Math.round(mainRoute.traffic_delay_minutes || 0),
        source: mainRoute.source,
        instructions: mainRoute.instructions || [],
        breakSuggestions: mainBreaks,
        compliance: complianceData,
        label: i18n.language === "de" ? "Schnellste" : "Fastest",
        color: "#2563EB"  // Dark blue for main route
      });
      
      // Process alternatives
      alternativeRoutes.forEach((alt, idx) => {
        if (alt.geometry && alt.geometry.length > 0) {
          const altGeometry = alt.geometry.map(coord => [coord[1], coord[0]]);
          const altBreaks = calculateBreakSuggestions(alt.distance_km || 0, alt.duration_minutes || 0);
          
          routes.push({
            geometry: altGeometry,
            distance_km: alt.distance_km?.toFixed(1) || 0,
            duration_minutes: Math.round(alt.duration_minutes) || 0,
            toll_cost: alt.toll_cost || 0,
            fuel_cost: (alt.distance_km / 100 * 32 * 1.85).toFixed(2),
            traffic_delay: Math.round(alt.traffic_delay_minutes || 0),
            source: alt.source || "tomtom",
            instructions: alt.instructions || [],
            breakSuggestions: altBreaks,
            label: i18n.language === "de" ? `Alt. ${idx + 1}` : `Alt. ${idx + 1}`,
            color: "#93C5FD"  // Light blue for alternatives
          });
        }
      });
      
      console.log("[RouteCalc] Setting routes, count:", routes.length);
      setAllRoutes(routes);
      
      if (routes.length > 0) {
        console.log("[RouteCalc] Setting break suggestions");
        setBreakSuggestions(routes[0].breakSuggestions || []);
      }
      
      // Set map bounds
      const allPoints = [[startCoords.lat, startCoords.lon], [endCoords.lat, endCoords.lon]];
      waypoints.forEach(wp => { if (wp.coords) allPoints.push([wp.coords.lat, wp.coords.lon]); });
      setMapBounds(allPoints);
      setPanelExpanded(true);
      
      console.log("[RouteCalc] Starting traffic monitoring");
      // Start traffic monitoring
      startTrafficMonitoring();
      
      console.log("[RouteCalc] Calculation complete!");
      
    } catch (error) {
      console.error("[RouteCalc] Error:", error);
      toast.error(i18n.language === "de" ? "Route konnte nicht berechnet werden" : "Route calculation failed");
    } finally {
      console.log("[RouteCalc] Setting loading to false");
      setLoading(false);
    }
  };

  // When route selection changes
  useEffect(() => {
    if (allRoutes[selectedRouteIndex]) {
      setBreakSuggestions(allRoutes[selectedRouteIndex].breakSuggestions || []);
      setSelectedBreak(null);
      setAllRestStopsOnRoute([]);
      setShowAllRestStops(false);
    }
  }, [selectedRouteIndex, allRoutes]);

  // Break Suggestions - kann Backend-Daten oder lokale Berechnung nutzen
  const calculateBreakSuggestions = (distanceKm, durationMinutes) => {
    if (!distanceKm || !durationMinutes) return [];
    const remainingDriveMinutes = complianceStatus?.break_required_in_minutes || 270;
    const avgSpeed = distanceKm / (durationMinutes / 60);
    
    const suggestions = [];
    const breakTimes = [
      { time: 90, label: i18n.language === "de" ? "Früh (1,5h)" : "Early (1.5h)", color: "emerald", type: "early" },
      { time: 180, label: i18n.language === "de" ? "Mittel (3h)" : "Medium (3h)", color: "amber", type: "medium" },
      { time: Math.min(270, remainingDriveMinutes), label: i18n.language === "de" ? "Spät (4,5h)" : "Late (4.5h)", color: "red", type: "late" }
    ];
    
    breakTimes.forEach(bt => {
      if (bt.time <= durationMinutes) {
        const km = Math.round(avgSpeed * (bt.time / 60));
        if (km <= distanceKm) {
          suggestions.push({ ...bt, distance_km: km, recommended: bt.time <= remainingDriveMinutes });
        }
      }
    });
    
    return suggestions;
  };
  
  // Konvertiere Backend rest_stop_suggestions Format zu Frontend Format
  const formatBackendBreakSuggestions = (backendSuggestions) => {
    if (!backendSuggestions || backendSuggestions.length === 0) return [];
    
    return backendSuggestions.map(s => ({
      type: s.type,
      label: s.label,
      color: s.color === "green" ? "emerald" : s.color === "yellow" ? "amber" : "red",
      distance_km: s.distance_from_start_km,
      time: s.at_route_minute,
      location: s.location,
      rating: s.rating,
      recommended: s.type !== "late",
      // Echte Rastplatz-Daten vom Backend
      rest_stop_name: s.rest_stop_name || null,
      rest_stop_address: s.rest_stop_address || null,
      is_truck_friendly: s.is_truck_friendly || false
    }));
  };

  // Check custom break feasibility
  const checkCustomBreakFeasibility = (customKm) => {
    if (!route || !complianceStatus) return null;
    const totalDistance = parseFloat(route.distance_km);
    const remainingDriveMinutes = complianceStatus?.break_required_in_minutes || 270;
    const avgSpeed = totalDistance / (route.duration_minutes / 60);
    const maxKmBeforeBreak = Math.round(avgSpeed * (remainingDriveMinutes / 60));
    const km = parseFloat(customKm);
    
    if (isNaN(km) || km <= 0) {
      return { feasible: false, reason: i18n.language === "de" ? "Bitte gültige Entfernung eingeben" : "Please enter valid distance" };
    }
    if (km > totalDistance) {
      return { feasible: false, reason: i18n.language === "de" ? `Route ist nur ${totalDistance.toFixed(0)} km` : `Route is only ${totalDistance.toFixed(0)} km` };
    }
    if (km > maxKmBeforeBreak) {
      return { feasible: false, reason: i18n.language === "de" ? `Max ${maxKmBeforeBreak} km (EU 561/2006)` : `Max ${maxKmBeforeBreak} km (EU 561/2006)`, warning: true };
    }
    
    const drivingMinutes = Math.round((km / avgSpeed) * 60);
    return { feasible: true, reason: `✓ ${drivingMinutes} min`, drivingMinutes };
  };

  const setCustomBreak = () => {
    const feasibility = checkCustomBreakFeasibility(customBreakKm);
    setCustomBreakFeasibility(feasibility);
    if (feasibility?.feasible) {
      const km = parseFloat(customBreakKm);
      setSelectedBreak({
        time: feasibility.drivingMinutes,
        label: `${km} km`,
        color: "blue",
        distance_km: km,
        isCustom: true
      });
      setShowCustomBreakInput(false);
      toast.success(i18n.language === "de" ? `Fahrtunterbrechung bei ${km} km` : `Break at ${km} km`);
    }
  };

  // Search all rest stops along route
  const searchAllRestStopsOnRoute = async () => {
    if (!route?.geometry || route.geometry.length === 0) return;
    setShowAllRestStops(true);
    toast.info(i18n.language === "de" ? "Suche LKW-Rastplätze..." : "Searching truck rest stops...");
    
    try {
      const totalPoints = route.geometry.length;
      const sampleInterval = Math.max(1, Math.floor(totalPoints / 10));
      const samplePoints = [];
      
      for (let i = 0; i < totalPoints; i += sampleInterval) {
        const point = route.geometry[i];
        if (point) samplePoints.push(`(around:15000,${point[0]},${point[1]})`);
      }
      
      // Erweiterte Suche nach LKW-Rastplätzen, Autohöfen, Tankstellen
      const query = `[out:json][timeout:25];(
        node["amenity"="parking"]["hgv"="yes"]${samplePoints.join('')};
        node["highway"="rest_area"]${samplePoints.join('')};
        node["highway"="services"]${samplePoints.join('')};
        node["amenity"="fuel"]["hgv"="yes"]${samplePoints.join('')};
        way["highway"="services"]${samplePoints.join('')};
        way["highway"="rest_area"]${samplePoints.join('')};
      );out center 40;`;
      
      const response = await axios.post("https://overpass-api.de/api/interpreter", query, { headers: { "Content-Type": "text/plain" }, timeout: 30000 });
      
      const stops = response.data.elements?.map(el => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        if (!lat || !lon) return null;
        
        let minDist = Infinity, nearestIndex = 0;
        route.geometry.forEach((point, idx) => {
          const dist = Math.sqrt(Math.pow(point[0] - lat, 2) + Math.pow(point[1] - lon, 2));
          if (dist < minDist) { minDist = dist; nearestIndex = idx; }
        });
        const kmOnRoute = Math.round((nearestIndex / route.geometry.length) * parseFloat(route.distance_km));
        
        const tags = el.tags || {};
        return {
          name: tags.name || (tags.highway === "services" ? "Raststätte" : tags.amenity === "fuel" ? "Tankstelle" : "LKW-Parkplatz"),
          lat, lon,
          km_on_route: kmOnRoute,
          has_fuel: tags.amenity === "fuel" || tags.fuel === "yes",
          has_restaurant: tags.food === "yes" || tags.restaurant === "yes" || tags.amenity === "restaurant",
          has_shower: tags.shower === "yes",
          has_parking: tags.parking === "yes" || tags.amenity === "parking",
          type: tags.highway || tags.amenity || "parking"
        };
      }).filter(Boolean).sort((a, b) => a.km_on_route - b.km_on_route).filter((stop, idx, arr) => !arr.slice(0, idx).some(s => Math.abs(s.km_on_route - stop.km_on_route) < 8)) || [];
      
      setAllRestStopsOnRoute(stops);
      toast.success(i18n.language === "de" ? `${stops.length} Rastplätze gefunden` : `${stops.length} rest stops found`);
    } catch (error) {
      console.error("Rest stop search error:", error);
      toast.error(i18n.language === "de" ? "Suche fehlgeschlagen" : "Search failed");
    }
  };

  const selectRestStopAsBreak = (restStop) => {
    const feasibility = checkCustomBreakFeasibility(restStop.km_on_route.toString());
    if (feasibility?.feasible) {
      setSelectedBreak({
        time: feasibility.drivingMinutes,
        label: restStop.name,
        color: "blue",
        distance_km: restStop.km_on_route,
        isCustom: true,
        restStop
      });
      toast.success(`${restStop.name} (km ${restStop.km_on_route})`);
    } else {
      toast.error(feasibility?.reason || "Nicht möglich");
    }
  };

  // Rastplatz als Zwischenziel einfügen und Route neu berechnen
  const addRestStopAsWaypoint = async (breakSuggestion) => {
    if (!breakSuggestion.location) {
      toast.error(i18n.language === "de" ? "Keine Koordinaten verfügbar" : "No coordinates available");
      return;
    }
    
    // Finde die richtige Position für den Rastplatz (nach km auf der Route)
    const breakKm = breakSuggestion.distance_km;
    let insertIndex = waypoints.length; // Standard: am Ende der Waypoints
    
    // Berechne km-Position aller existierenden Waypoints
    // und füge den Rastplatz an der richtigen Stelle ein
    if (route && route.geometry) {
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        if (wp.coords && wp.km_on_route !== undefined) {
          if (breakKm < wp.km_on_route) {
            insertIndex = i;
            break;
          }
        }
      }
    }
    
    // Neuer Waypoint für den Rastplatz - MIT echtem Namen und Adresse
    const displayName = breakSuggestion.rest_stop_name || breakSuggestion.label;
    const displayAddress = breakSuggestion.rest_stop_address || `km ${breakKm}`;
    
    const restStopWaypoint = {
      text: displayName,
      address: displayAddress,
      coords: {
        lat: breakSuggestion.location.lat,
        lon: breakSuggestion.location.lon
      },
      km_on_route: breakKm,
      isRestStop: true,
      rest_stop_name: breakSuggestion.rest_stop_name,
      rest_stop_address: breakSuggestion.rest_stop_address
    };
    
    // Waypoints aktualisieren
    const newWaypoints = [...waypoints];
    newWaypoints.splice(insertIndex, 0, restStopWaypoint);
    setWaypoints(newWaypoints);
    
    toast.success(
      i18n.language === "de" 
        ? `${displayName} als Zwischenziel hinzugefügt` 
        : `${displayName} added as waypoint`
    );
    
    // Route automatisch neu berechnen
    setTimeout(() => {
      calculateRoute();
    }, 500);
  };

  // Traffic Monitoring
  const startTrafficMonitoring = () => {
    if (trafficCheckInterval.current) clearInterval(trafficCheckInterval.current);
    // Prüfe alle 60 Sekunden während der Navigation
    trafficCheckInterval.current = setInterval(() => {
      if (route && isNavigating) checkForTrafficUpdates();
    }, 60000);
    // Erste Prüfung sofort
    if (route) checkForTrafficUpdates();
  };

  const checkForTrafficUpdates = async () => {
    if (!startCoords || !endCoords || !route) return;
    try {
      const waypointCoords = waypoints.filter(wp => wp.coords).map(wp => [wp.coords.lat, wp.coords.lon]);
      const response = await axios.post(`${API}/route/traffic-check`, {
        start_lat: startCoords.lat, start_lon: startCoords.lon,
        end_lat: endCoords.lat, end_lon: endCoords.lon,
        waypoints: waypointCoords,
        current_route_duration: route.duration_minutes
      }, { headers });
      
      if (response.data.has_better_route) {
        setTrafficAlert({
          message: i18n.language === "de" ? `Stau! Alternative spart ${response.data.time_saved_minutes} min` : `Traffic! Alternative saves ${response.data.time_saved_minutes} min`,
          timeSaved: response.data.time_saved_minutes,
          newDuration: response.data.new_duration_minutes,
          trafficDelay: response.data.current_traffic_delay
        });
        setAlternativeRoute(response.data.alternative_route);
      } else if (response.data.current_traffic_delay > 5) {
        // Zeige Info über aktuelle Verzögerung auch ohne bessere Route
        toast.info(i18n.language === "de" 
          ? `Aktuelle Verkehrsverzögerung: ${response.data.current_traffic_delay} min` 
          : `Current traffic delay: ${response.data.current_traffic_delay} min`
        );
      }
    } catch (error) {
      console.error("Traffic check error:", error);
    }
  };

  const acceptAlternativeRoute = () => {
    if (alternativeRoute) {
      const updatedRoutes = [...allRoutes];
      updatedRoutes[selectedRouteIndex] = {
        ...alternativeRoute,
        geometry: alternativeRoute.geometry?.map(coord => [coord[1], coord[0]]) || [],
        label: i18n.language === "de" ? "Umleitung" : "Detour",
        color: "#10B981"
      };
      setAllRoutes(updatedRoutes);
      setTrafficAlert(null);
      setAlternativeRoute(null);
      toast.success(i18n.language === "de" ? "Route aktualisiert!" : "Route updated!");
    }
  };

  // Touch/swipe state for results panel - 3 states: hidden (null), collapsed (false), expanded (true)
  const [touchStartY, setTouchStartY] = useState(null);
  
  // Handle swipe on results panel
  const handleResultsTouchStart = (e) => {
    setTouchStartY(e.touches[0].clientY);
  };
  
  const handleResultsTouchMove = (e) => {
    if (touchStartY === null) return;
    const diff = touchStartY - e.touches[0].clientY;
    if (diff > 40) {
      // Swiping UP
      if (panelExpanded === null) setPanelExpanded(false);
      else if (!panelExpanded) setPanelExpanded(true);
      setTouchStartY(null);
    } else if (diff < -40) {
      // Swiping DOWN
      if (panelExpanded === true) setPanelExpanded(false);
      else if (panelExpanded === false) setPanelExpanded(null); // Completely hide
      setTouchStartY(null);
    }
  };
  
  const handleResultsTouchEnd = () => {
    setTouchStartY(null);
  };
  
  // Cycle panel states on click
  const handlePanelClick = () => {
    if (panelExpanded === null) setPanelExpanded(false);
    else if (panelExpanded === false) setPanelExpanded(true);
    else setPanelExpanded(false);
  };

  // Format helpers
  const formatDuration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  };

  if (!user || !token) return null;

  return (
    <div className="h-screen w-screen fixed inset-0 bg-black overflow-hidden">
      {/* Map - Higher quality TomTom Vector tiles */}
      <MapContainer center={[51.1657, 10.4515]} zoom={6} className="h-full w-full z-0" zoomControl={false}>
        <TileLayer
          attribution='&copy; TomTom'
          url={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${process.env.REACT_APP_TOMTOM_API_KEY || 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX'}&tileSize=512&view=Unified`}
          maxZoom={22}
          tileSize={512}
          zoomOffset={-1}
        />
        <MapController bounds={mapBounds} />
        
        {startCoords && <Marker position={[startCoords.lat, startCoords.lon]} icon={startIcon}><Popup>{startText || "Start"}</Popup></Marker>}
        
        {waypoints.map((wp, idx) => wp.coords && (
          <Marker key={`wp-${idx}`} position={[wp.coords.lat, wp.coords.lon]} icon={new L.DivIcon({
            className: "custom-marker",
            html: `<div style="background:#8B5CF6;width:22px;height:22px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;">${idx+1}</div>`,
            iconSize: [22, 22], iconAnchor: [11, 11]
          })}><Popup>{wp.text || `Zwischenziel ${idx + 1}`}</Popup></Marker>
        ))}
        
        {endCoords && <Marker position={[endCoords.lat, endCoords.lon]} icon={endIcon}><Popup>{endText || "Ziel"}</Popup></Marker>}
        
        {/* ALL 3 ROUTES VISIBLE - Alternative routes in light blue (clickable) */}
        {allRoutes.map((r, idx) => idx !== selectedRouteIndex && r.geometry?.length > 0 && (
          <Polyline 
            key={`route-alt-${idx}`} 
            positions={r.geometry} 
            pathOptions={{ 
              color: "#93C5FD", // Light blue for alternatives
              weight: 6, 
              opacity: 0.8,
              lineCap: "round",
              lineJoin: "round"
            }}
            eventHandlers={{ 
              click: () => {
                setSelectedRouteIndex(idx);
                toast.info(i18n.language === "de" ? `Route ${idx + 1} ausgewählt` : `Route ${idx + 1} selected`);
              }
            }} 
          />
        ))}
        
        {/* Selected route in dark blue (on top) */}
        {route?.geometry?.length > 0 && (
          <Polyline 
            positions={route.geometry} 
            pathOptions={{ 
              color: "#2563EB", // Dark blue for selected route
              weight: 7, 
              opacity: 1,
              lineCap: "round",
              lineJoin: "round"
            }} 
          />
        )}
        
        {/* 3 RASTPLATZ-EMPFEHLUNGEN als Marker auf der Karte */}
        {breakSuggestions.map((bs, idx) => bs.location && (
          <Marker 
            key={`break-suggestion-${idx}`}
            position={[bs.location.lat, bs.location.lon]}
            icon={new L.DivIcon({
              className: "break-suggestion-marker",
              html: `<div style="
                width: 32px; 
                height: 32px; 
                background: ${bs.color === 'emerald' ? '#10B981' : bs.color === 'amber' ? '#F59E0B' : '#EF4444'}; 
                border-radius: 50%; 
                border: 3px solid white; 
                box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              ">
                <span style="color: white; font-size: 14px; font-weight: bold;">P</span>
              </div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
            eventHandlers={{
              click: () => {
                // Rastplatz als Zwischenziel einfügen
                addRestStopAsWaypoint(bs);
              }
            }}
          >
            <Popup>
              <div className="text-sm p-1">
                <p className="font-bold text-base">{bs.rest_stop_name || bs.label}</p>
                {bs.rest_stop_address && <p className="text-gray-600 text-xs">{bs.rest_stop_address}</p>}
                <p className="text-gray-600">km {bs.distance_km} · {bs.label}</p>
                {bs.is_truck_friendly && <p className="text-emerald-600 text-xs font-medium mt-1">🚛 LKW-freundlich</p>}
                <button 
                  onClick={() => addRestStopAsWaypoint(bs)}
                  className={`mt-2 w-full px-3 py-1.5 text-white text-xs rounded-lg font-medium ${
                    bs.color === 'emerald' ? 'bg-emerald-500 hover:bg-emerald-600' :
                    bs.color === 'amber' ? 'bg-amber-500 hover:bg-amber-600' :
                    'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {i18n.language === "de" ? "Als Zwischenziel" : "Add as waypoint"}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        
        {/* Rest stops from search */}
        {showAllRestStops && allRestStopsOnRoute.map((stop, idx) => (
          <Marker key={`rest-${idx}`} position={[stop.lat, stop.lon]} icon={restStopIcon}
            eventHandlers={{ click: () => selectRestStopAsBreak(stop) }}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{stop.name}</p>
                <p className="text-gray-600">km {stop.km_on_route}</p>
                <button onClick={() => selectRestStopAsBreak(stop)} className="mt-1 px-2 py-1 bg-orange-500 text-white text-xs rounded">
                  {i18n.language === "de" ? "Hier anhalten" : "Stop here"}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      
      {/* Back Button */}
      <button onClick={() => navigate("/dashboard")} className="absolute top-4 left-4 z-20 w-12 h-12 bg-zinc-900/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg" data-testid="back-btn">
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>
      
      {/* Manager Fleet Button */}
      {user?.role === "manager" && (
        <button onClick={() => navigate("/manager")} className="absolute top-4 right-4 z-20 w-12 h-12 bg-orange-500/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg" data-testid="fleet-btn">
          <Users className="w-5 h-5 text-white" />
        </button>
      )}
      
      {/* Traffic Alert */}
      {trafficAlert && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-md w-full mx-4">
          <div className="bg-amber-500 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-white" />
              <div className="flex-1">
                <p className="font-semibold text-white">{trafficAlert.message}</p>
                <p className="text-sm text-amber-100">{formatDuration(trafficAlert.newDuration)}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button onClick={acceptAlternativeRoute} className="flex-1 bg-white text-amber-600 hover:bg-amber-50">
                <RefreshCw className="w-4 h-4 mr-2" />{i18n.language === "de" ? "Umleiten" : "Reroute"}
              </Button>
              <Button onClick={() => { setTrafficAlert(null); setAlternativeRoute(null); }} variant="outline" className="border-white text-white">
                {i18n.language === "de" ? "Ignorieren" : "Ignore"}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MINIMAL GOOGLE MAPS STYLE SEARCH */}
      <div className="absolute top-4 left-4 right-4 z-10">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-full shadow-xl overflow-hidden">
            
            {/* Simple search bar - expands on focus */}
            <div className="flex items-center">
              {/* Back button when expanded or has route */}
              {(startCoords || route) && (
                <button 
                  onClick={() => { navigate('/dashboard'); }}
                  className="pl-4 pr-2 py-4 text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              
              {/* Start/End inputs stacked */}
              <div className="flex-1 py-2">
                {/* Start */}
                <div className="relative flex items-center px-4">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mr-3 flex-shrink-0" />
                  <input 
                    value={startText}
                    onChange={(e) => handleStartChange(e.target.value)}
                    placeholder={i18n.language === "de" ? "Start" : "Start"}
                    className="flex-1 py-2 text-gray-800 text-sm bg-transparent outline-none placeholder:text-gray-400"
                    data-testid="start-input"
                  />
                  <button onClick={autoDetectLocation} className={`p-1.5 rounded-full ${locationPermissionGranted ? "text-emerald-500" : "text-gray-400 hover:text-gray-600"}`}>
                    <Locate className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Divider with swap button */}
                <div className="relative px-4 my-1">
                  <div className="border-t border-gray-200" />
                </div>
                
                {/* End */}
                <div className="relative flex items-center px-4">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-3 flex-shrink-0" />
                  <input 
                    value={endText}
                    onChange={(e) => handleEndChange(e.target.value)}
                    placeholder={i18n.language === "de" ? "Ziel eingeben" : "Enter destination"}
                    className="flex-1 py-2 text-gray-800 text-sm bg-transparent outline-none placeholder:text-gray-400"
                    data-testid="end-input"
                  />
                  <button 
                    onClick={isListening ? stopVoiceInput : startVoiceInput}
                    className={`p-1.5 rounded-full ${isListening ? "text-red-500 animate-pulse" : "text-gray-400 hover:text-gray-600"}`}
                    data-testid="voice-input-btn"
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Suggestions dropdown */}
            {(startSuggestions.length > 0 || endSuggestions.length > 0) && (
              <div className="border-t border-gray-100 max-h-60 overflow-y-auto">
                {startSuggestions.map((s, i) => (
                  <button key={`start-${i}`} onClick={() => selectStart(s)} className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" data-testid={`start-suggestion-${i}`}>
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
                {endSuggestions.map((s, i) => (
                  <button key={`end-${i}`} onClick={() => selectEnd(s)} className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3" data-testid={`end-suggestion-${i}`}>
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Waypoints - Only shown when there are waypoints */}
          {waypoints.length > 0 && (
            <div className="mt-2 bg-white rounded-2xl shadow-lg overflow-hidden">
              {waypoints.map((wp, idx) => (
                <div key={idx} className="flex items-center px-4 py-2 border-b border-gray-100 last:border-0">
                  <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold mr-3">{idx + 1}</div>
                  <input 
                    value={wp.text}
                    onChange={(e) => updateWaypointText(idx, e.target.value)}
                    placeholder={`${i18n.language === "de" ? "Stopp" : "Stop"} ${idx + 1}`}
                    className="flex-1 py-1 text-gray-800 text-sm bg-transparent outline-none"
                    data-testid={`waypoint-input-${idx}`}
                  />
                  <button onClick={() => removeWaypoint(idx)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Action buttons - Only when we have start and end */}
          {startCoords && endCoords && !route && (
            <div className="mt-3 flex gap-2">
              {waypoints.length < 7 && (
                <button onClick={addWaypoint} className="px-4 py-2 bg-white rounded-full shadow text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2" data-testid="add-waypoint-btn">
                  <Plus className="w-4 h-4" />
                  {i18n.language === "de" ? "Stopp" : "Stop"}
                </button>
              )}
              <button 
                onClick={() => setEcoRouting(!ecoRouting)} 
                className={`px-4 py-2 rounded-full shadow text-sm flex items-center gap-2 ${ecoRouting ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                data-testid="eco-routing-toggle"
              >
                <Leaf className="w-4 h-4" />
                Eco
              </button>
              <button 
                onClick={calculateRoute} 
                disabled={loading}
                className="flex-1 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="plan-route-btn"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                {i18n.language === "de" ? "Route" : "Route"}
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Results Panel - Fully swipeable with 3 states */}
      {route && (
        <>
          {/* Show Panel Button when hidden */}
          {panelExpanded === null && (
            <button 
              onClick={() => setPanelExpanded(false)} 
              className="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 px-6 py-3 bg-zinc-900/95 backdrop-blur rounded-full shadow-xl flex items-center gap-2 hover:bg-zinc-800 transition border border-zinc-700"
              data-testid="show-results-panel-btn"
            >
              <ChevronUp className="w-5 h-5 text-white" />
              <span className="text-white font-medium">{formatDuration(route.duration_minutes)}</span>
              <span className="text-zinc-400">·</span>
              <span className="text-zinc-400">{route.distance_km} km</span>
            </button>
          )}
          
          <div 
            className={`absolute left-0 right-0 z-20 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 rounded-t-3xl transition-all duration-300 ease-out overflow-hidden ${
              panelExpanded === true ? "bottom-0 h-[60vh]" : 
              panelExpanded === false ? "bottom-0 h-auto" : 
              "bottom-0 translate-y-full"
            }`}
            onTouchStart={handleResultsTouchStart}
            onTouchMove={handleResultsTouchMove}
            onTouchEnd={handleResultsTouchEnd}
          >
            {/* Swipe handle - more visible and touchable */}
            <div 
              onClick={handlePanelClick}
              className="w-full py-4 flex items-center justify-center cursor-grab active:cursor-grabbing"
            >
              <div className="w-12 h-1.5 bg-zinc-600 rounded-full" />
              <ChevronUp className={`absolute right-4 w-5 h-5 text-zinc-500 transition-transform ${panelExpanded === true ? "rotate-180" : ""}`} />
            </div>
          
          {/* Route Selection */}
          {allRoutes.length > 1 && (
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
              {allRoutes.map((r, idx) => (
                <button key={idx} onClick={() => setSelectedRouteIndex(idx)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all ${selectedRouteIndex === idx ? "bg-orange-500/20 border-orange-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400"}`}
                  data-testid={`route-option-${idx}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="text-sm font-medium">{r.label}</span>
                  </div>
                  <p className="text-xs mt-1">{formatDuration(r.duration_minutes)} · {r.distance_km} km</p>
                </button>
              ))}
            </div>
          )}
          
          {/* Summary */}
          <div className="px-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{formatDuration(route.duration_minutes)}</p>
              <p className="text-sm text-zinc-500">{route.distance_km} km · {route.label}</p>
            </div>
            <Button onClick={() => setIsNavigating(true)} className="h-12 px-6 bg-orange-500 hover:bg-orange-600" data-testid="start-navigation-btn">
              <Navigation className="w-5 h-5 mr-2" />{i18n.language === "de" ? "Los" : "Go"}
            </Button>
          </div>
          
          {/* Scrollable Content */}
          <div className={`overflow-y-auto px-4 pb-4 ${panelExpanded ? "h-[calc(60vh-180px)]" : ""}`}>
            
            {/* Break Suggestions */}
            {breakSuggestions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">{i18n.language === "de" ? "Fahrtunterbrechung (EU 561/2006)" : "Break (EU 561/2006)"}</p>
                  <div className="flex gap-2">
                    <button onClick={searchAllRestStopsOnRoute} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1" data-testid="show-all-reststops-btn">
                      <ParkingCircle className="w-3 h-3" />{i18n.language === "de" ? "Rastplätze" : "Rest stops"}
                    </button>
                    <button onClick={() => setShowCustomBreakInput(!showCustomBreakInput)} className="text-xs text-blue-400 hover:text-blue-300" data-testid="custom-break-btn">
                      {i18n.language === "de" ? "Eigene Wahl" : "Custom"}
                    </button>
                  </div>
                </div>
                
                {showCustomBreakInput && (
                  <div className="mb-3 p-3 bg-zinc-800 rounded-xl">
                    <div className="flex gap-2">
                      <Input type="number" value={customBreakKm} onChange={(e) => { setCustomBreakKm(e.target.value); setCustomBreakFeasibility(checkCustomBreakFeasibility(e.target.value)); }}
                        placeholder={`km (max ${route.distance_km})`} className="flex-1 h-10 bg-zinc-900 border-zinc-700" data-testid="custom-break-input" />
                      <Button onClick={setCustomBreak} disabled={!customBreakFeasibility?.feasible} className="h-10 bg-blue-500 hover:bg-blue-600">OK</Button>
                    </div>
                    {customBreakFeasibility && <p className={`text-xs mt-2 ${customBreakFeasibility.feasible ? "text-emerald-400" : "text-red-400"}`}>{customBreakFeasibility.reason}</p>}
                  </div>
                )}
                
                <div className="flex gap-2">
                  {breakSuggestions.map((b, idx) => (
                    <button key={idx} onClick={() => setSelectedBreak(b)}
                      className={`flex-1 p-3 rounded-xl border transition-all ${selectedBreak?.time === b.time && !selectedBreak?.isCustom ? `border-${b.color}-500 bg-${b.color}-500/20` : "bg-zinc-800 border-zinc-700"}`}
                      data-testid={`break-suggestion-${idx}`}>
                      <p className={`text-xs font-medium text-${b.color}-400`}>{b.label}</p>
                      <p className="text-white font-bold">{b.distance_km} km</p>
                      {b.rest_stop_name && (
                        <p className="text-xs text-zinc-400 truncate mt-1" title={b.rest_stop_name}>{b.rest_stop_name}</p>
                      )}
                    </button>
                  ))}
                </div>
                
                {/* Add as Waypoint Button for selected break */}
                {selectedBreak && (
                  <button 
                    onClick={() => addRestStopAsWaypoint(selectedBreak)}
                    className="w-full mt-3 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-500/30 transition"
                    data-testid="add-break-as-waypoint-btn"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">
                      {selectedBreak.rest_stop_name || `km ${selectedBreak.distance_km}`} {i18n.language === "de" ? "als Zwischenziel" : "as waypoint"}
                    </span>
                  </button>
                )}
                
                {selectedBreak?.isCustom && (
                  <div className="mt-2 p-3 bg-blue-500/20 border border-blue-500/50 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-400">{i18n.language === "de" ? "Eigene Wahl" : "Custom"}</p>
                      <p className="text-white font-bold">{selectedBreak.restStop?.name || `${selectedBreak.distance_km} km`}</p>
                    </div>
                    <button onClick={() => setSelectedBreak(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            )}
            
            {/* Rest Stops List */}
            {showAllRestStops && allRestStopsOnRoute.length > 0 && (
              <div className="mb-4 border border-zinc-700 rounded-xl overflow-hidden">
                <div className="bg-zinc-800 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{allRestStopsOnRoute.length} {i18n.language === "de" ? "Rastplätze entlang der Route" : "rest stops along route"}</span>
                  <button onClick={() => setShowAllRestStops(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {allRestStopsOnRoute.map((stop, idx) => {
                    const feasibility = checkCustomBreakFeasibility(stop.km_on_route.toString());
                    return (
                      <button key={idx} onClick={() => selectRestStopAsBreak(stop)}
                        className={`w-full px-3 py-3 flex items-center justify-between border-b border-zinc-800 hover:bg-zinc-800 transition ${!feasibility?.feasible ? "opacity-50" : ""}`}
                        data-testid={`rest-stop-${idx}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <ParkingCircle className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm text-white font-medium">{stop.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-zinc-500">km {stop.km_on_route}</span>
                              {stop.has_fuel && <Fuel className="w-3 h-3 text-amber-400" title="Tankstelle" />}
                              {stop.has_restaurant && <Utensils className="w-3 h-3 text-emerald-400" title="Restaurant" />}
                              {stop.has_shower && <span className="text-xs">🚿</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={`text-xs font-medium ${feasibility?.feasible ? "text-emerald-400" : "text-red-400"}`}>
                            {feasibility?.feasible ? "✓ möglich" : "✗ zu weit"}
                          </span>
                          {feasibility?.feasible && (
                            <span className="text-xs text-zinc-500">{feasibility.drivingMinutes} min</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Cost Breakdown */}
            <div className="p-4 bg-zinc-800 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400">{i18n.language === "de" ? "Mautkosten" : "Toll"}</span>
                <span className="text-white font-bold">~{route.toll_cost || 0}€</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400">{i18n.language === "de" ? "Kraftstoff" : "Fuel"}</span>
                <span className="text-white font-bold">~{route.fuel_cost}€</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-zinc-700">
                <span className="text-zinc-400 font-medium">{i18n.language === "de" ? "Gesamt" : "Total"}</span>
                <span className="text-orange-400 font-bold text-lg">~{(parseFloat(route.toll_cost || 0) + parseFloat(route.fuel_cost)).toFixed(2)}€</span>
              </div>
            </div>
          </div>
        </div>
        </>
      )}
      
      {/* Turn-by-Turn Navigation */}
      {isNavigating && route && (
        <TurnByTurnNavigation 
          route={route.geometry} 
          instructions={route.instructions} 
          startCoords={startCoords} 
          endCoords={endCoords}
          waypoints={waypoints}
          onClose={() => setIsNavigating(false)} 
          totalDistance={parseFloat(route.distance_km)} 
          totalDuration={route.duration_minutes}
          onRecalculateRoute={async (newStart) => {
            // Recalculate route from new position
            try {
              toast.info(i18n.language === "de" ? "Route wird neu berechnet..." : "Recalculating route...");
              const waypointCoords = waypoints.filter(wp => wp.coords).map(wp => [wp.coords.lat, wp.coords.lon]);
              const response = await axios.post(`${API}/route/professional`, {
                start_lat: newStart.lat,
                start_lon: newStart.lon,
                end_lat: endCoords.lat,
                end_lon: endCoords.lon,
                waypoints: waypointCoords,
                vehicle_height: 4.0,
                vehicle_width: 2.55,
                vehicle_length: 16.5,
                vehicle_weight: 40000,
                vehicle_axles: 5,
                include_toll: true,
                alternatives: 0
              }, { headers });
              
              const mainRoute = response.data.route;
              const newGeometry = mainRoute.geometry?.map(coord => [coord[1], coord[0]]) || [];
              
              // Update current route
              const updatedRoutes = [...allRoutes];
              updatedRoutes[selectedRouteIndex] = {
                ...updatedRoutes[selectedRouteIndex],
                geometry: newGeometry,
                distance_km: mainRoute.distance_km?.toFixed(1) || 0,
                duration_minutes: Math.round(mainRoute.duration_minutes) || 0,
                instructions: mainRoute.instructions || []
              };
              setAllRoutes(updatedRoutes);
              setStartCoords({ lat: newStart.lat, lon: newStart.lon });
              toast.success(i18n.language === "de" ? "Route aktualisiert!" : "Route updated!");
            } catch (error) {
              console.error("Recalculate error:", error);
              toast.error(i18n.language === "de" ? "Neuberechnung fehlgeschlagen" : "Recalculation failed");
            }
          }}
        />
      )}
    </div>
  );
};

export default SimpleRoutePlanner;
