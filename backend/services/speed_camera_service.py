"""
Blitzer-Warnungs-Service
Basierend auf OpenStreetMap POIs

⚠️ RECHTLICHER HINWEIS (Deutschland):
- Nur VISUELLE Warnung erlaubt
- KEINE akustische Warnung für den Fahrer während der Fahrt!
- Verstöße können mit Bußgeld geahndet werden
"""

import httpx
import logging
import math
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class SpeedCameraService:
    """
    Blitzer-Warndienst basierend auf OpenStreetMap
    
    Datenquellen:
    - OpenStreetMap (highway=speed_camera)
    - Overpass API für Echtzeit-Abfragen
    
    ⚠️ NUR VISUELLE WARNUNGEN - KEINE AKUSTISCHEN!
    """
    
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"
    
    # Cache für Blitzer-Daten (reduziert API-Anfragen)
    _cache: Dict[str, Tuple[List[Dict], datetime]] = {}
    CACHE_TTL = timedelta(hours=24)
    
    def __init__(self):
        self.enabled = True
    
    async def get_speed_cameras_along_route(
        self,
        route_geometry: List[List[float]],
        buffer_meters: int = 500
    ) -> List[Dict]:
        """
        Findet Blitzer entlang einer Route
        
        Args:
            route_geometry: Liste von [lon, lat] Koordinaten
            buffer_meters: Suchradius um die Route in Metern
            
        Returns:
            Liste von Blitzer-POIs mit Position und Infos
        """
        if not self.enabled or len(route_geometry) < 2:
            return []
        
        # Bounding Box der Route berechnen
        bbox = self._calculate_bbox(route_geometry, buffer_meters)
        
        # Cache prüfen
        cache_key = f"{bbox[0]:.3f},{bbox[1]:.3f},{bbox[2]:.3f},{bbox[3]:.3f}"
        if cache_key in self._cache:
            cameras, cached_at = self._cache[cache_key]
            if datetime.now() - cached_at < self.CACHE_TTL:
                return self._filter_cameras_near_route(cameras, route_geometry, buffer_meters)
        
        # Overpass API abfragen
        cameras = await self._fetch_cameras_from_overpass(bbox)
        
        # Cache aktualisieren
        self._cache[cache_key] = (cameras, datetime.now())
        
        # Nur Blitzer nahe der Route zurückgeben
        return self._filter_cameras_near_route(cameras, route_geometry, buffer_meters)
    
    async def _fetch_cameras_from_overpass(self, bbox: Tuple[float, float, float, float]) -> List[Dict]:
        """Blitzer von Overpass API abrufen"""
        query = f"""
        [out:json][timeout:10];
        (
          node["highway"="speed_camera"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
          node["enforcement"="maxspeed"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
          node["enforcement"="speed_camera"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
        );
        out body;
        """
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    self.OVERPASS_URL,
                    data={"data": query}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return self._parse_overpass_response(data)
                else:
                    logger.warning(f"Overpass API Error: {response.status_code}")
                    return []
                    
        except Exception as e:
            logger.error(f"Overpass API Exception: {e}")
            return []
    
    def _parse_overpass_response(self, data: Dict) -> List[Dict]:
        """Overpass Response zu Blitzer-Liste parsen"""
        cameras = []
        
        for element in data.get('elements', []):
            if element.get('type') != 'node':
                continue
            
            tags = element.get('tags', {})
            
            camera = {
                'id': element.get('id'),
                'lat': element.get('lat'),
                'lon': element.get('lon'),
                'type': self._determine_camera_type(tags),
                'speed_limit': tags.get('maxspeed', 'unbekannt'),
                'direction': tags.get('direction', ''),
                'name': tags.get('name', ''),
                'ref': tags.get('ref', ''),
                'operator': tags.get('operator', ''),
                'last_verified': tags.get('check_date', ''),
            }
            cameras.append(camera)
        
        return cameras
    
    def _determine_camera_type(self, tags: Dict) -> str:
        """Bestimmt den Blitzer-Typ aus OSM-Tags"""
        camera_type = tags.get('enforcement', tags.get('highway', ''))
        
        if 'average' in str(tags).lower() or 'section' in str(tags).lower():
            return 'section_control'  # Abschnittskontrolle
        elif 'mobile' in str(tags).lower():
            return 'mobile'  # Mobiler Blitzer (unzuverlässig!)
        elif 'traffic_signals' in str(tags).lower() or 'red_light' in str(tags).lower():
            return 'red_light'  # Rotlichtblitzer
        else:
            return 'fixed'  # Fester Blitzer
    
    def _calculate_bbox(
        self, 
        geometry: List[List[float]], 
        buffer_meters: int
    ) -> Tuple[float, float, float, float]:
        """Bounding Box mit Buffer berechnen"""
        lons = [p[0] for p in geometry]
        lats = [p[1] for p in geometry]
        
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)
        
        # Buffer in Grad umrechnen (grobe Näherung)
        lat_buffer = buffer_meters / 111000  # ~111km pro Grad Latitude
        lon_buffer = buffer_meters / (111000 * math.cos(math.radians((min_lat + max_lat) / 2)))
        
        return (
            min_lat - lat_buffer,
            min_lon - lon_buffer,
            max_lat + lat_buffer,
            max_lon + lon_buffer
        )
    
    def _filter_cameras_near_route(
        self,
        cameras: List[Dict],
        route_geometry: List[List[float]],
        max_distance_meters: int
    ) -> List[Dict]:
        """Filtert Blitzer die nahe der Route liegen"""
        nearby_cameras = []
        
        for camera in cameras:
            cam_point = (camera['lon'], camera['lat'])
            
            # Minimale Distanz zur Route berechnen
            min_distance = float('inf')
            for i in range(len(route_geometry) - 1):
                dist = self._point_to_segment_distance(
                    cam_point,
                    route_geometry[i],
                    route_geometry[i + 1]
                )
                min_distance = min(min_distance, dist)
            
            if min_distance <= max_distance_meters:
                camera['distance_to_route_m'] = round(min_distance)
                nearby_cameras.append(camera)
        
        # Nach Entfernung sortieren
        nearby_cameras.sort(key=lambda x: x.get('distance_to_route_m', 0))
        
        return nearby_cameras
    
    def _point_to_segment_distance(
        self,
        point: Tuple[float, float],
        seg_start: List[float],
        seg_end: List[float]
    ) -> float:
        """Berechnet Abstand eines Punktes zu einem Liniensegment in Metern"""
        # Vereinfachte Berechnung mit Haversine
        def haversine_distance(lon1, lat1, lon2, lat2):
            R = 6371000  # Erdradius in Metern
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            delta_phi = math.radians(lat2 - lat1)
            delta_lambda = math.radians(lon2 - lon1)
            
            a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            
            return R * c
        
        # Abstand zum Startpunkt
        dist_to_start = haversine_distance(point[0], point[1], seg_start[0], seg_start[1])
        # Abstand zum Endpunkt
        dist_to_end = haversine_distance(point[0], point[1], seg_end[0], seg_end[1])
        
        # Vereinfacht: Minimum der Abstände zu den Endpunkten
        # (Für genauere Berechnung: Projektion auf Linie)
        return min(dist_to_start, dist_to_end)
    
    def check_camera_warning(
        self,
        current_position: Tuple[float, float],
        cameras: List[Dict],
        warning_distance_m: int = 500
    ) -> Optional[Dict]:
        """
        Prüft ob eine Blitzer-Warnung angezeigt werden soll
        
        ⚠️ NUR VISUELL - KEINE AKUSTISCHE WARNUNG!
        
        Returns:
            Blitzer-Info wenn Warnung aktiv, sonst None
        """
        for camera in cameras:
            dist = self._haversine(
                current_position[0], current_position[1],
                camera['lon'], camera['lat']
            )
            
            if dist <= warning_distance_m:
                return {
                    'camera': camera,
                    'distance_m': round(dist),
                    'warning_type': 'visual_only',  # WICHTIG!
                    'message': f"📸 Blitzer in {round(dist)}m" if dist < 200 else f"📸 Blitzer voraus ({round(dist)}m)",
                    'speed_limit': camera.get('speed_limit', 'unbekannt')
                }
        
        return None
    
    def _haversine(self, lon1: float, lat1: float, lon2: float, lat2: float) -> float:
        """Haversine-Formel für Entfernungsberechnung"""
        R = 6371000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c


# Rechtliche Hinweise als Konstanten
SPEED_CAMERA_LEGAL_DISCLAIMER_DE = """
⚠️ RECHTLICHER HINWEIS - BLITZER-WARNUNGEN

Gemäß § 23 Abs. 1c StVO ist die Nutzung von Geräten, die Geschwindigkeitsmessungen 
anzeigen oder vor ihnen warnen, während der Fahrt für den Fahrer verboten.

Diese App zeigt Blitzer-Standorte nur zu Informationszwecken an.
- Nur VISUELLE Anzeige, keine akustischen Warnungen
- Der Fahrer darf diese Funktion während der Fahrt NICHT aktiv nutzen
- Bei Verstoß drohen Bußgeld (75€) und 1 Punkt

Die Nutzung erfolgt auf eigene Verantwortung.
"""

SPEED_CAMERA_LEGAL_DISCLAIMER_EN = """
⚠️ LEGAL NOTICE - SPEED CAMERA WARNINGS

The use of devices that display or warn of speed measurements is prohibited 
for drivers while driving in Germany (§ 23 StVO).

This app displays speed camera locations for informational purposes only.
- Visual display only, no acoustic warnings
- The driver must NOT actively use this feature while driving
- Violations may result in fines and penalty points

Use at your own risk.
"""


# Singleton
_camera_service: Optional[SpeedCameraService] = None

def get_speed_camera_service() -> SpeedCameraService:
    global _camera_service
    if _camera_service is None:
        _camera_service = SpeedCameraService()
    return _camera_service
