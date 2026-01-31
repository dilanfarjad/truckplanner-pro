"""
Manual Tachograph Adapter
Für manuelle Eingabe der Fahrerdaten ohne echten Tachograph
"""

from datetime import datetime, timedelta
from typing import Optional

from .base import BaseTachographAdapter
from ..models import (
    TachographData,
    TachographEvent,
    DriverActivity,
    ConnectionStatus,
    TachographType
)


class ManualTachographAdapter(BaseTachographAdapter):
    """
    Adapter für manuelle Dateneingabe
    
    Verwendung:
    - Kein Tachograph verfügbar
    - Offline-Modus
    - Backup bei Verbindungsproblemen
    """
    
    def __init__(self):
        super().__init__()
        self._tachograph_type = TachographType.MANUAL
        
        # Interne Zähler
        self._activity_start_time: Optional[datetime] = None
        self._current_activity = DriverActivity.REST
        self._driving_today = 0
        self._driving_since_break = 0
        self._driving_week = 0
        self._break_taken = 0
        self._daily_rest = 0
        
        # Statistiken
        self._extended_days_used = 0
        self._reduced_rests_used = 0
        
    async def connect(self, device_id: Optional[str] = None) -> bool:
        """Manueller Modus ist immer 'verbunden'"""
        self._connection_status = ConnectionStatus.CONNECTED
        self._emit_event(TachographEvent(
            event_type="connected",
            timestamp=datetime.now(),
            description="Manueller Modus aktiviert",
            severity="info"
        ))
        return True
    
    async def disconnect(self) -> bool:
        """Verbindung trennen"""
        self._connection_status = ConnectionStatus.DISCONNECTED
        return True
    
    async def read_data(self) -> TachographData:
        """Aktuelle Daten zusammenstellen"""
        now = datetime.now()
        
        # Berechne verstrichene Zeit seit letzter Aktivitätsänderung
        elapsed_minutes = 0
        if self._activity_start_time:
            elapsed = now - self._activity_start_time
            elapsed_minutes = int(elapsed.total_seconds() / 60)
        
        # Lokale Kopien für das Display
        display_driving_since_break = self._driving_since_break
        display_driving_today = self._driving_today
        display_driving_week = self._driving_week
        display_daily_rest = self._daily_rest
        display_break_taken = self._break_taken

        # Aktualisiere Zähler basierend auf aktueller Aktivität für die Anzeige
        if self._current_activity == DriverActivity.DRIVING:
            display_driving_since_break += elapsed_minutes
            display_driving_today += elapsed_minutes
            display_driving_week += elapsed_minutes
        elif self._current_activity == DriverActivity.REST:
            display_daily_rest = elapsed_minutes
            # Nach 45min Pause: Reset driving_since_break
            if elapsed_minutes >= 45:
                display_driving_since_break = 0
                display_break_taken = 45
            elif elapsed_minutes >= 15:
                display_break_taken = 15
        
        # Restzeiten berechnen
        remaining_before_break = max(0, 270 - display_driving_since_break)
        remaining_daily = max(0, 540 - display_driving_today)
        remaining_weekly = max(0, 3360 - display_driving_week)
        
        data = TachographData(
            connection_status=self._connection_status,
            tachograph_type=self._tachograph_type,
            tachograph_time_utc=now,
            last_sync=now,
            
            driver_1_present=True,
            driver_1_activity=self._current_activity,
            
            vehicle_moving=self._current_activity == DriverActivity.DRIVING,
            current_speed_kmh=80 if self._current_activity == DriverActivity.DRIVING else 0,
            ignition_on=self._current_activity in [DriverActivity.DRIVING, DriverActivity.WORKING],
            
            driving_time_since_break_minutes=display_driving_since_break,
            driving_time_today_minutes=display_driving_today,
            driving_time_week_minutes=display_driving_week,
            
            remaining_driving_time_minutes=remaining_before_break,
            remaining_daily_driving_minutes=remaining_daily,
            remaining_weekly_driving_minutes=remaining_weekly,
            
            break_taken_minutes=display_break_taken,
            daily_rest_taken_minutes=display_daily_rest,
            
            extended_daily_drives_used=self._extended_days_used,
            reduced_daily_rests_used=self._reduced_rests_used
        )
        
        self._last_data = data
        return data
    
    async def set_activity(self, activity: DriverActivity, driver: int = 1) -> bool:
        """
        Aktivität manuell setzen
        
        Logik:
        - DRIVING → REST: Pause beginnt, Lenkzeit wird gespeichert
        - REST → DRIVING: Pause endet, ggf. Reset
        - etc.
        """
        now = datetime.now()
        old_activity = self._current_activity
        
        # Berechne Zeit in alter Aktivität
        elapsed_minutes = 0
        if self._activity_start_time:
            elapsed = now - self._activity_start_time
            elapsed_minutes = int(elapsed.total_seconds() / 60)
        
        # Aktualisiere Zähler basierend auf ALTER Aktivität
        if old_activity == DriverActivity.DRIVING:
            self._driving_today += elapsed_minutes
            self._driving_week += elapsed_minutes
            self._driving_since_break += elapsed_minutes
            
        elif old_activity == DriverActivity.REST:
            self._daily_rest += elapsed_minutes
            # Pausenregel: >= 45min (oder 15+30) = Reset
            if elapsed_minutes >= 45:
                self._driving_since_break = 0
                self._break_taken = 0
            elif elapsed_minutes >= 15 and self._break_taken == 0:
                self._break_taken = 15
            elif elapsed_minutes >= 30 and self._break_taken == 15:
                self._driving_since_break = 0
                self._break_taken = 0
                
        elif old_activity == DriverActivity.WORKING:
            # Arbeit zählt nicht als Lenkzeit, aber als Arbeitszeit
            pass
        
        # Neue Aktivität setzen
        self._current_activity = activity
        self._activity_start_time = now
        
        # Event senden
        self._emit_event(TachographEvent(
            event_type="activity_changed",
            timestamp=now,
            description=f"Aktivität geändert: {old_activity.value} → {activity.value}",
            severity="info"
        ))
        
        return True
    
    # ============== Manuelle Eingabe-Methoden ==============
    
    async def set_driving_time(self, minutes_today: int, minutes_week: int = 0):
        """Lenkzeit manuell setzen (z.B. aus Fahrerkarte)"""
        self._driving_today = minutes_today
        if minutes_week > 0:
            self._driving_week = minutes_week
        else:
            self._driving_week = minutes_today
            
    async def set_break_taken(self, minutes: int):
        """Genommene Pause setzen"""
        self._break_taken = minutes
        
    async def reset_daily(self):
        """Tageswerte zurücksetzen (nach 11h Ruhezeit)"""
        self._driving_today = 0
        self._driving_since_break = 0
        self._break_taken = 0
        self._daily_rest = 0
        
    async def reset_weekly(self):
        """Wochenwerte zurücksetzen (nach 45h Ruhezeit)"""
        self._driving_week = 0
        self._extended_days_used = 0
        self._reduced_rests_used = 0
        await self.reset_daily()
