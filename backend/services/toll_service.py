"""
TollGuru API Service
Mautkosten-Berechnung für LKW-Routen
"""

import os
import httpx
import logging
from typing import Optional, Dict, List, Tuple

logger = logging.getLogger(__name__)


class TollGuruService:
    """
    TollGuru API Integration für Mautkosten
    
    Features:
    - Mautkosten für LKW-Routen
    - Fahrzeugtyp-basierte Berechnung
    - Länderübergreifende Unterstützung (EU, USA, etc.)
    """
    
    # Mautkosten pro km für verschiedene Länder (Fallback wenn API nicht verfügbar)
    TOLL_RATES_PER_KM = {
        'DE': 0.19,   # Deutschland (LKW Maut)
        'AT': 0.40,   # Österreich
        'CH': 0.73,   # Schweiz (LSVA)
        'FR': 0.15,   # Frankreich
        'IT': 0.12,   # Italien
        'ES': 0.10,   # Spanien
        'PL': 0.08,   # Polen
        'CZ': 0.12,   # Tschechien
        'DEFAULT': 0.15
    }
    
    def __init__(self):
        self.api_key = os.getenv("TOLLGURU_API_KEY", "")
        self.base_url = "https://apis.tollguru.com/toll/v2"
        self.is_configured = bool(self.api_key and self.api_key != "FREE_TIER")
    
    async def calculate_toll_cost(
        self,
        route_geometry: List[List[float]],
        vehicle_params: Dict,
        origin_country: str = "DE",
        destination_country: str = "DE"
    ) -> Dict:
        """
        Berechnet Mautkosten für eine Route
        
        Args:
            route_geometry: Liste von [lon, lat] Koordinaten
            vehicle_params: Fahrzeugparameter
            origin_country: Start-Land (ISO 2-Letter)
            destination_country: Ziel-Land (ISO 2-Letter)
            
        Returns:
            {
                toll_cost: float,
                currency: str,
                breakdown: List[Dict],
                is_estimate: bool
            }
        """
        if self.is_configured:
            return await self._calculate_via_api(route_geometry, vehicle_params)
        else:
            return await self._calculate_estimate(route_geometry, vehicle_params, origin_country)
    
    async def _calculate_via_api(
        self, 
        route_geometry: List[List[float]], 
        vehicle_params: Dict
    ) -> Dict:
        """Berechnung über TollGuru API"""
        try:
            # Polyline aus Koordinaten erstellen
            polyline = self._encode_polyline(route_geometry)
            
            payload = {
                "source": "here",  # oder "google"
                "polyline": polyline,
                "vehicleType": "5AxlesTruck",  # Standard LKW
                "vehicle": {
                    "type": "truck",
                    "weight": vehicle_params.get('gross_weight', 40000),
                    "height": vehicle_params.get('height', 4.0),
                    "length": vehicle_params.get('length', 16.5),
                    "axles": vehicle_params.get('axles', 5),
                    "emissionClass": vehicle_params.get('emission_class', 'EURO_6')
                }
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/complete-polyline-from-mapping-service",
                    json=payload,
                    headers={
                        "x-api-key": self.api_key,
                        "Content-Type": "application/json"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return self._parse_tollguru_response(data)
                else:
                    logger.warning(f"TollGuru API Error: {response.status_code}")
                    return await self._calculate_estimate(route_geometry, {}, "DE")
                    
        except Exception as e:
            logger.error(f"TollGuru API Exception: {e}")
            return await self._calculate_estimate(route_geometry, {}, "DE")
    
    async def _calculate_estimate(
        self, 
        route_geometry: List[List[float]], 
        vehicle_params: Dict,
        country: str
    ) -> Dict:
        """
        Schätzung der Mautkosten basierend auf Entfernung und Land
        
        WICHTIG: Dies ist nur eine Schätzung!
        """
        # Gesamtdistanz berechnen
        total_distance_km = self._calculate_route_distance(route_geometry)
        
        # Mautrate für Land
        rate = self.TOLL_RATES_PER_KM.get(country.upper(), self.TOLL_RATES_PER_KM['DEFAULT'])
        
        # Gewichtsbasierte Anpassung
        weight = vehicle_params.get('gross_weight', 40000)
        if weight > 40000:
            rate *= 1.2  # 20% Aufschlag für schwere LKW
        elif weight < 12000:
            rate *= 0.7  # Rabatt für leichtere Fahrzeuge
        
        # Achsenbasierte Anpassung (DE spezifisch)
        axles = vehicle_params.get('axles', 5)
        if axles >= 5:
            rate *= 1.1
        elif axles <= 3:
            rate *= 0.85
        
        toll_cost = round(total_distance_km * rate, 2)
        
        return {
            'toll_cost': toll_cost,
            'currency': 'EUR',
            'distance_km': round(total_distance_km, 1),
            'rate_per_km': rate,
            'breakdown': [
                {
                    'country': country,
                    'distance_km': round(total_distance_km, 1),
                    'cost': toll_cost,
                    'type': 'highway_toll'
                }
            ],
            'is_estimate': True,
            'disclaimer': '⚠️ Schätzung - Tatsächliche Mautkosten können abweichen'
        }
    
    def _parse_tollguru_response(self, data: Dict) -> Dict:
        """TollGuru API Response parsen"""
        summary = data.get('summary', {})
        
        return {
            'toll_cost': summary.get('tollCost', {}).get('amount', 0),
            'currency': summary.get('tollCost', {}).get('currency', 'EUR'),
            'distance_km': summary.get('distance', {}).get('value', 0) / 1000,
            'fuel_cost': summary.get('fuelCost', {}).get('amount', 0),
            'breakdown': data.get('tolls', []),
            'is_estimate': False,
            'disclaimer': None
        }
    
    def _calculate_route_distance(self, geometry: List[List[float]]) -> float:
        """Berechnet Gesamtdistanz einer Route in km"""
        if len(geometry) < 2:
            return 0
        
        import math
        
        def haversine(lon1, lat1, lon2, lat2):
            R = 6371  # Erdradius in km
            phi1 = math.radians(lat1)
            phi2 = math.radians(lat2)
            delta_phi = math.radians(lat2 - lat1)
            delta_lambda = math.radians(lon2 - lon1)
            
            a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            
            return R * c
        
        total = 0
        for i in range(len(geometry) - 1):
            lon1, lat1 = geometry[i]
            lon2, lat2 = geometry[i + 1]
            total += haversine(lon1, lat1, lon2, lat2)
        
        return total
    
    def _encode_polyline(self, coords: List[List[float]]) -> str:
        """Koordinaten zu Polyline encodieren"""
        def encode_value(value):
            value = int(round(value * 1e5))
            value = ~(value << 1) if value < 0 else value << 1
            chunks = []
            while value >= 0x20:
                chunks.append(chr((0x20 | (value & 0x1f)) + 63))
                value >>= 5
            chunks.append(chr(value + 63))
            return ''.join(chunks)
        
        result = []
        prev_lat = 0
        prev_lon = 0
        
        for lon, lat in coords:
            result.append(encode_value(lat - prev_lat))
            result.append(encode_value(lon - prev_lon))
            prev_lat = lat
            prev_lon = lon
        
        return ''.join(result)


# Singleton
_toll_service: Optional[TollGuruService] = None

def get_toll_service() -> TollGuruService:
    global _toll_service
    if _toll_service is None:
        _toll_service = TollGuruService()
    return _toll_service
