"""
Base Tachograph Adapter - Abstrakte Basisklasse
Alle Hersteller-Adapter müssen diese Schnittstelle implementieren
"""

from abc import ABC, abstractmethod
from typing import Optional, List, Callable
from datetime import datetime

from ..models import (
    TachographData,
    TachographEvent,
    DriverActivity,
    ConnectionStatus,
    TachographType
)


class BaseTachographAdapter(ABC):
    """
    Abstrakte Basisklasse für alle Tachograph-Adapter
    
    Implementierungen:
    - ManualTachographAdapter: Manuelle Eingabe
    - SimulationAdapter: Test/Demo-Modus
    - VDOAdapter: VDO DTCO 4.x (zukünftig)
    - StoneridgeAdapter: Stoneridge SE5000 (zukünftig)
    """
    
    def __init__(self):
        self._connection_status = ConnectionStatus.DISCONNECTED
        self._tachograph_type = TachographType.MANUAL
        self._event_handlers: List[Callable[[TachographEvent], None]] = []
        self._last_data: Optional[TachographData] = None
        
    # ============== Abstrakte Methoden (MÜSSEN implementiert werden) ==============
    
    @abstractmethod
    async def connect(self, device_id: Optional[str] = None) -> bool:
        """
        Verbindung zum Tachograph herstellen
        
        Args:
            device_id: Optional - Geräte-ID für Bluetooth-Geräte
            
        Returns:
            True wenn Verbindung erfolgreich
        """
        pass
    
    @abstractmethod
    async def disconnect(self) -> bool:
        """Verbindung trennen"""
        pass
    
    @abstractmethod
    async def read_data(self) -> TachographData:
        """
        Aktuelle Daten vom Tachograph lesen
        
        Returns:
            TachographData mit allen verfügbaren Werten
        """
        pass
    
    @abstractmethod
    async def set_activity(self, activity: DriverActivity, driver: int = 1) -> bool:
        """
        Fahrer-Aktivität setzen (nur bei manuellem Modus)
        
        Args:
            activity: Neue Aktivität
            driver: 1 oder 2 (für Team-Fahrer)
            
        Returns:
            True wenn erfolgreich
        """
        pass
    
    # ============== Gemeinsame Methoden ==============
    
    @property
    def connection_status(self) -> ConnectionStatus:
        """Aktueller Verbindungsstatus"""
        return self._connection_status
    
    @property
    def tachograph_type(self) -> TachographType:
        """Typ des verbundenen Tachographen"""
        return self._tachograph_type
    
    @property
    def is_connected(self) -> bool:
        """Prüft ob Verbindung besteht"""
        return self._connection_status == ConnectionStatus.CONNECTED
    
    @property
    def last_data(self) -> Optional[TachographData]:
        """Letzte gelesene Daten"""
        return self._last_data
    
    def on_event(self, handler: Callable[[TachographEvent], None]):
        """Event-Handler registrieren"""
        self._event_handlers.append(handler)
        
    def _emit_event(self, event: TachographEvent):
        """Event an alle Handler senden"""
        for handler in self._event_handlers:
            try:
                handler(event)
            except Exception as e:
                print(f"Event handler error: {e}")
                
    def _emit_warning(self, message: str, severity: str = "warning"):
        """Warnung als Event senden"""
        self._emit_event(TachographEvent(
            event_type="warning",
            timestamp=datetime.now(),
            description=message,
            severity=severity
        ))
    
    # ============== Zukünftige Bluetooth-Methoden ==============
    
    async def scan_devices(self) -> List[dict]:
        """
        Nach verfügbaren Bluetooth-Tachographen suchen
        
        Returns:
            Liste von gefundenen Geräten mit ID und Name
        """
        # Basis-Implementierung: Keine Geräte (manueller Modus)
        return []
    
    async def pair_device(self, device_id: str) -> bool:
        """
        Mit Bluetooth-Gerät koppeln
        
        Args:
            device_id: Bluetooth-Geräte-ID
            
        Returns:
            True wenn Kopplung erfolgreich
        """
        # Basis-Implementierung: Nicht unterstützt
        return False
    
    # ============== Download-Funktionen (zukünftig) ==============
    
    async def download_driver_card(self, card_slot: int = 1) -> Optional[bytes]:
        """
        Fahrerkarte herunterladen (DDD-Datei)
        Benötigt Unternehmenskarte!
        
        Returns:
            Rohdaten der Fahrerkarte oder None
        """
        return None
    
    async def download_mass_storage(self) -> Optional[bytes]:
        """
        Massenspeicher herunterladen
        Benötigt Unternehmenskarte!
        
        Returns:
            Rohdaten des Massenspeichers oder None
        """
        return None
