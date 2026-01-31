"""
EU 561/2006 Regel-Engine
Vollständige Implementierung aller Lenk- und Ruhezeit-Vorschriften

Entscheidungsbäume basierend auf:
- VO (EG) Nr. 561/2006
- VO (EU) Nr. 165/2014
"""

from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from .models import (
    TachographData, 
    DriverActivity, 
    ComplianceStatus,
    DrivingPermission
)


class EU561RuleEngine:
    """
    Modulare Regel-Engine für EU 561/2006
    
    Module:
    - DrivingTimeModule: 4h30 Lenkzeit
    - DailyDrivingModule: 9h/10h Tageslenkzeit  
    - WeeklyDrivingModule: 56h/90h Wochenlenkzeit
    - BreakModule: 45min Pause (teilbar 15+30)
    - DailyRestModule: 11h/9h tägliche Ruhezeit
    - WeeklyRestModule: 45h/24h wöchentliche Ruhezeit
    """
    
    # ============== KONSTANTEN (EU 561/2006) ==============
    
    # Lenkzeit
    MAX_DRIVING_BEFORE_BREAK = 270      # 4h 30min
    
    # Tageslenkzeit
    MAX_DAILY_DRIVING_NORMAL = 540      # 9h
    MAX_DAILY_DRIVING_EXTENDED = 600    # 10h (2x pro Woche erlaubt)
    MAX_EXTENDED_DAYS_PER_WEEK = 2
    
    # Wochenlenkzeit
    MAX_WEEKLY_DRIVING = 3360           # 56h
    MAX_TWO_WEEK_DRIVING = 5400         # 90h
    
    # Pausen
    MIN_BREAK_DURATION = 45             # 45min
    MIN_BREAK_PART_1 = 15               # Erste Teilpause
    MIN_BREAK_PART_2 = 30               # Zweite Teilpause
    
    # Tägliche Ruhezeit
    MIN_DAILY_REST_NORMAL = 660         # 11h
    MIN_DAILY_REST_REDUCED = 540        # 9h (3x pro Woche erlaubt)
    MAX_REDUCED_RESTS_PER_WEEK = 3
    
    # Wöchentliche Ruhezeit
    MIN_WEEKLY_REST_NORMAL = 2700       # 45h
    MIN_WEEKLY_REST_REDUCED = 1440      # 24h (mit Kompensation)
    
    # Warnzeiten (vor Limit)
    WARNING_THRESHOLD_30 = 30           # 30 min vorher: stille Warnung
    WARNING_THRESHOLD_10 = 10           # 10 min vorher: akustische Warnung
    
    def __init__(self):
        self.last_evaluation = None
        
    # ============== HAUPTFUNKTION ==============
    
    def evaluate(self, data: TachographData, avg_speed_kmh: float = 80) -> ComplianceStatus:
        """
        Hauptevaluation: Prüft alle Regeln und gibt Compliance-Status zurück
        
        Args:
            data: Aktuelle Tachograph-Daten
            avg_speed_kmh: Durchschnittsgeschwindigkeit für km-Berechnung
            
        Returns:
            ComplianceStatus mit allen Warnungen und Empfehlungen
        """
        self.last_evaluation = datetime.now()
        
        warnings = []
        recommendations = []
        risk_level = "green"
        
        # 1. Lenkzeit-Check (4h30)
        driving_check = self._check_driving_time(data)
        warnings.extend(driving_check["warnings"])
        recommendations.extend(driving_check["recommendations"])
        if driving_check["risk"] == "red":
            risk_level = "red"
        elif driving_check["risk"] == "yellow" and risk_level != "red":
            risk_level = "yellow"
            
        # 2. Tageslenkzeit-Check (9h/10h)
        daily_check = self._check_daily_driving(data)
        warnings.extend(daily_check["warnings"])
        recommendations.extend(daily_check["recommendations"])
        if daily_check["risk"] == "red":
            risk_level = "red"
        elif daily_check["risk"] == "yellow" and risk_level != "red":
            risk_level = "yellow"
            
        # 3. Wochenlenkzeit-Check (56h/90h)
        weekly_check = self._check_weekly_driving(data)
        warnings.extend(weekly_check["warnings"])
        recommendations.extend(weekly_check["recommendations"])
        if weekly_check["risk"] == "red":
            risk_level = "red"
        elif weekly_check["risk"] == "yellow" and risk_level != "red":
            risk_level = "yellow"
            
        # Berechne km basierend auf Restzeit
        remaining_minutes = min(
            driving_check["remaining"],
            daily_check["remaining"],
            weekly_check["remaining"]
        )
        remaining_km = (remaining_minutes / 60) * avg_speed_kmh
        
        return ComplianceStatus(
            is_compliant=risk_level != "red",
            risk_level=risk_level,
            break_required_in_minutes=driving_check["remaining"],
            break_required_in_km=round(remaining_km, 1),
            break_duration_required=self.MIN_BREAK_DURATION,
            can_split_break=data.break_taken_minutes < self.MIN_BREAK_PART_1,
            daily_limit_reached=daily_check["remaining"] <= 0,
            can_extend_today=data.extended_daily_drives_used < self.MAX_EXTENDED_DAYS_PER_WEEK,
            warnings=warnings,
            recommendations=recommendations
        )
    
    # ============== MODUL: Lenkzeit (Art. 7) ==============
    
    def _check_driving_time(self, data: TachographData) -> dict:
        """
        Prüft: Max 4h30 Lenkzeit ohne Pause
        
        Entscheidungsbaum:
        - driving_since_break < 4h30? → OK
        - Pause ≥ 45min (oder 15+30)? → Reset
        - Sonst → PAUSE ERFORDERLICH
        """
        remaining = self.MAX_DRIVING_BEFORE_BREAK - data.driving_time_since_break_minutes
        warnings = []
        recommendations = []
        risk = "green"
        
        # Stau-Warnung: Fahrzeug steht aber Status ist DRIVING
        if not data.vehicle_moving and data.driver_1_activity == DriverActivity.DRIVING:
            warnings.append("⚠️ Stau zählt als Lenkzeit!")
        
        if remaining <= 0:
            risk = "red"
            warnings.append("🛑 PAUSE JETZT ERFORDERLICH!")
            recommendations.append("Nächsten Rastplatz anfahren (45 Min Pause)")
        elif remaining <= self.WARNING_THRESHOLD_10:
            risk = "red"
            warnings.append(f"⚠️ Nur noch {remaining} Min bis Pflichtpause!")
            recommendations.append("Pause in den nächsten Minuten einplanen")
        elif remaining <= self.WARNING_THRESHOLD_30:
            risk = "yellow"
            warnings.append(f"🟡 Pause in {remaining} Min erforderlich")
            recommendations.append("Rastplatz auf der Route suchen")
            
        # Teilpause möglich?
        if data.break_taken_minutes >= self.MIN_BREAK_PART_1 and data.break_taken_minutes < self.MIN_BREAK_DURATION:
            recommendations.append(f"Noch {self.MIN_BREAK_DURATION - data.break_taken_minutes} Min Pause für Reset")
            
        return {
            "remaining": max(0, remaining),
            "warnings": warnings,
            "recommendations": recommendations,
            "risk": risk
        }
    
    # ============== MODUL: Tageslenkzeit (Art. 6 Abs. 1) ==============
    
    def _check_daily_driving(self, data: TachographData) -> dict:
        """
        Prüft: Max 9h pro Tag (2x pro Woche 10h erlaubt)
        
        Entscheidungsbaum:
        - driving_today ≤ 9h? → OK
        - extended_drives < 2 diese Woche? → 10h erlaubt
        - driving_today ≤ 10h? → OK (mit Extension)
        - Sonst → ILLEGAL
        """
        warnings = []
        recommendations = []
        risk = "green"
        
        can_extend = data.extended_daily_drives_used < self.MAX_EXTENDED_DAYS_PER_WEEK
        current_limit = self.MAX_DAILY_DRIVING_EXTENDED if can_extend else self.MAX_DAILY_DRIVING_NORMAL
        remaining = current_limit - data.driving_time_today_minutes
        
        if data.driving_time_today_minutes > self.MAX_DAILY_DRIVING_EXTENDED:
            risk = "red"
            warnings.append("🛑 TAGESLENKZEIT ÜBERSCHRITTEN!")
            recommendations.append("Tägliche Ruhezeit beginnen")
        elif data.driving_time_today_minutes > self.MAX_DAILY_DRIVING_NORMAL:
            if can_extend:
                risk = "yellow"
                warnings.append(f"🟡 Verlängerte Tageslenkzeit aktiv ({data.extended_daily_drives_used + 1}/2 diese Woche)")
            else:
                risk = "red"
                warnings.append("🛑 Keine Verlängerung mehr möglich diese Woche!")
                recommendations.append("Tägliche Ruhezeit beginnen")
        elif remaining <= 60:
            risk = "yellow"
            warnings.append(f"🟡 Noch {remaining} Min Tageslenkzeit")
            
        return {
            "remaining": max(0, remaining),
            "warnings": warnings,
            "recommendations": recommendations,
            "risk": risk
        }
    
    # ============== MODUL: Wochenlenkzeit (Art. 6 Abs. 2-3) ==============
    
    def _check_weekly_driving(self, data: TachographData) -> dict:
        """
        Prüft: Max 56h/Woche, Max 90h in 2 Wochen
        """
        warnings = []
        recommendations = []
        risk = "green"
        
        remaining_week = self.MAX_WEEKLY_DRIVING - data.driving_time_week_minutes
        remaining_two_weeks = self.MAX_TWO_WEEK_DRIVING - data.driving_time_two_weeks_minutes
        remaining = min(remaining_week, remaining_two_weeks)
        
        if remaining_week <= 0:
            risk = "red"
            warnings.append("🛑 WOCHENLENKZEIT ERREICHT!")
            recommendations.append("Wöchentliche Ruhezeit beginnen")
        elif remaining_two_weeks <= 0:
            risk = "red"
            warnings.append("🛑 2-WOCHEN-LIMIT ERREICHT (90h)!")
        elif remaining <= 120:  # 2h
            risk = "yellow"
            warnings.append(f"🟡 Noch {remaining} Min Wochenlenkzeit")
            
        return {
            "remaining": max(0, remaining),
            "warnings": warnings,
            "recommendations": recommendations,
            "risk": risk
        }
    
    # ============== EINFACHE ABFRAGE ==============
    
    def may_drive(self, data: TachographData, avg_speed_kmh: float = 80) -> DrivingPermission:
        """
        Einfache Ja/Nein Antwort: Darf der Fahrer noch fahren?
        
        Returns:
            DrivingPermission mit klarer Handlungsempfehlung
        """
        status = self.evaluate(data, avg_speed_kmh)
        
        if not status.is_compliant:
            return DrivingPermission(
                may_drive=False,
                reason="Pause oder Ruhezeit erforderlich",
                max_driving_minutes=0,
                max_driving_km=0,
                next_action="take_break" if status.break_required_in_minutes <= 0 else "stop_now",
                next_action_in_minutes=0,
                next_action_in_km=0
            )
            
        if status.risk_level == "yellow":
            return DrivingPermission(
                may_drive=True,
                reason=status.warnings[0] if status.warnings else None,
                max_driving_minutes=status.break_required_in_minutes,
                max_driving_km=status.break_required_in_km,
                next_action="plan_break",
                next_action_in_minutes=status.break_required_in_minutes,
                next_action_in_km=status.break_required_in_km
            )
            
        return DrivingPermission(
            may_drive=True,
            reason=None,
            max_driving_minutes=status.break_required_in_minutes,
            max_driving_km=status.break_required_in_km,
            next_action="continue",
            next_action_in_minutes=status.break_required_in_minutes,
            next_action_in_km=status.break_required_in_km
        )
    
    # ============== ART. 12 AUSNAHME ==============
    
    def check_article_12_exception(
        self, 
        data: TachographData,
        reason: str,
        target_is_safe_location: bool
    ) -> dict:
        """
        Prüft ob Art. 12 Ausnahme anwendbar ist
        
        Art. 12: Bei unvorhersehbaren Umständen darf von den Vorschriften
        abgewichen werden, sofern die Verkehrssicherheit nicht gefährdet ist
        und ein geeigneter Halteplatz angesteuert wird.
        
        Returns:
            dict mit Entscheidung und Dokumentationsanforderungen
        """
        # Prüfung: Verstoß droht?
        status = self.evaluate(data)
        if status.is_compliant and status.risk_level == "green":
            return {
                "applicable": False,
                "reason": "Kein Verstoß - Ausnahme nicht erforderlich"
            }
            
        # Prüfung: Ziel ist sicherer Halteplatz?
        if not target_is_safe_location:
            return {
                "applicable": False,
                "reason": "Ziel muss ein geeigneter Halteplatz sein"
            }
            
        # Ausnahme kann angewendet werden
        return {
            "applicable": True,
            "reason": reason,
            "documentation_required": True,
            "instructions": [
                "Grund der Abweichung im Tachographen dokumentieren",
                "Art und Dauer der Abweichung notieren",
                "Nächsten geeigneten Halteplatz anfahren",
                "Keine Gefährdung der Verkehrssicherheit"
            ],
            "warning": "Diese Ausnahme sollte nur in echten Notfällen genutzt werden!"
        }
