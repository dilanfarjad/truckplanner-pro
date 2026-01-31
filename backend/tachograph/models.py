"""
Tachograph Data Models - Universelle Datenstrukturen
Unabhängig vom Hersteller (VDO, Stoneridge, Continental, etc.)
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class DriverActivity(str, Enum):
    """Fahrer-Aktivitätsstatus gemäß EU 561/2006"""
    DRIVING = "driving"       # 🚗 Fahrt (Lenkzeit)
    WORKING = "working"       # 🛠️ Arbeit (andere Arbeit)
    AVAILABLE = "available"   # 🪑 Bereitschaft
    REST = "rest"            # 🛌 Ruhezeit
    UNKNOWN = "unknown"      # ❓ Unbekannt


class TachographType(str, Enum):
    """Unterstützte Tachograph-Typen"""
    MANUAL = "manual"                    # Manuelle Eingabe
    VDO_DTCO_4_0 = "vdo_dtco_4.0"       # VDO DTCO 4.0
    VDO_DTCO_4_1 = "vdo_dtco_4.1"       # VDO DTCO 4.1
    VDO_DTCO_4_1A = "vdo_dtco_4.1a"     # VDO DTCO 4.1a
    STONERIDGE_SE5000 = "stoneridge_se5000"
    STONERIDGE_SE5000_8 = "stoneridge_se5000_8"
    CONTINENTAL_VDO = "continental_vdo"
    GENERIC_BLUETOOTH = "generic_bt"
    SIMULATION = "simulation"            # Test/Demo-Modus


class ConnectionStatus(str, Enum):
    """Verbindungsstatus zum Tachograph"""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"
    NOT_AVAILABLE = "not_available"


# ============== INPUTS (vom Tachograph) ==============

class TachographData(BaseModel):
    """
    Universelle Tachograph-Daten
    Diese Struktur ist für ALLE Hersteller gleich!
    """
    # Verbindungsstatus
    connection_status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    tachograph_type: TachographType = TachographType.MANUAL
    device_id: Optional[str] = None
    firmware_version: Optional[str] = None
    
    # Zeitstempel
    tachograph_time_utc: datetime = Field(default_factory=lambda: datetime.now())
    last_sync: Optional[datetime] = None
    
    # Fahrer-Status
    driver_1_present: bool = False
    driver_1_card_id: Optional[str] = None
    driver_1_activity: DriverActivity = DriverActivity.UNKNOWN
    
    driver_2_present: bool = False  # Team-Fahrer
    driver_2_card_id: Optional[str] = None
    driver_2_activity: DriverActivity = DriverActivity.UNKNOWN
    
    # Fahrzeug-Status
    vehicle_moving: bool = False
    current_speed_kmh: float = 0.0
    ignition_on: bool = False
    odometer_km: Optional[float] = None
    
    # Lenk- und Ruhezeiten (BERECHNET vom Tachograph)
    driving_time_since_break_minutes: int = 0      # Lenkzeit seit letzter Pause
    driving_time_today_minutes: int = 0            # Heutige Lenkzeit
    driving_time_week_minutes: int = 0             # Wöchentliche Lenkzeit
    driving_time_two_weeks_minutes: int = 0        # 2-Wochen Lenkzeit
    
    remaining_driving_time_minutes: int = 270      # Restlenkzeit bis Pause (4h30)
    remaining_daily_driving_minutes: int = 540     # Rest-Tageslenkzeit (9h)
    remaining_weekly_driving_minutes: int = 3360   # Rest-Wochenlenkzeit (56h)
    
    # Ruhezeiten
    current_rest_minutes: int = 0                  # Aktuelle Ruhezeit
    daily_rest_taken_minutes: int = 0              # Heutige Ruhezeit
    weekly_rest_taken_minutes: int = 0             # Wöchentliche Ruhezeit
    
    # Pausen
    break_taken_minutes: int = 0                   # Pause genommen (seit letztem Reset)
    break_parts: List[int] = []                    # Aufgeteilte Pausen [15, 30]
    
    # Erweiterungen diese Woche
    extended_daily_drives_used: int = 0            # 10h-Tage verwendet (max 2/Woche)
    reduced_daily_rests_used: int = 0              # 9h-Ruhezeiten verwendet (max 3/Woche)
    
    # Warnungen & Events
    warnings: List[str] = []
    active_violations: List[str] = []


class TachographEvent(BaseModel):
    """Ereignis vom Tachograph"""
    event_type: str
    timestamp: datetime
    description: str
    severity: str = "info"  # info, warning, error, critical
    driver_id: Optional[str] = None


# ============== OUTPUTS (zur App/UI) ==============

class ComplianceStatus(BaseModel):
    """Compliance-Status für UI"""
    is_compliant: bool = True
    risk_level: str = "green"  # green, yellow, red
    
    # Nächste Pflichtpause
    break_required_in_minutes: int = 270
    break_required_in_km: Optional[float] = None  # Berechnet aus GPS+Route
    break_duration_required: int = 45
    can_split_break: bool = True
    
    # Tageslimit
    daily_limit_reached: bool = False
    can_extend_today: bool = True
    
    # Warnungen
    warnings: List[str] = []
    recommendations: List[str] = []


class DrivingPermission(BaseModel):
    """Einfache Ja/Nein Antwort: Darf ich noch fahren?"""
    may_drive: bool = True
    reason: Optional[str] = None
    
    max_driving_minutes: int = 270
    max_driving_km: Optional[float] = None
    
    next_action: str = "continue"  # continue, plan_break, take_break, stop_now
    next_action_in_minutes: Optional[int] = None
    next_action_in_km: Optional[float] = None


# ============== Haftungsausschluss ==============

LEGAL_DISCLAIMER_DE = """
Hinweis:
Diese Anwendung ist ein Assistenz- und Planungssystem.
Maßgeblich sind ausschließlich die Anzeigen und Aufzeichnungen des digitalen Kontrollgeräts sowie die geltenden gesetzlichen Vorschriften.
"""

LEGAL_DISCLAIMER_LONG_DE = """
Die bereitgestellten Informationen zu Lenk-, Arbeits- und Ruhezeiten dienen ausschließlich der Unterstützung des Fahrers bei der Planung und Einschätzung.

Die Anwendung ersetzt weder das digitale Kontrollgerät noch die gesetzliche Verantwortung des Fahrers oder Unternehmers.

Trotz sorgfältiger Berechnung kann keine Gewähr für die vollständige Richtigkeit oder Aktualität der angezeigten Daten übernommen werden, insbesondere bei Abweichungen, technischen Störungen, manuellen Eingaben oder außergewöhnlichen Ereignissen.
"""

ARTICLE_12_EXCEPTION_DE = """
In außergewöhnlichen und unvorhersehbaren Situationen kann eine Abweichung von den gesetzlichen Lenk- und Ruhezeiten zulässig sein, sofern dies ausschließlich zur Erreichung eines geeigneten Halteplatzes erfolgt und keine Gefährdung der Verkehrssicherheit entsteht.

Der Fahrer ist verpflichtet, die Abweichung und deren Grund im digitalen Kontrollgerät manuell zu dokumentieren.
"""

DRIVER_RESPONSIBILITY_DE = """
Der Fahrer bleibt jederzeit für die Einhaltung der geltenden Vorschriften verantwortlich.
Entscheidungen über Weiterfahrt, Unterbrechung oder Ruhezeiten dürfen nicht ausschließlich auf Grundlage der Anwendung getroffen werden.
"""
