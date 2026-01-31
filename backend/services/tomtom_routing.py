"""
TomTom Truck Routing Service
LKW-spezifisches Routing mit Fahrzeugdimensionen, Gefahrgut und Echtzeit-Verkehr
"""

import os
import httpx
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")
TOMTOM_BASE_URL = "https://api.tomtom.com"


@dataclass
class TruckProfile:
    """LKW-Profil für TomTom Routing"""
    height_m: float = 4.0
    width_m: float = 2.55
    length_m: float = 16.5
    weight_kg: int = 40000
    axle_weight_kg: int = 11500
    axle_count: int = 5
    is_commercial: bool = True
    hazmat_class: Optional[str] = None  # z.B. "USHazmatClass3" für brennbare Flüssigkeiten
    adr_tunnel_code: Optional[str] = None  # B, C, D, E für ADR-Tunnel


class TomTomRoutingService:
    """
    TomTom Truck Routing API Integration
    
    Features:
    - Echtes LKW-Routing mit Höhe, Breite, Länge, Gewicht
    - Achslast-Berücksichtigung
    - Gefahrgut-Routing (ADR)
    - Echtzeit-Verkehr
    - Alternative Routen
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or TOMTOM_API_KEY
        self.base_url = TOMTOM_BASE_URL
        
    async def calculate_truck_route(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        truck_profile: TruckProfile = None,
        waypoints: List[tuple] = None,
        route_type: str = "fastest",  # fastest, shortest, eco
        avoid_toll: bool = False,
        avoid_motorways: bool = False,
        departure_time: str = None,
        traffic: bool = True,
        alternatives: int = 2
    ) -> Dict[str, Any]:
        """
        Berechnet LKW-Route mit TomTom API
        
        Args:
            start_lat/lon: Startkoordinaten
            end_lat/lon: Zielkoordinaten
            truck_profile: LKW-Spezifikationen
            waypoints: Zwischenstopps [(lat, lon), ...]
            route_type: "fastest", "shortest", "eco"
            avoid_toll: Mautstraßen vermeiden
            avoid_motorways: Autobahnen vermeiden
            departure_time: ISO 8601 Format
            traffic: Echtzeit-Verkehr berücksichtigen
            alternatives: Anzahl alternativer Routen
            
        Returns:
            Dict mit Route-Daten (Geometrie, Distanz, Zeit, etc.)
        """
        
        if not self.api_key:
            logger.error("TomTom API Key nicht konfiguriert!")
            return {"error": "API Key fehlt", "source": "error"}
        
        if truck_profile is None:
            truck_profile = TruckProfile()
        
        # Koordinaten-String bauen
        locations = f"{start_lat},{start_lon}"
        if waypoints:
            for wp in waypoints:
                locations += f":{wp[0]},{wp[1]}"
        locations += f":{end_lat},{end_lon}"
        
        # API Parameter
        params = {
            "key": self.api_key,
            "routeType": route_type,
            "traffic": str(traffic).lower(),
            "travelMode": "truck",
            "vehicleCommercial": str(truck_profile.is_commercial).lower(),
            "vehicleWeight": truck_profile.weight_kg,
            "vehicleAxleWeight": truck_profile.axle_weight_kg,
            "vehicleNumberOfAxles": truck_profile.axle_count,
            "vehicleLength": truck_profile.length_m,
            "vehicleWidth": truck_profile.width_m,
            "vehicleHeight": truck_profile.height_m,
            "instructionsType": "tagged",  # Get detailed turn-by-turn instructions
            "routeRepresentation": "polyline",
            "computeTravelTimeFor": "all",
            "language": "de-DE",
            "maxAlternatives": alternatives,
        }
        
        # Vermeidungen
        avoid_list = []
        if avoid_toll:
            avoid_list.append("tollRoads")
        if avoid_motorways:
            avoid_list.append("motorways")
        if avoid_list:
            params["avoid"] = ",".join(avoid_list)
        
        # Gefahrgut
        if truck_profile.hazmat_class:
            params["vehicleLoadType"] = truck_profile.hazmat_class
        if truck_profile.adr_tunnel_code:
            params["vehicleAdrTunnelRestrictionCode"] = truck_profile.adr_tunnel_code
        
        # Abfahrtszeit
        if departure_time:
            params["departAt"] = departure_time
        
        url = f"{self.base_url}/routing/1/calculateRoute/{locations}/json"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    return self._parse_route_response(data, truck_profile)
                elif response.status_code == 400:
                    error_data = response.json()
                    logger.warning(f"TomTom Bad Request: {error_data}")
                    return {
                        "error": "Ungültige Anfrage",
                        "details": error_data.get("detailedError", {}).get("message", ""),
                        "source": "tomtom_error"
                    }
                elif response.status_code == 403:
                    logger.error("TomTom API Key ungültig oder Quota erschöpft")
                    return {"error": "API Key ungültig", "source": "auth_error"}
                else:
                    logger.error(f"TomTom API Error: {response.status_code}")
                    return {"error": f"API Fehler {response.status_code}", "source": "api_error"}
                    
        except httpx.TimeoutException:
            logger.error("TomTom API Timeout")
            return {"error": "Timeout", "source": "timeout"}
        except Exception as e:
            logger.error(f"TomTom API Exception: {e}")
            return {"error": str(e), "source": "exception"}
    
    def _parse_route_response(self, data: Dict, truck_profile: TruckProfile) -> Dict[str, Any]:
        """Parst TomTom API Response in einheitliches Format mit vollständigen Turn-by-Turn Anweisungen"""
        
        if "routes" not in data or len(data["routes"]) == 0:
            return {"error": "Keine Route gefunden", "source": "no_route"}
        
        primary_route = data["routes"][0]
        summary = primary_route.get("summary", {})
        
        # Koordinaten extrahieren
        geometry = []
        for leg in primary_route.get("legs", []):
            for point in leg.get("points", []):
                geometry.append([point["longitude"], point["latitude"]])
        
        # Turn-by-Turn Anweisungen - auf Route-Ebene (nicht Leg-Ebene!)
        instructions = []
        route_guidance = primary_route.get("guidance", {})
        raw_instructions = route_guidance.get("instructions", [])
        
        cumulative_distance = 0
        for instruction in raw_instructions:
            maneuver = instruction.get("maneuver", "STRAIGHT")
            message = instruction.get("message", "")
            street = instruction.get("street", "")
            road_numbers = instruction.get("roadNumbers", [])
            
            # XML-Tags aus message entfernen
            import re
            if message:
                message = re.sub(r'<[^>]+>', '', message)
            
            # Text zusammenbauen wenn kein message vorhanden
            if not message:
                if street:
                    message = f"Auf {street}"
                elif road_numbers:
                    message = f"Auf {road_numbers[0]}"
                else:
                    message = self._get_maneuver_text(maneuver)
            
            route_offset = instruction.get("routeOffsetInMeters", 0)
            distance_to_next = route_offset - cumulative_distance if route_offset > cumulative_distance else 0
            
            instructions.append({
                "text": message,
                "distance_m": distance_to_next,
                "cumulative_distance_m": route_offset,
                "maneuver": maneuver,
                "street": street,
                "road_numbers": road_numbers,
                "point": instruction.get("point", {}),
                "exit_number": instruction.get("exitNumber", ""),
                "roundabout_exit_number": instruction.get("roundaboutExitNumber", ""),
                "turn_angle": instruction.get("turnAngleInDecimalDegrees", 0),
                "combined_message": instruction.get("combinedMessage", "")
            })
            
            cumulative_distance = route_offset
        
        # Alternative Routen
        alternatives = []
        for alt_route in data.get("routes", [])[1:]:
            alt_summary = alt_route.get("summary", {})
            
            alt_geometry = []
            for leg in alt_route.get("legs", []):
                for point in leg.get("points", []):
                    alt_geometry.append([point["longitude"], point["latitude"]])
            
            # Anweisungen für Alternative (auch auf Route-Ebene)
            alt_instructions = []
            alt_guidance = alt_route.get("guidance", {})
            alt_cumulative = 0
            for instruction in alt_guidance.get("instructions", []):
                route_offset = instruction.get("routeOffsetInMeters", 0)
                alt_instructions.append({
                    "text": instruction.get("message", self._get_maneuver_text(instruction.get("maneuver", ""))),
                    "distance_m": route_offset - alt_cumulative if route_offset > alt_cumulative else 0,
                    "maneuver": instruction.get("maneuver", "STRAIGHT"),
                    "street": instruction.get("street", "")
                })
                alt_cumulative = route_offset
            
            alternatives.append({
                "distance_km": alt_summary.get("lengthInMeters", 0) / 1000,
                "duration_minutes": alt_summary.get("travelTimeInSeconds", 0) / 60,
                "traffic_delay_minutes": alt_summary.get("trafficDelayInSeconds", 0) / 60,
                "geometry": alt_geometry,
                "instructions": alt_instructions
            })
        
        result = {
            "source": "tomtom",
            "truck_compliant": True,
            "distance_km": summary.get("lengthInMeters", 0) / 1000,
            "duration_minutes": summary.get("travelTimeInSeconds", 0) / 60,
            "traffic_delay_minutes": summary.get("trafficDelayInSeconds", 0) / 60,
            "departure_time": summary.get("departureTime"),
            "arrival_time": summary.get("arrivalTime"),
            "geometry": geometry,
            "instructions": instructions,
            "alternatives": alternatives,
            "vehicle_profile": {
                "height_m": truck_profile.height_m,
                "width_m": truck_profile.width_m,
                "length_m": truck_profile.length_m,
                "weight_kg": truck_profile.weight_kg,
                "axle_count": truck_profile.axle_count
            },
            "warnings": []
        }
        
        if result["duration_minutes"] > 270:
            result["warnings"].append("Route überschreitet maximale Lenkzeit (4h30) - Fahrtunterbrechung erforderlich!")
        
        return result
    
    def _get_maneuver_text(self, maneuver: str) -> str:
        """Konvertiert TomTom Manöver-Code in deutschen Text"""
        maneuver_texts = {
            "ARRIVE": "Ziel erreicht",
            "ARRIVE_LEFT": "Ziel auf der linken Seite",
            "ARRIVE_RIGHT": "Ziel auf der rechten Seite",
            "DEPART": "Losfahren",
            "STRAIGHT": "Geradeaus weiterfahren",
            "KEEP_RIGHT": "Rechts halten",
            "KEEP_LEFT": "Links halten",
            "TURN_RIGHT": "Rechts abbiegen",
            "TURN_LEFT": "Links abbiegen",
            "TURN_SLIGHT_RIGHT": "Leicht rechts abbiegen",
            "TURN_SLIGHT_LEFT": "Leicht links abbiegen",
            "TURN_SHARP_RIGHT": "Scharf rechts abbiegen",
            "TURN_SHARP_LEFT": "Scharf links abbiegen",
            "ROUNDABOUT_RIGHT": "Im Kreisverkehr rechts",
            "ROUNDABOUT_LEFT": "Im Kreisverkehr links",
            "ROUNDABOUT_CROSS": "Kreisverkehr überqueren",
            "ROUNDABOUT_BACK": "Im Kreisverkehr wenden",
            "ENTER_MOTORWAY": "Auf Autobahn auffahren",
            "EXIT_MOTORWAY": "Autobahn verlassen",
            "MOTORWAY_EXIT_LEFT": "Ausfahrt links nehmen",
            "MOTORWAY_EXIT_RIGHT": "Ausfahrt rechts nehmen",
            "TAKE_FERRY": "Fähre nehmen",
            "ENTER_FREEWAY": "Auf Schnellstraße auffahren",
            "EXIT_FREEWAY": "Schnellstraße verlassen",
            "SWITCH_MAIN_ROAD": "Auf Hauptstraße wechseln",
            "FOLLOW": "Folgen",
            "U_TURN": "Wenden"
        }
        return maneuver_texts.get(maneuver, "Weiter")


# Singleton Instance
_tomtom_service = None

def get_tomtom_service() -> TomTomRoutingService:
    """Globale TomTom Service Instanz"""
    global _tomtom_service
    if _tomtom_service is None:
        _tomtom_service = TomTomRoutingService()
    return _tomtom_service


async def test_tomtom_connection() -> bool:
    """Testet TomTom API Verbindung"""
    service = get_tomtom_service()
    
    # Test-Route: Berlin -> München
    result = await service.calculate_truck_route(
        start_lat=52.52,
        start_lon=13.405,
        end_lat=48.1351,
        end_lon=11.582,
        alternatives=0
    )
    
    if "error" in result:
        logger.error(f"TomTom Test fehlgeschlagen: {result['error']}")
        return False
    
    logger.info(f"TomTom Test erfolgreich: {result['distance_km']:.1f} km, {result['duration_minutes']:.0f} min")
    return True
