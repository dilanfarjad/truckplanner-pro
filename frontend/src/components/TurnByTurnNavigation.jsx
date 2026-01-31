import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { 
  X,
  Volume2,
  VolumeX,
  Navigation2,
  MapPin,
  Coffee,
  AlertTriangle,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  RotateCcw,
  Locate,
  Car,
  ChevronUp
} from "lucide-react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Modern navigation arrow - sleek blue design like Google Maps
const createPositionMarker = () => {
  return new L.DivIcon({
    className: "nav-position-marker",
    html: `
      <div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4));">
        <svg width="50" height="50" viewBox="0 0 50 50">
          <defs>
            <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#60A5FA"/>
              <stop offset="100%" style="stop-color:#3B82F6"/>
            </linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <circle cx="25" cy="25" r="22" fill="rgba(59,130,246,0.15)">
            <animate attributeName="r" values="20;24;20" dur="2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/>
          </circle>
          <path d="M25 6 L38 42 L25 34 L12 42 Z" fill="url(#arrowGrad)" stroke="white" stroke-width="2" stroke-linejoin="round" filter="url(#glow)"/>
        </svg>
      </div>
    `,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
  });
};

// Map follower with smooth rotation
const MapFollower = ({ position, heading, zoom, isFollowing, onUserInteraction, smoothHeading, setSmoothHeading }) => {
  const map = useMap();
  
  useEffect(() => {
    const handleDrag = () => onUserInteraction?.();
    map.on('dragstart', handleDrag);
    return () => map.off('dragstart', handleDrag);
  }, [map, onUserInteraction]);
  
  useEffect(() => {
    if (position && isFollowing) {
      const latOffset = 0.002 * (18 - zoom);
      map.setView([position[0] + latOffset, position[1]], zoom, { animate: true, duration: 0.6 });
    }
  }, [position, zoom, isFollowing, map]);
  
  useEffect(() => {
    if (isFollowing && typeof heading === 'number' && !isNaN(heading)) {
      const diff = Math.abs(heading - smoothHeading);
      const normalizedDiff = diff > 180 ? 360 - diff : diff;
      if (normalizedDiff > 3) {
        let newHeading = smoothHeading + (heading - smoothHeading) * 0.15;
        if (heading - smoothHeading > 180) newHeading = smoothHeading - (360 - heading + smoothHeading) * 0.15;
        if (smoothHeading - heading > 180) newHeading = smoothHeading + (360 - smoothHeading + heading) * 0.15;
        setSmoothHeading(((newHeading % 360) + 360) % 360);
      }
    }
  }, [heading, isFollowing, smoothHeading, setSmoothHeading]);
  
  return null;
};

// Maneuver icons
const ManeuverIcon = ({ type, size = "large" }) => {
  const cls = size === "large" ? "w-10 h-10" : "w-6 h-6";
  const t = type?.toLowerCase() || "straight";
  if (t.includes("left") && t.includes("slight")) return <ArrowUpLeft className={cls} />;
  if (t.includes("right") && t.includes("slight")) return <ArrowUpRight className={cls} />;
  if (t.includes("left")) return <CornerUpLeft className={cls} />;
  if (t.includes("right")) return <CornerUpRight className={cls} />;
  if (t.includes("u-turn")) return <RotateCcw className={cls} />;
  if (t.includes("arrive") || t.includes("destination")) return <MapPin className={cls} />;
  return <ArrowUp className={cls} />;
};

const TurnByTurnNavigation = ({ 
  route, instructions = [], startCoords, endCoords, onClose, totalDistance, totalDuration, trafficDelay = 0, onRecalculateRoute, waypoints = []
}) => {
  const { i18n } = useTranslation();
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const bottomSheetRef = useRef(null);
  
  const [currentPosition, setCurrentPosition] = useState(startCoords ? { lat: startCoords.lat, lon: startCoords.lon } : null);
  const [heading, setHeading] = useState(0);
  const [smoothHeading, setSmoothHeading] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(17);
  
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToNextTurn, setDistanceToNextTurn] = useState(0);
  const [remainingDistance, setRemainingDistance] = useState(totalDistance || 0);
  const [remainingTime, setRemainingTime] = useState(totalDuration || 0);
  const [progressPercent, setProgressPercent] = useState(0);
  
  // Waypoint tracking - welches ist das nächste Ziel?
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [distanceToNextWaypoint, setDistanceToNextWaypoint] = useState(0);
  const [timeToNextWaypoint, setTimeToNextWaypoint] = useState(0);
  const [nextWaypointName, setNextWaypointName] = useState("");
  
  const [isMuted, setIsMuted] = useState(true);
  const [showBreakWarning, setShowBreakWarning] = useState(false);
  const [drivingTime, setDrivingTime] = useState(0);
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [showRecalculatePrompt, setShowRecalculatePrompt] = useState(false);
  
  const watchId = useRef(null);
  const drivingInterval = useRef(null);
  const lastRecalculateTime = useRef(0);
  
  // Alle Ziele: Waypoints + Endziel
  const allDestinations = [
    ...(waypoints || []).map(wp => ({
      name: wp.text || wp.name || "Zwischenziel",
      lat: wp.coords?.lat || wp.lat,
      lon: wp.coords?.lon || wp.lon,
      isRestStop: wp.isRestStop || false
    })),
    { name: i18n.language === "de" ? "Ziel" : "Destination", lat: endCoords?.lat, lon: endCoords?.lon, isRestStop: false }
  ].filter(d => d.lat && d.lon);
  
  const currentDestination = allDestinations[currentWaypointIndex] || allDestinations[0];
  
  // Build real navigation instructions from route data
  const navInstructions = instructions.length > 0 ? instructions : [
    { text: i18n.language === "de" ? "Der Route folgen" : "Follow the route", distance_m: (totalDistance || 0) * 1000, maneuver: "straight" },
    { text: i18n.language === "de" ? "Ziel erreicht" : "Destination reached", distance_m: 0, maneuver: "arrive" }
  ];
  
  const currentStep = navInstructions[currentStepIndex] || navInstructions[0];
  const nextStep = navInstructions[currentStepIndex + 1];
  
  // Helper functions - defined before useEffect
  const calcDist = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }, []);
  
  // Check if user is off-route (more than 50m from any point on the route)
  const checkIfOffRoute = useCallback((lat, lon) => {
    if (!route || route.length === 0) return false;
    
    // Find minimum distance to route
    let minDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const point = route[i];
      const dist = calcDist(lat, lon, point[0], point[1]) * 1000; // Convert to meters
      if (dist < minDist) minDist = dist;
      if (dist < 50) return false; // Early exit if close enough
    }
    
    return minDist > 50; // More than 50m from route
  }, [route, calcDist]);
  
  // Handle route recalculation
  const handleRecalculate = useCallback(() => {
    if (onRecalculateRoute && currentPosition) {
      const now = Date.now();
      // Prevent recalculation spam (min 30 seconds between)
      if (now - lastRecalculateTime.current > 30000) {
        lastRecalculateTime.current = now;
        setIsOffRoute(false);
        setShowRecalculatePrompt(false);
        onRecalculateRoute(currentPosition);
      }
    }
  }, [onRecalculateRoute, currentPosition]);
  
  // GPS tracking with off-route detection and waypoint tracking
  useEffect(() => {
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, heading: h, speed: s } = pos.coords;
          setCurrentPosition({ lat: latitude, lon: longitude });
          if (h !== null && !isNaN(h)) setHeading(h);
          if (s !== null && !isNaN(s)) setSpeed(Math.round(s * 3.6));
          
          const avgSpeed = speed > 10 ? speed : 70;
          
          // Berechne Distanz zum NÄCHSTEN Waypoint (nicht Endziel!)
          if (currentDestination?.lat && currentDestination?.lon) {
            const distToNext = calcDist(latitude, longitude, currentDestination.lat, currentDestination.lon);
            setDistanceToNextWaypoint(Math.max(0, distToNext));
            setTimeToNextWaypoint(Math.round((distToNext / avgSpeed) * 60));
            setNextWaypointName(currentDestination.name || "Ziel");
            
            // Prüfe ob Waypoint erreicht (innerhalb 200m)
            if (distToNext < 0.2 && currentWaypointIndex < allDestinations.length - 1) {
              // Nächster Waypoint
              setCurrentWaypointIndex(prev => prev + 1);
              toast?.success?.(i18n.language === "de" 
                ? `${currentDestination.name} erreicht!` 
                : `${currentDestination.name} reached!`
              );
            }
          }
          
          // Berechne auch Gesamtdistanz zum Endziel
          if (endCoords && totalDistance) {
            const remainingToEnd = calcDist(latitude, longitude, endCoords.lat, endCoords.lon);
            setRemainingDistance(Math.max(0, remainingToEnd));
            setProgressPercent(Math.min(100, ((totalDistance - remainingToEnd) / totalDistance) * 100));
            setRemainingTime(Math.round((remainingToEnd / avgSpeed) * 60));
          }
          
          // Check if off-route
          const offRoute = checkIfOffRoute(latitude, longitude);
          if (offRoute && !isOffRoute) {
            setIsOffRoute(true);
            setShowRecalculatePrompt(true);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }
    
    drivingInterval.current = setInterval(() => {
      setDrivingTime(prev => {
        if (prev + 1 === 240) setShowBreakWarning(true);
        return prev + 1;
      });
    }, 60000);
    
    return () => {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (drivingInterval.current) clearInterval(drivingInterval.current);
    };
  }, [endCoords, totalDistance, speed, checkIfOffRoute, isOffRoute, calcDist, currentDestination, currentWaypointIndex, allDestinations.length, i18n.language]);
  
  // Compute traffic status directly from prop (no state needed)
  const currentTrafficStatus = trafficDelay > 20 ? "heavy" : trafficDelay > 5 ? "slow" : "normal";
  
  const fmtDist = km => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const fmtDistM = m => m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
  const fmtTime = min => { const h = Math.floor(min/60), m = Math.round(min%60); return h ? `${h} h ${m} min` : `${m} min`; };
  
  const handleRecenter = useCallback(() => { setIsFollowing(true); setZoomLevel(17); }, []);
  const handleUserInteraction = useCallback(() => { setIsFollowing(false); }, []);
  
  // Swipe handling for bottom sheet - 3 states: hidden (null), collapsed (false), expanded (true)
  const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
  const handleTouchMove = (e) => {
    if (!touchStart) return;
    const diff = touchStart - e.touches[0].clientY;
    if (diff > 40) { 
      // Swiping UP
      if (bottomSheetExpanded === null) setBottomSheetExpanded(false);
      else if (bottomSheetExpanded === false) setBottomSheetExpanded(true);
      setTouchStart(null); 
    }
    else if (diff < -40) { 
      // Swiping DOWN
      if (bottomSheetExpanded === true) setBottomSheetExpanded(false);
      else if (bottomSheetExpanded === false) setBottomSheetExpanded(null); // Completely hide
      setTouchStart(null); 
    }
  };
  const handleTouchEnd = () => setTouchStart(null);
  
  // Button to bring back hidden bottom sheet
  const showBottomSheet = () => setBottomSheetExpanded(false);

  const trafficColor = currentTrafficStatus === "heavy" ? "text-red-400" : currentTrafficStatus === "slow" ? "text-amber-400" : "text-emerald-400";
  const trafficText = currentTrafficStatus === "heavy" ? (i18n.language === "de" ? "Stau" : "Heavy") : currentTrafficStatus === "slow" ? (i18n.language === "de" ? "Stockend" : "Slow") : (i18n.language === "de" ? "Frei" : "Clear");

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
      
      {/* Map with smooth rotation - centered on arrow position */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          ref={mapContainerRef}
          className="absolute"
          style={{
            width: '150%', 
            height: '150%', 
            top: '-25%', 
            left: '-25%',
            transform: isFollowing ? `rotate(${-smoothHeading}deg)` : 'rotate(0deg)',
            transformOrigin: 'center 55%',
            transition: 'transform 0.8s ease-out'
          }}
        >
          <MapContainer
            ref={mapRef}
            center={currentPosition ? [currentPosition.lat, currentPosition.lon] : [51.1657, 10.4515]}
            zoom={zoomLevel}
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
          >
            {/* High quality TomTom tiles - 512px Retina for crisp display */}
            <TileLayer
              url={`https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${process.env.REACT_APP_TOMTOM_API_KEY || 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX'}&tileSize=512&view=Unified`}
              maxZoom={22}
              minZoom={3}
              tileSize={512}
              zoomOffset={-1}
              detectRetina={true}
              className="crisp-tiles"
            />
            
            {currentPosition && (
              <MapFollower 
                position={[currentPosition.lat, currentPosition.lon]} 
                heading={heading}
                zoom={zoomLevel}
                isFollowing={isFollowing}
                onUserInteraction={handleUserInteraction}
                smoothHeading={smoothHeading}
                setSmoothHeading={setSmoothHeading}
              />
            )}
            
            {route?.length > 0 && (
              <Polyline positions={route} pathOptions={{ color: "#4285F4", weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
            )}
            
            {/* NO position marker here - we use the fixed arrow overlay instead */}
            
            {endCoords && (
              <Marker position={[endCoords.lat, endCoords.lon]}
                icon={new L.DivIcon({
                  className: "dest-marker",
                  html: `<div style="width:28px;height:28px;background:linear-gradient(135deg,#EF4444,#DC2626);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"></div>`,
                  iconSize: [28, 28], iconAnchor: [14, 14]
                })}
              />
            )}
          </MapContainer>
        </div>
      </div>
      
      {/* TOP BAR - Compact, smooth, Google Maps style */}
      <div className="absolute top-0 left-0 right-0 z-[200]">
        <div className="mx-3 mt-3">
          <div className="bg-gradient-to-r from-emerald-500 via-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/30 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-4">
              {/* Maneuver Icon */}
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                <ManeuverIcon type={currentStep.maneuver} size="large" />
              </div>
              
              {/* Instruction */}
              <div className="flex-1 min-w-0">
                <p className="text-3xl font-bold text-white tracking-tight">
                  {fmtDistM(distanceToNextTurn || currentStep.distance_m || 1000)}
                </p>
                <p className="text-sm text-white/90 truncate mt-0.5">
                  {currentStep.text}
                </p>
              </div>
            </div>
            
            {/* Next instruction preview */}
            {nextStep && (
              <div className="px-4 py-2 bg-black/10 flex items-center gap-2 text-white/80 text-sm">
                <span className="text-xs opacity-70">{i18n.language === "de" ? "Dann" : "Then"}</span>
                <ManeuverIcon type={nextStep.maneuver} size="small" />
                <span className="truncate flex-1">{nextStep.text}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* FIXED NAVIGATION ARROW - Always visible in lower center */}
      <div className="absolute left-1/2 bottom-[35%] -translate-x-1/2 z-[150] pointer-events-none">
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 blur-xl bg-blue-500/50 rounded-full scale-150" />
          {/* Pulsing ring */}
          <div className="absolute -inset-4 border-4 border-blue-400/30 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
          {/* Arrow */}
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-10 h-10 drop-shadow-lg" fill="none">
              <path d="M12 2L4 20L12 16L20 20L12 2Z" fill="#3B82F6" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
      
      {/* RECENTER BUTTON - positioned above bottom bar */}
      {!isFollowing && (
        <button onClick={handleRecenter} data-testid="recenter-btn"
          className="absolute right-4 bottom-24 z-[200] w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-gray-100 transition">
          <Locate className="w-6 h-6 text-blue-600" />
        </button>
      )}
      
      {/* MINIMAL BOTTOM BAR - Shows time to NEXT waypoint, not final destination */}
      <div className="absolute bottom-0 left-0 right-0 z-[200]">
        
        {/* Collapsed minimal bar (default) */}
        {bottomSheetExpanded !== true && (
          <div 
            className="mx-3 mb-3"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              onClick={() => setBottomSheetExpanded(true)}
              className="bg-zinc-900/90 backdrop-blur-lg rounded-2xl border border-zinc-800/50 shadow-2xl cursor-pointer hover:bg-zinc-800/90 transition"
            >
              {/* Single row with NEXT WAYPOINT info (not final destination) */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Time & Distance to NEXT stop */}
                  <div>
                    <span className="text-2xl font-bold text-white">
                      {fmtTime(allDestinations.length > 1 && timeToNextWaypoint > 0 ? timeToNextWaypoint : remainingTime)}
                    </span>
                    <span className="text-zinc-500 ml-2">
                      {fmtDist(allDestinations.length > 1 && distanceToNextWaypoint > 0 ? distanceToNextWaypoint : remainingDistance)}
                    </span>
                  </div>
                  {/* Next destination name */}
                  {allDestinations.length > 1 && currentWaypointIndex < allDestinations.length - 1 && (
                    <div className="px-2 py-1 bg-purple-500/20 rounded-lg">
                      <span className="text-xs text-purple-300 truncate max-w-[120px] block">{nextWaypointName}</span>
                    </div>
                  )}
                  {/* Traffic indicator */}
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                    currentTrafficStatus === "heavy" ? "bg-red-500/20" : 
                    currentTrafficStatus === "slow" ? "bg-amber-500/20" : 
                    "bg-emerald-500/20"
                  }`}>
                    <Car className={`w-3 h-3 ${trafficColor}`} />
                    <span className={`text-xs font-medium ${trafficColor}`}>{trafficText}</span>
                  </div>
                </div>
                
                {/* Close button */}
                <Button onClick={(e) => { e.stopPropagation(); onClose(); }} size="sm" className="h-9 px-4 bg-red-500/80 hover:bg-red-600 rounded-full text-sm">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Progress bar */}
              <div className="px-4 pb-2">
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Expanded panel (when user swipes up) */}
        {bottomSheetExpanded === true && (
          <div 
            ref={bottomSheetRef}
            className="bg-zinc-900/95 backdrop-blur-xl rounded-t-3xl border-t border-zinc-700/50 shadow-2xl"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Swipe handle */}
            <div className="flex justify-center py-3 cursor-grab" onClick={() => setBottomSheetExpanded(false)}>
              <div className="w-10 h-1 bg-zinc-600 rounded-full" />
            </div>
            
            {/* Progress bar */}
            <div className="px-4 pb-2">
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
            
            {/* NÄCHSTES ZIEL - Waypoint-aware */}
            {allDestinations.length > 1 && currentWaypointIndex < allDestinations.length - 1 && (
              <div className="px-4 pb-2">
                <div className="bg-purple-500/20 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                      <Coffee className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-purple-300">{i18n.language === "de" ? "Nächstes Ziel" : "Next stop"}</p>
                      <p className="text-white font-semibold truncate max-w-[180px]">{nextWaypointName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white">{fmtTime(timeToNextWaypoint)}</p>
                    <p className="text-sm text-purple-300">{fmtDist(distanceToNextWaypoint)}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Main info row */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-zinc-500 mb-1">
                  {allDestinations.length > 1 
                    ? (i18n.language === "de" ? "Gesamte Route" : "Total route")
                    : (i18n.language === "de" ? "Zum Ziel" : "To destination")
                  }
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">{fmtTime(remainingTime)}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="text-lg text-zinc-400">{fmtDist(remainingDistance)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Car className={`w-4 h-4 ${trafficColor}`} />
                  <span className={`text-sm ${trafficColor}`}>{trafficText}</span>
                  {trafficDelay > 0 && <span className="text-xs text-zinc-500">+{trafficDelay} min</span>}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)} className="w-10 h-10 rounded-full bg-zinc-800">
                  {isMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-white" />}
                </Button>
                <Button onClick={onClose} className="h-10 px-5 bg-red-500 hover:bg-red-600 rounded-full text-sm font-medium">
                  <X className="w-4 h-4 mr-1" />{i18n.language === "de" ? "Beenden" : "Exit"}
                </Button>
              </div>
            </div>
            
            {/* Expanded content */}
            <div className="px-4 pb-6 space-y-3 overflow-y-auto" style={{ maxHeight: '40vh' }}>
              
              {/* Speed */}
              <div className="p-3 bg-zinc-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Navigation2 className="w-5 h-5 text-blue-400" />
                  <span className="text-zinc-400">{i18n.language === "de" ? "Geschwindigkeit" : "Speed"}</span>
                </div>
                <span className="text-xl font-bold">{speed} km/h</span>
              </div>
              
              {/* Driving time */}
              <div className={`p-3 rounded-xl flex items-center justify-between ${drivingTime >= 240 ? 'bg-red-500/20 border border-red-500/40' : drivingTime >= 210 ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-zinc-800'}`}>
                <div className="flex items-center gap-3">
                  <Coffee className={`w-5 h-5 ${drivingTime >= 240 ? 'text-red-400' : drivingTime >= 210 ? 'text-amber-400' : 'text-zinc-400'}`} />
                  <span className="text-zinc-400">{i18n.language === "de" ? "Lenkzeit" : "Driving"}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold">{fmtTime(drivingTime)}</span>
                  <p className={`text-xs ${drivingTime >= 240 ? 'text-red-400' : 'text-zinc-500'}`}>
                    {i18n.language === "de" ? "/ 4:30 max" : "/ 4:30 max"}
                  </p>
                </div>
              </div>
              
            </div>
          </div>
        )}
      </div>
      
      {/* Off-route recalculation prompt */}
      {showRecalculatePrompt && (
        <div className="absolute top-24 left-4 right-4 z-[250]">
          <div className="bg-amber-500 rounded-2xl p-4 shadow-xl shadow-amber-500/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-white" />
              <div className="flex-1">
                <p className="font-semibold text-white">{i18n.language === "de" ? "Route verlassen" : "Off route"}</p>
                <p className="text-sm text-amber-100">{i18n.language === "de" ? "Sie sind von der geplanten Route abgewichen" : "You have deviated from the planned route"}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button onClick={handleRecalculate} className="flex-1 bg-white text-amber-600 hover:bg-amber-50" data-testid="recalculate-route-btn">
                <RotateCcw className="w-4 h-4 mr-2" />{i18n.language === "de" ? "Neu berechnen" : "Recalculate"}
              </Button>
              <Button onClick={() => setShowRecalculatePrompt(false)} variant="outline" className="border-white text-white hover:bg-amber-400">
                {i18n.language === "de" ? "Ignorieren" : "Ignore"}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Break warning overlay */}
      {showBreakWarning && (
        <div className="absolute inset-0 z-[300] bg-black/90 flex items-center justify-center p-6">
          <div className="bg-gradient-to-b from-red-500 to-red-600 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <AlertTriangle className="w-16 h-16 text-white mx-auto mb-4 animate-pulse" />
            <h2 className="text-3xl font-bold text-white mb-2">{i18n.language === "de" ? "PAUSE!" : "BREAK!"}</h2>
            <p className="text-white/90 mb-6">{i18n.language === "de" ? "4 Stunden Lenkzeit erreicht. Pause erforderlich!" : "4 hours driving reached. Break required!"}</p>
            <Button onClick={() => setShowBreakWarning(false)} className="w-full h-12 bg-white text-red-600 font-bold rounded-xl hover:bg-gray-100">
              {i18n.language === "de" ? "Verstanden" : "Understood"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TurnByTurnNavigation;
