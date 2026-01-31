import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useTranslation } from "react-i18next";
import "leaflet/dist/leaflet.css";

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom icons
const createIcon = (color) => new L.DivIcon({
  className: "custom-marker",
  html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const startIcon = createIcon("#10B981"); // Green
const endIcon = createIcon("#EF4444"); // Red
const breakIcon = createIcon("#F97316"); // Orange
const parkingIcon = createIcon("#3B82F6"); // Blue

// Component to fit bounds
const FitBounds = ({ bounds }) => {
  const map = useMap();
  
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);
  
  return null;
};

const RouteMap = ({ 
  routeGeometry = [], 
  startPoint = null, 
  endPoint = null,
  breakSuggestions = [],
  restStops = [],
  center = [51.1657, 10.4515], // Germany center
  zoom = 6
}) => {
  const { t } = useTranslation();
  
  // Convert geometry from [lon, lat] to [lat, lon] for Leaflet
  const routePath = routeGeometry.map(([lon, lat]) => [lat, lon]);
  
  // Calculate bounds
  const bounds = [];
  if (startPoint) bounds.push([startPoint.lat, startPoint.lon]);
  if (endPoint) bounds.push([endPoint.lat, endPoint.lon]);
  if (routePath.length > 0) {
    bounds.push(routePath[0], routePath[routePath.length - 1]);
  }

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-border" data-testid="route-map">
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {bounds.length >= 2 && <FitBounds bounds={bounds} />}
        
        {/* Route line */}
        {routePath.length > 0 && (
          <Polyline
            positions={routePath}
            color="#F97316"
            weight={4}
            opacity={0.8}
          />
        )}
        
        {/* Start marker */}
        {startPoint && (
          <Marker position={[startPoint.lat, startPoint.lon]} icon={startIcon}>
            <Popup>
              <div className="text-sm font-medium">{t("startLocation")}</div>
              {startPoint.name && <div className="text-xs text-gray-600">{startPoint.name}</div>}
            </Popup>
          </Marker>
        )}
        
        {/* End marker */}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lon]} icon={endIcon}>
            <Popup>
              <div className="text-sm font-medium">{t("destination")}</div>
              {endPoint.name && <div className="text-xs text-gray-600">{endPoint.name}</div>}
            </Popup>
          </Marker>
        )}
        
        {/* Break suggestions */}
        {breakSuggestions.map((brk, idx) => (
          <Marker 
            key={`break-${idx}`} 
            position={[brk.location.lat, brk.location.lon]} 
            icon={breakIcon}
          >
            <Popup>
              <div className="text-sm font-medium">{t("breakSuggestion")}</div>
              <div className="text-xs">{brk.duration_minutes} {t("minutes")}</div>
              <div className="text-xs text-gray-600">{brk.reason}</div>
            </Popup>
          </Marker>
        ))}
        
        {/* Rest stops */}
        {restStops.map((stop, idx) => (
          <Marker 
            key={`stop-${idx}`} 
            position={[stop.lat, stop.lon]} 
            icon={parkingIcon}
          >
            <Popup>
              <div className="text-sm font-medium">{stop.name || t("truckParking")}</div>
              <div className="text-xs text-gray-600">{t("restStops")}</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default RouteMap;
