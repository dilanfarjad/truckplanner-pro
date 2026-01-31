"""
Tachograph Service - Zentrale Schnittstelle
Verwaltet alle Adapter und stellt einheitliche API bereit
"""

from datetime import datetime
from typing import Optional, Dict, Type

from .models import (
    TachographData,
    TachographType,
    DriverActivity,
    ConnectionStatus,
    ComplianceStatus,
    DrivingPermission
)
from .adapters.base import BaseTachographAdapter
from .adapters.manual_adapter import ManualTachographAdapter
from .adapters.simulation_adapter import SimulationAdapter
from .adapters.vdo_adapter import VDOAdapter
from .rule_engine import EU561RuleEngine


class TachographService:
    """
    Zentrale Tachograph-Service-Klasse
    
    Features:
    - Universelle API für alle Tachograph-Typen
    - Automatische Adapter-Auswahl
    - Integrierte Regel-Engine
    - Event-System für Warnungen
    
    Verwendung:
        service = TachographService()
        await service.connect(TachographType.MANUAL)
        data = await service.get_current_data()
        status = service.get_compliance_status()
    """
    
    # Verfügbare Adapter
    ADAPTERS: Dict[TachographType, Type[BaseTachographAdapter]] = {
        TachographType.MANUAL: ManualTachographAdapter,
        TachographType.SIMULATION: SimulationAdapter,
        TachographType.VDO_DTCO_4_0: VDOAdapter,
        TachographType.VDO_DTCO_4_1: VDOAdapter,
        TachographType.VDO_DTCO_4_1A: VDOAdapter,
        # Weitere Adapter hier registrieren
    }
    
    def __init__(self):
        self._adapter: Optional[BaseTachographAdapter] = None
        self._rule_engine = EU561RuleEngine()
        self._current_data: Optional[TachographData] = None
        self._avg_speed_kmh = 80.0  # Für km-Berechnungen
        
    # ============== Verbindung ==============
    
    async def connect(
        self, 
        tachograph_type: TachographType = TachographType.MANUAL,
        device_id: Optional[str] = None
    ) -> bool:
        """
        Mit Tachograph verbinden
        
        Args:
            tachograph_type: Typ des Tachographen
            device_id: Optional - Bluetooth-Geräte-ID
            
        Returns:
            True wenn Verbindung erfolgreich
        """
        # Adapter erstellen
        adapter_class = self.ADAPTERS.get(tachograph_type)
        if not adapter_class:
            # Fallback auf manuellen Modus
            adapter_class = ManualTachographAdapter
            
        self._adapter = adapter_class()
        
        # Verbinden
        success = await self._adapter.connect(device_id)
        
        if success:
            # Initiale Daten lesen
            self._current_data = await self._adapter.read_data()
            
        return success
    
    async def disconnect(self) -> bool:
        """Verbindung trennen"""
        if self._adapter:
            return await self._adapter.disconnect()
        return True
    
    @property
    def is_connected(self) -> bool:
        """Prüft ob Verbindung besteht"""
        return self._adapter is not None and self._adapter.is_connected
    
    @property
    def connection_status(self) -> ConnectionStatus:
        """Aktueller Verbindungsstatus"""
        if self._adapter:
            return self._adapter.connection_status
        return ConnectionStatus.DISCONNECTED
    
    @property
    def tachograph_type(self) -> TachographType:
        """Typ des verbundenen Tachographen"""
        if self._adapter:
            return self._adapter.tachograph_type
        return TachographType.MANUAL
    
    # ============== Daten ==============
    
    async def get_current_data(self) -> TachographData:
        """
        Aktuelle Tachograph-Daten abrufen
        
        Returns:
            TachographData mit allen verfügbaren Werten
        """
        if not self._adapter:
            return TachographData()
            
        self._current_data = await self._adapter.read_data()
        return self._current_data
    
    async def set_activity(self, activity: DriverActivity, driver: int = 1) -> bool:
        """
        Fahrer-Aktivität setzen (nur bei manuellem Modus)
        
        Args:
            activity: Neue Aktivität (DRIVING, WORKING, AVAILABLE, REST)
            driver: Fahrer-Nummer (1 oder 2)
            
        Returns:
            True wenn erfolgreich
        """
        if not self._adapter:
            return False
        return await self._adapter.set_activity(activity, driver)
    
    # ============== Compliance ==============
    
    def get_compliance_status(self, avg_speed_kmh: Optional[float] = None) -> ComplianceStatus:
        """
        Aktuellen Compliance-Status abrufen
        
        Args:
            avg_speed_kmh: Durchschnittsgeschwindigkeit für km-Berechnung
            
        Returns:
            ComplianceStatus mit Warnungen und Empfehlungen
        """
        if not self._current_data:
            return ComplianceStatus()
            
        speed = avg_speed_kmh or self._avg_speed_kmh
        return self._rule_engine.evaluate(self._current_data, speed)
    
    def may_drive(self, avg_speed_kmh: Optional[float] = None) -> DrivingPermission:
        """
        Einfache Abfrage: Darf der Fahrer noch fahren?
        
        Returns:
            DrivingPermission mit Ja/Nein und Begründung
        """
        if not self._current_data:
            return DrivingPermission(may_drive=False, reason="Keine Daten")
            
        speed = avg_speed_kmh or self._avg_speed_kmh
        return self._rule_engine.may_drive(self._current_data, speed)
    
    # ============== UI-Helper ==============
    
    def get_driving_mode_display(self) -> dict:
        """
        Minimale Anzeige für Fahrmodus (3 Infos)
        
        Returns:
            dict mit den 3 wichtigsten Werten für die UI
        """
        if not self._current_data:
            return {
                "remaining_time": "-- : --",
                "remaining_km": "--",
                "warning": None
            }
            
        status = self.get_compliance_status()
        
        # Zeit formatieren
        remaining_min = status.break_required_in_minutes
        hours = remaining_min // 60
        mins = remaining_min % 60
        time_str = f"{hours}h {mins:02d}min"
        
        # km formatieren
        km_str = f"{status.break_required_in_km:.0f} km" if status.break_required_in_km else "--"
        
        # Warnung
        warning = status.warnings[0] if status.warnings else None
        
        return {
            "remaining_time": time_str,
            "remaining_km": km_str,
            "warning": warning,
            "risk_level": status.risk_level,
            "is_compliant": status.is_compliant
        }
    
    def set_average_speed(self, speed_kmh: float):
        """Durchschnittsgeschwindigkeit für km-Berechnung setzen"""
        self._avg_speed_kmh = max(30, min(130, speed_kmh))  # Begrenzen
        
    # ============== Manuelle Eingabe ==============
    
    async def set_driving_time_manual(
        self, 
        minutes_today: int = 0,
        minutes_since_break: int = 0,
        minutes_week: int = 0
    ) -> bool:
        """
        Lenkzeit manuell setzen (für manuellen Modus)
        
        Args:
            minutes_today: Heutige Lenkzeit in Minuten
            minutes_since_break: Lenkzeit seit letzter Pause
            minutes_week: Wöchentliche Lenkzeit
        """
        if not self._adapter:
            return False
            
        if hasattr(self._adapter, 'set_driving_time'):
            await self._adapter.set_driving_time(minutes_today, minutes_week)
            # Refresh data
            self._current_data = await self._adapter.read_data()
            return True
        return False
    
    # ============== Simulation ==============
    
    async def start_simulation(self, scenario: str = "fresh", speed: float = 60.0):
        """
        Simulation starten (nur im Simulation-Modus)
        
        Args:
            scenario: "fresh", "mid_day", "near_break", "overtime"
            speed: Simulationsgeschwindigkeit (60 = 1 Min/Sek)
        """
        if isinstance(self._adapter, SimulationAdapter):
            await self._adapter.set_scenario(scenario)
            await self._adapter.start_simulation(speed)
            
    async def stop_simulation(self):
        """Simulation stoppen"""
        if isinstance(self._adapter, SimulationAdapter):
            await self._adapter.stop_simulation()


# ============== Singleton für globalen Zugriff ==============

_service_instance: Optional[TachographService] = None

def get_tachograph_service() -> TachographService:
    """Globale TachographService-Instanz abrufen"""
    global _service_instance
    if _service_instance is None:
        _service_instance = TachographService()
    return _service_instance
