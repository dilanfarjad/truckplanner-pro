"""
Simulation Tachograph Adapter
Simuliert einen echten Tachograph für Demo- und Testzwecke

Realistische Simulation mit:
- Automatischer Zeitzählung bei Fahrt
- Pausenlogik (45min Reset)
- Warnungen bei Annäherung an Limits
- Automatische Pause-Erzwingung
"""

import asyncio
import random
from datetime import datetime, timedelta
from typing import Optional, List, Callable

from .base import BaseTachographAdapter
from ..models import (
    TachographData,
    TachographEvent,
    DriverActivity,
    ConnectionStatus,
    TachographType
)


class SimulationAdapter(BaseTachographAdapter):
    """
    Adapter für Simulation/Demo-Modus
    
    Simuliert:
    - Automatischer Zeitverlauf (konfigurierbar 1x bis 120x Geschwindigkeit)
    - Pausenlogik nach EU 561/2006
    - Realistische Warnungen
    - Stau-Situationen
    
    EU 561/2006 Regeln:
    - Max 4h30 Lenkzeit ohne Pause
    - 45min Pause erforderlich (oder 15+30 aufgeteilt)
    - Max 9h tägliche Lenkzeit (2x/Woche 10h)
    - Max 56h wöchentliche Lenkzeit
    """
    
    def __init__(self):
        super().__init__()
        self._tachograph_type = TachographType.SIMULATION
        
        # Simulation State
        self._simulation_running = False
        self._simulation_speed = 1.0  # Zeitfaktor (1.0 = Echtzeit, 60 = 1min/sek)
        self._simulation_task: Optional[asyncio.Task] = None
        
        # Simulierte Werte
        self._sim_driving_since_break = 0.0  # Minuten seit letzter Pause
        self._sim_driving_today = 0.0  # Heutige Lenkzeit
        self._sim_driving_week = 0.0  # Wöchentliche Lenkzeit
        self._sim_activity = DriverActivity.REST
        self._sim_speed = 0.0
        self._sim_in_traffic = False
        
        # Pausentracking
        self._current_break_minutes = 0.0  # Aktuelle Pausendauer
        self._break_required = False
        self._forced_break = False  # Zwangspause aktiv
        
        # Event Callbacks
        self._warning_callbacks: List[Callable] = []
        
        # Letzte Warnzeit (um nicht zu spammen)
        self._last_warning_time = {}
        self._warning_cooldown = 60  # Sekunden zwischen gleichen Warnungen
        
    async def connect(self, device_id: Optional[str] = None) -> bool:
        """Simulation starten"""
        self._connection_status = ConnectionStatus.CONNECTING
        
        # Simuliere Verbindungsaufbau
        await asyncio.sleep(0.5)
        
        self._connection_status = ConnectionStatus.CONNECTED
        self._emit_event(TachographEvent(
            event_type="connected",
            timestamp=datetime.now(),
            description="Simulation gestartet (Demo-Modus)",
            severity="info"
        ))
        
        # Automatisch Simulation starten
        self._simulation_running = True
        self._simulation_task = asyncio.create_task(self._simulation_loop())
        
        return True
    
    async def disconnect(self) -> bool:
        """Simulation stoppen"""
        self._simulation_running = False
        if self._simulation_task:
            self._simulation_task.cancel()
            try:
                await self._simulation_task
            except asyncio.CancelledError:
                pass
        self._connection_status = ConnectionStatus.DISCONNECTED
        return True
    
    async def read_data(self) -> TachographData:
        """Simulierte Daten zurückgeben"""
        now = datetime.now()
        
        # Simuliere Verkehrssituation
        if self._sim_activity == DriverActivity.DRIVING and not self._forced_break:
            self._sim_in_traffic = random.random() < 0.08  # 8% Chance auf Stau
            if self._sim_in_traffic:
                self._sim_speed = random.uniform(5, 35)
            else:
                self._sim_speed = random.uniform(75, 95)
        else:
            self._sim_speed = 0
            self._sim_in_traffic = False
        
        # Warnungen generieren
        warnings = self._generate_warnings()
            
        data = TachographData(
            connection_status=self._connection_status,
            tachograph_type=self._tachograph_type,
            device_id="SIM-DEMO-001",
            firmware_version="SIMULATION v2.0",
            
            tachograph_time_utc=now,
            last_sync=now,
            
            driver_1_present=True,
            driver_1_card_id="SIM-DRIVER-001",
            driver_1_activity=self._sim_activity,
            
            vehicle_moving=self._sim_speed > 5,
            current_speed_kmh=self._sim_speed,
            ignition_on=self._sim_activity in [DriverActivity.DRIVING, DriverActivity.WORKING],
            
            driving_time_since_break_minutes=int(self._sim_driving_since_break),
            driving_time_today_minutes=int(self._sim_driving_today),
            driving_time_week_minutes=int(self._sim_driving_week),
            
            remaining_driving_time_minutes=max(0, 270 - int(self._sim_driving_since_break)),
            remaining_daily_driving_minutes=max(0, 540 - int(self._sim_driving_today)),
            remaining_weekly_driving_minutes=max(0, 3360 - int(self._sim_driving_week)),
            
            warnings=warnings
        )
        
        self._last_data = data
        return data
    
    def _generate_warnings(self) -> List[str]:
        """Generiere kontextbezogene Warnungen"""
        warnings = []
        
        if self._forced_break:
            warnings.append("🛑 ZWANGSPAUSE AKTIV - Lenkzeit überschritten!")
            return warnings
        
        if self._sim_in_traffic:
            warnings.append("⚠️ Stau erkannt - Lenkzeit läuft weiter!")
        
        remaining = 270 - self._sim_driving_since_break
        
        if remaining <= 0:
            warnings.append("🛑 PAUSE ERFORDERLICH! Max. Lenkzeit erreicht!")
        elif remaining <= 15:
            warnings.append(f"🔴 DRINGEND: Noch {int(remaining)} Min bis Pflichtpause!")
        elif remaining <= 30:
            warnings.append(f"🟠 Warnung: Noch {int(remaining)} Min bis Pflichtpause")
        elif remaining <= 60:
            warnings.append(f"🟡 Hinweis: Noch {int(remaining)} Min bis Pflichtpause")
        
        # Tagesgrenze
        daily_remaining = 540 - self._sim_driving_today
        if daily_remaining <= 30 and daily_remaining > 0:
            warnings.append(f"⚠️ Tageslenkzeit: Noch {int(daily_remaining)} Min")
        elif daily_remaining <= 0:
            warnings.append("🛑 TAGESLENKZEIT ERREICHT!")
        
        # Wochengrenze
        weekly_remaining = 3360 - self._sim_driving_week
        if weekly_remaining <= 120 and weekly_remaining > 0:
            hours = int(weekly_remaining // 60)
            warnings.append(f"⚠️ Wochenlenkzeit: Noch {hours}h")
        
        return warnings
    
    async def set_activity(self, activity: DriverActivity, driver: int = 1) -> bool:
        """Aktivität in Simulation setzen"""
        
        # Prüfe ob Zwangspause aktiv und Fahrer will fahren
        if self._forced_break and activity == DriverActivity.DRIVING:
            self._emit_event(TachographEvent(
                event_type="activity_rejected",
                timestamp=datetime.now(),
                description="Fahrt nicht möglich - Pause erforderlich!",
                severity="error"
            ))
            return False
        
        old = self._sim_activity
        
        # Wenn von Ruhe zu Fahrt wechselt und genug Pause gemacht wurde
        if old == DriverActivity.REST and activity == DriverActivity.DRIVING:
            if self._current_break_minutes >= 45:
                # Reset Lenkzeit seit Pause
                self._sim_driving_since_break = 0
                self._current_break_minutes = 0
                self._forced_break = False
                self._emit_event(TachographEvent(
                    event_type="break_complete",
                    timestamp=datetime.now(),
                    description="45min Pause abgeschlossen - Lenkzeit zurückgesetzt",
                    severity="info"
                ))
        
        # Wenn zu Ruhe wechselt, beginne Pausenzählung
        if activity == DriverActivity.REST:
            self._current_break_minutes = 0
        
        self._sim_activity = activity
        
        self._emit_event(TachographEvent(
            event_type="activity_changed",
            timestamp=datetime.now(),
            description=f"Simulation: {old.value} → {activity.value}",
            severity="info"
        ))
        
        return True
    
    # ============== Simulation Control ==============
    
    async def start_simulation(self, speed: float = 60.0):
        """
        Automatische Simulation starten
        
        Args:
            speed: Simulationsgeschwindigkeit 
                   - 1 = Echtzeit
                   - 60 = 1 Minute pro Sekunde (Standard)
                   - 120 = 2 Minuten pro Sekunde (Schnell)
        """
        self._simulation_speed = max(1, min(300, speed))  # Begrenzen auf 1-300
        
        if not self._simulation_running:
            self._simulation_running = True
            self._simulation_task = asyncio.create_task(self._simulation_loop())
        
        self._emit_event(TachographEvent(
            event_type="simulation_started",
            timestamp=datetime.now(),
            description=f"Simulation gestartet (Geschwindigkeit: {speed}x)",
            severity="info"
        ))
        
    async def stop_simulation(self):
        """Automatische Simulation stoppen (pausieren)"""
        self._simulation_running = False
        
        self._emit_event(TachographEvent(
            event_type="simulation_stopped",
            timestamp=datetime.now(),
            description="Simulation pausiert",
            severity="info"
        ))
        
    def set_simulation_speed(self, speed: float):
        """Simulationsgeschwindigkeit ändern während Lauf"""
        self._simulation_speed = max(1, min(300, speed))
        
    async def _simulation_loop(self):
        """
        Haupt-Simulation Loop - aktualisiert Werte automatisch
        
        Läuft kontinuierlich im Hintergrund und:
        - Zählt Lenkzeit hoch bei Fahrt
        - Zählt Pausenzeit bei Ruhe
        - Triggert Warnungen
        - Erzwingt Pause bei Limit
        """
        last_update = datetime.now()
        
        while self._simulation_running:
            try:
                # 100ms Intervall für flüssige Updates
                await asyncio.sleep(0.1)
                
                now = datetime.now()
                real_elapsed = (now - last_update).total_seconds()
                last_update = now
                
                # Simulierte Minuten berechnen
                sim_minutes = (real_elapsed * self._simulation_speed) / 60
                
                if self._sim_activity == DriverActivity.DRIVING and not self._forced_break:
                    # Lenkzeit hochzählen
                    self._sim_driving_since_break += sim_minutes
                    self._sim_driving_today += sim_minutes
                    self._sim_driving_week += sim_minutes
                    
                    # Pausenzähler zurücksetzen
                    self._current_break_minutes = 0
                    
                    # Warnungen prüfen
                    await self._check_driving_warnings()
                    
                elif self._sim_activity == DriverActivity.REST:
                    # Pausenzeit hochzählen
                    self._current_break_minutes += sim_minutes
                    
                    # Prüfe ob Pause ausreichend
                    if self._current_break_minutes >= 45 and self._forced_break:
                        self._forced_break = False
                        self._emit_event(TachographEvent(
                            event_type="break_sufficient",
                            timestamp=datetime.now(),
                            description="45min Pause erreicht - Fahrt wieder möglich",
                            severity="info"
                        ))
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log error but continue
                pass
    
    async def _check_driving_warnings(self):
        """Prüfe Lenkzeit und triggere Warnungen"""
        remaining = 270 - self._sim_driving_since_break
        
        # Zwangspause bei Überschreitung
        if remaining <= 0 and not self._forced_break:
            self._forced_break = True
            self._sim_activity = DriverActivity.REST
            self._emit_event(TachographEvent(
                event_type="forced_break",
                timestamp=datetime.now(),
                description="ZWANGSPAUSE - Max. Lenkzeit 4h30 überschritten!",
                severity="error"
            ))
            self._emit_warning("🛑 ZWANGSPAUSE AKTIVIERT - 45min Pause erforderlich!", "error")
        
        # Warnungen bei Annäherung (mit Cooldown)
        elif remaining <= 15 and remaining > 0:
            await self._emit_timed_warning("warn_15min", f"🔴 DRINGEND: Noch {int(remaining)} Min!", "error")
        elif remaining <= 30 and remaining > 15:
            await self._emit_timed_warning("warn_30min", f"🟠 Warnung: Noch {int(remaining)} Min bis Pflichtpause", "warning")
        elif remaining <= 60 and remaining > 30:
            await self._emit_timed_warning("warn_60min", f"🟡 Hinweis: Noch {int(remaining)} Min bis Pflichtpause", "info")
    
    async def _emit_timed_warning(self, key: str, message: str, severity: str):
        """Emittiere Warnung mit Cooldown um Spam zu vermeiden"""
        now = datetime.now().timestamp()
        last_time = self._last_warning_time.get(key, 0)
        
        if now - last_time > self._warning_cooldown:
            self._last_warning_time[key] = now
            self._emit_warning(message, severity)
    
    def _emit_warning(self, message: str, severity: str = "warning"):
        """Warnung als Event emittieren"""
        self._emit_event(TachographEvent(
            event_type="warning",
            timestamp=datetime.now(),
            description=message,
            severity=severity
        ))
    
    # ============== Simulation Helper ==============
    
    async def set_scenario(self, scenario: str):
        """
        Vordefiniertes Szenario laden
        
        Scenarios:
        - "fresh": Neuer Tag, keine Lenkzeit
        - "mid_day": Mitte des Tages, 2h gefahren
        - "near_break": Kurz vor Pflichtpause (4h gefahren)
        - "overtime": Überstunden (zum Testen von Zwangspause)
        - "after_break": Nach einer 45min Pause
        """
        scenarios = {
            "fresh": {
                "driving_since_break": 0,
                "driving_today": 0,
                "driving_week": 0,
                "break_minutes": 0,
                "activity": DriverActivity.REST,
                "forced_break": False
            },
            "mid_day": {
                "driving_since_break": 120,
                "driving_today": 240,
                "driving_week": 1200,
                "break_minutes": 0,
                "activity": DriverActivity.DRIVING,
                "forced_break": False
            },
            "near_break": {
                "driving_since_break": 255,
                "driving_today": 400,
                "driving_week": 2800,
                "break_minutes": 0,
                "activity": DriverActivity.DRIVING,
                "forced_break": False
            },
            "overtime": {
                "driving_since_break": 275,
                "driving_today": 500,
                "driving_week": 3200,
                "break_minutes": 0,
                "activity": DriverActivity.REST,
                "forced_break": True
            },
            "after_break": {
                "driving_since_break": 0,
                "driving_today": 270,
                "driving_week": 1500,
                "break_minutes": 45,
                "activity": DriverActivity.REST,
                "forced_break": False
            }
        }
        
        if scenario in scenarios:
            s = scenarios[scenario]
            self._sim_driving_since_break = s["driving_since_break"]
            self._sim_driving_today = s["driving_today"]
            self._sim_driving_week = s["driving_week"]
            self._current_break_minutes = s["break_minutes"]
            self._sim_activity = s["activity"]
            self._forced_break = s["forced_break"]
            
            self._emit_event(TachographEvent(
                event_type="scenario_loaded",
                timestamp=datetime.now(),
                description=f"Szenario '{scenario}' geladen",
                severity="info"
            ))
            return True
        return False
    
    def get_simulation_state(self) -> dict:
        """Aktuellen Simulationsstatus abrufen"""
        return {
            "running": self._simulation_running,
            "speed": self._simulation_speed,
            "activity": self._sim_activity.value,
            "driving_since_break": int(self._sim_driving_since_break),
            "driving_today": int(self._sim_driving_today),
            "driving_week": int(self._sim_driving_week),
            "break_minutes": int(self._current_break_minutes),
            "forced_break": self._forced_break,
            "remaining_until_break": max(0, 270 - int(self._sim_driving_since_break)),
            "break_progress_percent": min(100, int((self._current_break_minutes / 45) * 100)) if self._sim_activity == DriverActivity.REST else 0
        }
    
    async def reset_simulation(self):
        """Simulation komplett zurücksetzen"""
        await self.set_scenario("fresh")
        self._last_warning_time = {}
        self._emit_event(TachographEvent(
            event_type="simulation_reset",
            timestamp=datetime.now(),
            description="Simulation zurückgesetzt",
            severity="info"
        ))
