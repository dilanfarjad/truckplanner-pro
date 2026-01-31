from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'truckermaps')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'nightpilot_secret')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Import neue Services
from services.toll_service import get_toll_service
from services.speed_camera_service import get_speed_camera_service, SPEED_CAMERA_LEGAL_DISCLAIMER_DE, SPEED_CAMERA_LEGAL_DISCLAIMER_EN
from services.tomtom_routing import get_tomtom_service, TruckProfile

# OpenRouteService API
ORS_API_KEY = os.environ.get('OPENROUTESERVICE_API_KEY', '')
ORS_BASE_URL = "https://api.openrouteservice.org"

# Create the main app
app = FastAPI(title="TruckerMaps - LKW Routenplaner")
api_router = APIRouter(prefix="/api")

# ============== Models ==============

# Auth Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    language: str = "de"
    role: str = "driver"  # driver, manager

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    language: str
    role: str = "driver"
    fleet_id: Optional[str] = None
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Fleet/Manager Models
class FleetCreate(BaseModel):
    name: str
    company: str

class Fleet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    company: str
    manager_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DriverInvite(BaseModel):
    email: EmailStr
    fleet_id: str

# GPS/Location Models
class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = None  # km/h
    heading: Optional[float] = None  # degrees
    accuracy: Optional[float] = None

class DriverLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    driver_name: str
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    last_updated: str
    current_driving_minutes: int = 0
    current_work_minutes: int = 0
    status: str = "idle"  # idle, driving, break, rest

# Notification Models
class NotificationSettings(BaseModel):
    break_reminder: bool = True
    break_reminder_minutes: int = 30  # minutes before break required
    weekly_limit_warning: bool = True
    weekly_limit_percent: int = 80

# Vehicle Profile Models
class VehicleProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    vehicle_type: str  # sattelzug, gliederzug, solo_lkw, omnibus
    height: float  # meters
    width: float  # meters
    length: float  # meters
    weight: float  # kg
    axle_load: float  # kg
    is_default: bool = False

class VehicleProfileCreate(BaseModel):
    name: str
    vehicle_type: str
    height: float
    width: float
    length: float
    weight: float
    axle_load: float
    fuel_consumption: float = 32.0  # L/100km - Standard LKW
    fuel_type: str = "diesel"  # diesel, electric, lng
    emission_class: str = "EURO_6"  # EURO_5, EURO_6, EURO_6d
    is_default: bool = False

# Driving Log Models
class DrivingLogEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str  # ISO date YYYY-MM-DD
    work_start_time: Optional[str] = None  # Zeit als HH:MM (z.B. "06:30")
    work_end_time: Optional[str] = None  # Zeit als HH:MM
    driving_start_time: Optional[str] = None  # Lenkzeit-Beginn HH:MM
    driving_end_time: Optional[str] = None  # Lenkzeit-Ende HH:MM
    total_driving_minutes: int = 0
    total_work_minutes: int = 0
    breaks: List[dict] = []  # [{start_time, end_time, type, duration_minutes}]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DrivingLogCreate(BaseModel):
    date: str
    work_start_time: Optional[str] = None  # HH:MM Format
    work_end_time: Optional[str] = None
    driving_start_time: Optional[str] = None
    driving_end_time: Optional[str] = None
    total_driving_minutes: int = 0
    total_work_minutes: int = 0
    breaks: List[dict] = []

class BreakEntry(BaseModel):
    start: str
    end: str
    break_type: str  # 'fahrtunterbrechung', 'pause', 'ruhezeit'
    duration_minutes: int

# Route Planning Models
class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    vehicle_profile_id: Optional[str] = None
    current_driving_minutes: int = 0
    current_work_minutes: int = 0
    work_start_time: Optional[str] = None
    driving_start_time: Optional[str] = None

class BreakSuggestion(BaseModel):
    location: dict  # {lat, lon, name}
    break_type: str
    duration_minutes: int
    reason: str
    distance_from_start_km: float
    estimated_arrival: str
    rest_stop_name: Optional[str] = None  # Name des Rastplatzes

class NavigationStep(BaseModel):
    instruction: str  # "Rechts abbiegen auf A9"
    instruction_de: str  # Deutsche Anweisung
    distance_meters: float
    duration_seconds: float
    maneuver_type: str  # turn, merge, exit, etc.
    road_name: Optional[str] = None

class RouteResponse(BaseModel):
    route_geometry: List[List[float]]  # [[lon, lat], ...]
    distance_km: float
    duration_minutes: int
    break_suggestions: List[BreakSuggestion]
    warnings: List[str]
    rest_stops: List[dict]
    navigation_steps: List[NavigationStep] = []  # Turn-by-Turn Navigation
    optimal_rest_stop: Optional[dict] = None  # Bester Rastplatz AUF der Route
    rest_stop_options: List[dict] = []  # 3 Rastplatz-Vorschläge (früh, mittel, spät)

# ============== Helper Functions ==============

def translate_navigation(maneuver_type: str, modifier: str, road_name: str) -> str:
    """Translate OSRM navigation instructions to German"""
    translations = {
        "turn": {
            "left": "Links abbiegen",
            "right": "Rechts abbiegen",
            "slight left": "Leicht links abbiegen",
            "slight right": "Leicht rechts abbiegen",
            "sharp left": "Scharf links abbiegen",
            "sharp right": "Scharf rechts abbiegen",
            "uturn": "Wenden"
        },
        "merge": "Einfädeln",
        "depart": "Losfahren",
        "arrive": "Ziel erreicht",
        "fork": {
            "left": "Links halten",
            "right": "Rechts halten"
        },
        "roundabout": "Im Kreisverkehr",
        "exit roundabout": "Kreisverkehr verlassen",
        "continue": "Weiter geradeaus",
        "off ramp": {
            "left": "Links abfahren",
            "right": "Rechts abfahren"
        },
        "on ramp": "Auffahren"
    }
    
    result = ""
    if maneuver_type in translations:
        if isinstance(translations[maneuver_type], dict):
            result = translations[maneuver_type].get(modifier, f"{maneuver_type} {modifier}")
        else:
            result = translations[maneuver_type]
    else:
        result = f"{maneuver_type} {modifier}".strip()
    
    if road_name:
        result += f" auf {road_name}"
    
    return result

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# EU VO 561/2006 Driving Time Calculator
def calculate_break_requirements(
    current_driving_minutes: int,
    current_work_minutes: int,
    route_duration_minutes: int,
    work_start_time: Optional[str] = None,
    extended_days_this_week: int = 0,  # Wie oft diese Woche schon 10h gefahren
    unused_block_minutes: int = 0  # Restminuten aus vorherigem unvollständigen Block
) -> dict:
    """
    Verbesserte EU-konforme Lenkzeitberechnung (VO 561/2006):
    
    WICHTIG: 4,5h ist das ABSOLUTE Maximum - bei 4:31 ist es ein Verstoß!
    
    3 Rastplatz-Empfehlungen (SICHERHEITSPUFFER eingebaut):
    - FRÜH: nach 2h (120 min) - Entspanntes Fahren, empfohlen
    - MITTEL: nach 3h (180 min) - Guter Kompromiss  
    - SPÄT: nach 4h (240 min) - Sicher vor dem gesetzlichen Maximum!
    
    NICHT bei 4,5h! Das wäre zu knapp am Verstoß.
    
    2x pro Woche: 10h statt 9h Tageslenkzeit erlaubt
    """
    BLOCK_MAX = 270  # 4,5h = 270 min - Gesetzliches Maximum (NICHT überschreiten!)
    BLOCK_WARNING = 240  # 4h - Ab hier Warnung anzeigen
    BREAK_EARLY = 120    # 2h - Frühe Empfehlung (entspannt)
    BREAK_MEDIUM = 180   # 3h - Mittlere Empfehlung (Kompromiss)
    BREAK_LATE = 240     # 4h - Späte Empfehlung (SICHER vor Maximum!)
    
    MAX_DAILY_DRIVING_NORMAL = 540  # 9 Stunden normal
    MAX_DAILY_DRIVING_EXTENDED = 600  # 10 Stunden (2x pro Woche erlaubt)
    MAX_WEEKLY_EXTENDED_DAYS = 2  # Maximal 2x pro Woche
    MAX_DAILY_WORK = 600  # 10 Stunden Arbeitszeit
    BREAK_DURATION = 45
    
    warnings = []
    
    # Prüfe ob heute 10h-Tag möglich ist
    can_extend_today = extended_days_this_week < MAX_WEEKLY_EXTENDED_DAYS
    max_daily_driving = MAX_DAILY_DRIVING_EXTENDED if can_extend_today else MAX_DAILY_DRIVING_NORMAL
    
    # Berechne wie viel Zeit im aktuellen Block bereits gefahren wurde
    current_block_driving = current_driving_minutes % BLOCK_MAX
    
    # Effective daily driving
    effective_daily_driving = current_driving_minutes
    
    # Berechne verbleibende Zeiten
    remaining_in_current_block = BLOCK_MAX - current_block_driving
    remaining_until_early = max(0, BREAK_EARLY - current_block_driving)
    remaining_until_medium = max(0, BREAK_MEDIUM - current_block_driving)
    remaining_until_late = max(0, BREAK_LATE - current_block_driving)
    remaining_until_max = max(0, BLOCK_MAX - current_block_driving)  # Absolutes Maximum
    
    remaining_daily_driving = max_daily_driving - effective_daily_driving
    remaining_daily_work = MAX_DAILY_WORK - current_work_minutes
    
    # Berechne Restlenkzeit nach diesem Block
    used_driving_today = current_driving_minutes + route_duration_minutes
    remaining_after_route = max(0, max_daily_driving - used_driving_today)
    
    # 3 Break-Empfehlungen (alle SICHER vor dem Maximum!)
    break_options = []
    
    if remaining_until_early <= route_duration_minutes and remaining_until_early > 0:
        break_options.append({
            "type": "early",
            "label": "Früh (2h)",
            "label_en": "Early (2h)",
            "at_route_minute": remaining_until_early,
            "rating": "✓ empfohlen",
            "rating_en": "✓ recommended",
            "color": "green"
        })
    
    if remaining_until_medium <= route_duration_minutes and remaining_until_medium > 0:
        break_options.append({
            "type": "medium", 
            "label": "Mittel (3h)",
            "label_en": "Medium (3h)",
            "at_route_minute": remaining_until_medium,
            "rating": "gut",
            "rating_en": "good",
            "color": "yellow"
        })
    
    if remaining_until_late <= route_duration_minutes and remaining_until_late > 0:
        break_options.append({
            "type": "late",
            "label": "Spät (4h)",
            "label_en": "Late (4h)",
            "at_route_minute": remaining_until_late,
            "rating": "⚠️ Grenze!",
            "rating_en": "⚠️ Limit!",
            "color": "red"
        })
    
    # Warnungen
    if route_duration_minutes > remaining_daily_driving:
        if can_extend_today and route_duration_minutes <= (MAX_DAILY_DRIVING_EXTENDED - effective_daily_driving):
            warnings.append(f"⚠️ 10h-Tag erforderlich (noch {MAX_WEEKLY_EXTENDED_DAYS - extended_days_this_week}x diese Woche möglich)")
        else:
            warnings.append(f"❌ Route überschreitet Tageslenkzeit! Max noch {remaining_daily_driving} Min")
    
    # Warnung bei weniger als 30 Minuten bis zum Maximum
    if remaining_until_max <= 30:
        warnings.append("🛑 SOFORT Fahrtunterbrechung erforderlich!")
    elif remaining_until_max <= 60:
        warnings.append("⚠️ Nur noch weniger als 1h bis zur Pflichtpause!")
    
    # Risk Level für UI
    if current_block_driving >= BLOCK_WARNING:
        risk_level = "red"
    elif current_block_driving >= BREAK_MEDIUM:
        risk_level = "yellow"
    else:
        risk_level = "green"
    
    return {
        "remaining_driving_before_break": remaining_until_max,
        "remaining_in_current_block": remaining_in_current_block,
        "remaining_daily_driving": remaining_daily_driving,
        "remaining_daily_work": remaining_daily_work,
        "remaining_after_route": remaining_after_route,
        "break_needed_at_minutes": break_options[0]["at_route_minute"] if break_options else None,
        "break_type": "fahrtunterbrechung",
        "break_duration": BREAK_DURATION,
        "can_split_break": True,
        "warnings": warnings,
        "break_options": break_options,  # 3 Vorschläge!
        "max_driving_minutes": BLOCK_MAX,
        "max_daily_normal": MAX_DAILY_DRIVING_NORMAL,
        "max_daily_extended": MAX_DAILY_DRIVING_EXTENDED,
        "can_extend_today": can_extend_today,
        "extended_days_this_week": extended_days_this_week,
        "risk_level": risk_level,
        "current_block_driving": current_block_driving,
        "block_warning_threshold": BLOCK_WARNING
    }

# ============== Auth Routes ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "language": user_data.language,
        "role": user_data.role,
        "fleet_id": None,
        "notification_settings": {
            "break_reminder": True,
            "break_reminder_minutes": 30,
            "weekly_limit_warning": True,
            "weekly_limit_percent": 80
        },
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    # Create default vehicle profiles for drivers
    if user_data.role == "driver":
        default_vehicles = [
            {"name": "Sattelzug (Standard)", "vehicle_type": "sattelzug", "height": 4.0, "width": 2.55, "length": 16.5, "weight": 40000, "axle_load": 11500, "is_default": True},
            {"name": "Gliederzug", "vehicle_type": "gliederzug", "height": 4.0, "width": 2.55, "length": 18.75, "weight": 40000, "axle_load": 11500, "is_default": False},
            {"name": "Solo-LKW (7.5t)", "vehicle_type": "solo_lkw", "height": 3.5, "width": 2.55, "length": 10.0, "weight": 7500, "axle_load": 11500, "is_default": False},
            {"name": "Omnibus (Standard)", "vehicle_type": "omnibus", "height": 4.0, "width": 2.55, "length": 15.0, "weight": 24000, "axle_load": 11500, "is_default": False},
        ]
        
        for v in default_vehicles:
            vehicle_doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                **v
            }
            await db.vehicle_profiles.insert_one(vehicle_doc)
    
    token = create_token(user_id)
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        language=user_data.language,
        role=user_data.role,
        fleet_id=None,
        created_at=user_doc["created_at"]
    )
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"])
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        language=user.get("language", "de"),
        role=user.get("role", "driver"),
        fleet_id=user.get("fleet_id"),
        created_at=user["created_at"]
    )
    
    return TokenResponse(access_token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        language=user.get("language", "de"),
        role=user.get("role", "driver"),
        fleet_id=user.get("fleet_id"),
        created_at=user["created_at"]
    )

@api_router.put("/auth/language")
async def update_language(language: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"language": language}})
    return {"message": "Language updated", "language": language}

# ============== Vehicle Profile Routes ==============

@api_router.get("/vehicles", response_model=List[VehicleProfile])
async def get_vehicles(user: dict = Depends(get_current_user)):
    vehicles = await db.vehicle_profiles.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return vehicles

@api_router.post("/vehicles", response_model=VehicleProfile)
async def create_vehicle(data: VehicleProfileCreate, user: dict = Depends(get_current_user)):
    vehicle_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **data.model_dump()
    }
    
    # If default, unset other defaults
    if data.is_default:
        await db.vehicle_profiles.update_many(
            {"user_id": user["id"]},
            {"$set": {"is_default": False}}
        )
    
    await db.vehicle_profiles.insert_one(vehicle_doc)
    return VehicleProfile(**vehicle_doc)

@api_router.put("/vehicles/{vehicle_id}", response_model=VehicleProfile)
async def update_vehicle(vehicle_id: str, data: VehicleProfileCreate, user: dict = Depends(get_current_user)):
    # If setting as default, unset other defaults
    if data.is_default:
        await db.vehicle_profiles.update_many(
            {"user_id": user["id"]},
            {"$set": {"is_default": False}}
        )
    
    await db.vehicle_profiles.update_one(
        {"id": vehicle_id, "user_id": user["id"]},
        {"$set": data.model_dump()}
    )
    
    vehicle = await db.vehicle_profiles.find_one({"id": vehicle_id}, {"_id": 0})
    return VehicleProfile(**vehicle)

@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    result = await db.vehicle_profiles.delete_one({"id": vehicle_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"message": "Vehicle deleted"}

@api_router.put("/vehicles/{vehicle_id}/default")
async def set_default_vehicle(vehicle_id: str, user: dict = Depends(get_current_user)):
    """Set a vehicle as the default for the user"""
    # Check if vehicle exists
    vehicle = await db.vehicle_profiles.find_one({"id": vehicle_id, "user_id": user["id"]})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # Unset all defaults
    await db.vehicle_profiles.update_many(
        {"user_id": user["id"]},
        {"$set": {"is_default": False}}
    )
    
    # Set this one as default
    await db.vehicle_profiles.update_one(
        {"id": vehicle_id},
        {"$set": {"is_default": True}}
    )
    
    return {"message": "Default vehicle set", "vehicle_id": vehicle_id}

# ============== Driving Log Routes ==============

@api_router.get("/driving-logs", response_model=List[DrivingLogEntry])
async def get_driving_logs(user: dict = Depends(get_current_user), days: int = 56):
    """Get driving logs for the last N days (default 56 for legal requirement)"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    logs = await db.driving_logs.find(
        {"user_id": user["id"], "date": {"$gte": cutoff[:10]}},
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    return logs

@api_router.post("/driving-logs", response_model=DrivingLogEntry)
async def create_driving_log(data: DrivingLogCreate, user: dict = Depends(get_current_user)):
    # Check if log for this date exists
    existing = await db.driving_logs.find_one({"user_id": user["id"], "date": data.date})
    if existing:
        raise HTTPException(status_code=400, detail="Log for this date already exists. Use PUT to update.")
    
    log_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **data.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.driving_logs.insert_one(log_doc)
    return DrivingLogEntry(**log_doc)

@api_router.put("/driving-logs/{log_id}", response_model=DrivingLogEntry)
async def update_driving_log(log_id: str, data: DrivingLogCreate, user: dict = Depends(get_current_user)):
    await db.driving_logs.update_one(
        {"id": log_id, "user_id": user["id"]},
        {"$set": data.model_dump()}
    )
    log = await db.driving_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return DrivingLogEntry(**log)

@api_router.post("/driving-logs/{log_id}/breaks", response_model=DrivingLogEntry)
async def add_break_to_log(log_id: str, break_data: BreakEntry, user: dict = Depends(get_current_user)):
    """Add a break entry to a driving log"""
    log = await db.driving_logs.find_one({"id": log_id, "user_id": user["id"]})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    breaks = log.get("breaks", [])
    breaks.append(break_data.model_dump())
    
    await db.driving_logs.update_one(
        {"id": log_id},
        {"$set": {"breaks": breaks}}
    )
    
    updated_log = await db.driving_logs.find_one({"id": log_id}, {"_id": 0})
    return DrivingLogEntry(**updated_log)

# ============== Live Driving Log (Arbeitsmodi) ==============

class LiveLogStart(BaseModel):
    activity_type: str  # driving, working, available, break
    vehicle_id: Optional[str] = None

class LiveLogStop(BaseModel):
    entry_id: str

@api_router.post("/driving-logs/start")
async def start_live_driving_log(data: LiveLogStart, user: dict = Depends(get_current_user)):
    """
    Startet einen neuen Live-Fahrtenbuch-Eintrag
    Wird automatisch beim Routenstart oder manuell durch Arbeitsmodus-Buttons aufgerufen
    """
    # Prüfe ob bereits aktiver Eintrag existiert
    existing_active = await db.live_driving_logs.find_one({
        "user_id": user["id"],
        "is_active": True
    })
    
    if existing_active:
        # Beende den vorherigen Eintrag automatisch
        await stop_active_log(existing_active)
    
    # Fahrzeug abrufen
    vehicle_name = None
    if data.vehicle_id:
        vehicle = await db.vehicle_profiles.find_one({"id": data.vehicle_id, "user_id": user["id"]}, {"_id": 0})
        if vehicle:
            vehicle_name = vehicle.get("name")
    else:
        # Standard-Fahrzeug
        vehicle = await db.vehicle_profiles.find_one({"user_id": user["id"], "is_default": True}, {"_id": 0})
        if vehicle:
            vehicle_name = vehicle.get("name")
    
    # Neuen Live-Eintrag erstellen
    now = datetime.now(timezone.utc)
    entry_id = str(uuid.uuid4())
    
    live_entry = {
        "id": entry_id,
        "user_id": user["id"],
        "activity_type": data.activity_type,
        "start_time": now.isoformat(),
        "end_time": None,
        "duration_minutes": 0,
        "vehicle_id": data.vehicle_id,
        "vehicle_name": vehicle_name,
        "is_active": True,
        "date": now.strftime("%Y-%m-%d"),
        "created_at": now.isoformat()
    }
    
    await db.live_driving_logs.insert_one(live_entry)
    
    # Entferne _id für Response
    live_entry.pop("_id", None)
    
    return live_entry

async def stop_active_log(log_entry: dict):
    """Hilfsfunktion um einen aktiven Log-Eintrag zu beenden"""
    now = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(log_entry["start_time"].replace("Z", "+00:00"))
    duration_minutes = int((now - start_time).total_seconds() / 60)
    
    await db.live_driving_logs.update_one(
        {"id": log_entry["id"]},
        {"$set": {
            "is_active": False,
            "end_time": now.isoformat(),
            "duration_minutes": duration_minutes
        }}
    )
    
    # Auch ins reguläre Fahrtenbuch übertragen
    date_str = log_entry["date"]
    existing_daily = await db.driving_logs.find_one({
        "user_id": log_entry["user_id"],
        "date": date_str
    })
    
    if existing_daily:
        # Update existing daily log
        update_fields = {}
        if log_entry["activity_type"] == "driving":
            update_fields["total_driving_minutes"] = existing_daily.get("total_driving_minutes", 0) + duration_minutes
        elif log_entry["activity_type"] in ["working", "available"]:
            update_fields["total_work_minutes"] = existing_daily.get("total_work_minutes", 0) + duration_minutes
        
        if update_fields:
            await db.driving_logs.update_one(
                {"id": existing_daily["id"]},
                {"$set": update_fields}
            )
    else:
        # Create new daily log
        driving_mins = duration_minutes if log_entry["activity_type"] == "driving" else 0
        work_mins = duration_minutes if log_entry["activity_type"] in ["working", "available"] else 0
        
        new_daily_log = {
            "id": str(uuid.uuid4()),
            "user_id": log_entry["user_id"],
            "date": date_str,
            "total_driving_minutes": driving_mins,
            "total_work_minutes": work_mins,
            "rest_minutes": duration_minutes if log_entry["activity_type"] == "break" else 0,
            "vehicle_name": log_entry.get("vehicle_name", ""),
            "start_time": log_entry["start_time"][:16].replace("T", " ").split(" ")[1] if "T" in log_entry["start_time"] else "",
            "end_time": now.strftime("%H:%M"),
            "notes": f"Auto-generiert: {log_entry['activity_type']}",
            "created_at": now.isoformat()
        }
        await db.driving_logs.insert_one(new_daily_log)

@api_router.post("/driving-logs/stop")
async def stop_live_driving_log(data: LiveLogStop, user: dict = Depends(get_current_user)):
    """
    Beendet einen Live-Fahrtenbuch-Eintrag
    Berechnet die Dauer und speichert ins reguläre Fahrtenbuch
    """
    # Finde den aktiven Eintrag
    log_entry = await db.live_driving_logs.find_one({
        "id": data.entry_id,
        "user_id": user["id"],
        "is_active": True
    })
    
    if not log_entry:
        raise HTTPException(status_code=404, detail="Kein aktiver Eintrag gefunden")
    
    await stop_active_log(log_entry)
    
    now = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(log_entry["start_time"].replace("Z", "+00:00"))
    duration_minutes = int((now - start_time).total_seconds() / 60)
    
    return {
        "message": "Eintrag beendet",
        "entry_id": data.entry_id,
        "duration_minutes": duration_minutes,
        "activity_type": log_entry["activity_type"]
    }

@api_router.get("/driving-logs/active")
async def get_active_driving_log(user: dict = Depends(get_current_user)):
    """
    Prüft ob ein aktiver Live-Fahrtenbuch-Eintrag existiert
    Wird beim Laden des Dashboards aufgerufen
    """
    active_entry = await db.live_driving_logs.find_one({
        "user_id": user["id"],
        "is_active": True
    }, {"_id": 0})
    
    if not active_entry:
        return {"is_active": False}
    
    return active_entry

@api_router.get("/driving-logs/summary")
async def get_driving_summary(user: dict = Depends(get_current_user)):
    """Get summary of driving times for current week and last week"""
    today = datetime.now(timezone.utc)
    week_start = today - timedelta(days=today.weekday())
    last_week_start = week_start - timedelta(days=7)
    
    # Current week logs
    current_week_logs = await db.driving_logs.find({
        "user_id": user["id"],
        "date": {"$gte": week_start.strftime("%Y-%m-%d")}
    }, {"_id": 0}).to_list(100)
    
    # Last week logs
    last_week_logs = await db.driving_logs.find({
        "user_id": user["id"],
        "date": {"$gte": last_week_start.strftime("%Y-%m-%d"), "$lt": week_start.strftime("%Y-%m-%d")}
    }, {"_id": 0}).to_list(100)
    
    current_week_driving = sum(log.get("total_driving_minutes", 0) for log in current_week_logs)
    last_week_driving = sum(log.get("total_driving_minutes", 0) for log in last_week_logs)
    
    # Two-week total (max 90h = 5400 min)
    two_week_total = current_week_driving + last_week_driving
    
    return {
        "current_week_driving_minutes": current_week_driving,
        "last_week_driving_minutes": last_week_driving,
        "two_week_total_minutes": two_week_total,
        "remaining_this_week_minutes": max(0, 3360 - current_week_driving),  # 56h = 3360min
        "remaining_two_week_minutes": max(0, 5400 - two_week_total),  # 90h = 5400min
        "warnings": []
    }

@api_router.get("/driving-logs/export")
async def export_driving_logs(
    format: str = "csv",
    user: dict = Depends(get_current_user)
):
    """
    Export driving logs as CSV or PDF
    Format: 'csv' or 'pdf'
    """
    from fastapi.responses import Response
    import io
    
    # Get all logs for user (last 56 days)
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=56)
    logs = await db.driving_logs.find(
        {"user_id": user["id"], "date": {"$gte": cutoff_date.isoformat()}},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    
    if format.lower() == "csv":
        # Generate CSV
        output = io.StringIO()
        output.write("Datum;Start;Ende;Lenkzeit (min);Arbeitszeit (min);Ruhezeit (min);Fahrzeug;Bemerkungen\n")
        
        for log in logs:
            date = log.get("date", "")[:10]
            start = log.get("start_time", "")
            end = log.get("end_time", "")
            driving = log.get("total_driving_minutes", 0)
            work = log.get("total_work_minutes", 0)
            rest = log.get("rest_minutes", 0)
            vehicle = log.get("vehicle_name", "")
            notes = log.get("notes", "").replace(";", ",").replace("\n", " ")
            
            output.write(f"{date};{start};{end};{driving};{work};{rest};{vehicle};{notes}\n")
        
        csv_content = output.getvalue()
        
        return Response(
            content=csv_content.encode('utf-8-sig'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=fahrtenbuch_{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
    
    elif format.lower() == "pdf":
        # Generate PDF via weasyprint
        from weasyprint import HTML
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @page {{ margin: 1.5cm; }}
                body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #1f2937; line-height: 1.5; }}
                .header {{ border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 20px; }}
                h1 {{ color: #f97316; margin: 0; font-size: 24px; }}
                .meta {{ font-size: 10px; color: #6b7280; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }}
                th, td {{ border: 1px solid #e5e7eb; padding: 8px; text-align: left; }}
                th {{ background-color: #f3f4f6; font-weight: bold; color: #374151; }}
                tr:nth-child(even) {{ background-color: #f9fafb; }}
                .summary {{ margin-top: 30px; padding: 15px; background-color: #fff7ed; border-radius: 8px; border: 1px solid #ffedd5; }}
                .footer {{ margin-top: 50px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 9px; color: #9ca3af; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Fahrtenbuch - Offizieller Export</h1>
                <div class="meta">Fahrer: {user.get('name', 'N/A')} | Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')}</div>
            </div>
            
            <p>Dieser Bericht enthält alle aufgezeichneten Lenk- und Arbeitszeiten der letzten 56 Tage gemäß EU-Verordnung 561/2006.</p>
            
            <table>
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Beginn</th>
                        <th>Ende</th>
                        <th>Lenkzeit</th>
                        <th>Arbeit</th>
                        <th>Pause</th>
                        <th>Fahrzeug</th>
                    </tr>
                </thead>
                <tbody>
        """
        
        total_driving = 0
        total_work = 0
        
        for log in logs:
            date = log.get("date", "")[:10]
            start = log.get("start_time", "-")
            end = log.get("end_time", "-")
            driving = log.get("total_driving_minutes", 0)
            work = log.get("total_work_minutes", 0)
            rest = log.get("rest_minutes", 0)
            vehicle = log.get("vehicle_name", "-")
            
            total_driving += driving
            total_work += work
            
            html_content += f"""
                    <tr>
                        <td>{date}</td>
                        <td>{start}</td>
                        <td>{end}</td>
                        <td>{driving // 60}h {driving % 60}m</td>
                        <td>{work // 60}h {work % 60}m</td>
                        <td>{rest // 60}h {rest % 60}m</td>
                        <td>{vehicle}</td>
                    </tr>
            """
        
        html_content += f"""
                </tbody>
            </table>
            
            <div class="summary">
                <h3 style="margin-top:0; color:#c2410c; font-size:14px;">Zusammenfassung (56 Tage)</h3>
                <div style="display: flex; justify-content: space-between;">
                    <div><strong>Gesamt Lenkzeit:</strong> {total_driving // 60}h {total_driving % 60}min</div>
                    <div><strong>Gesamt Arbeitszeit:</strong> {total_work // 60}h {total_work % 60}min</div>
                    <div><strong>Anzahl Einsatztage:</strong> {len(logs)}</div>
                </div>
            </div>
            
            <div class="footer">
                TruckerMaps - Intelligente Tourenplanung & Compliance | EU VO 561/2006 konform
            </div>
        </body>
        </html>
        """
        
        pdf_content = HTML(string=html_content).write_pdf()
        
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=fahrtenbuch_{datetime.now().strftime('%Y%m%d')}.pdf"
            }
        )
    
    else:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'pdf'")

# ============== Geocoding Proxy ==============

@api_router.get("/geocode")
async def geocode_address(q: str, user: dict = Depends(get_current_user)):
    """Proxy for geocoding to avoid CORS issues"""
    import httpx
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://nominatim.openstreetmap.org/search",
                params={
                    "format": "json",
                    "q": q,
                    "countrycodes": "de,at,ch,fr,it,nl,be,pl,cz",
                    "limit": 5
                },
                headers={"User-Agent": "TruckerMaps/1.0"}
            )
            data = response.json()
            return [
                {
                    "name": r.get("display_name", "").split(",")[:3],
                    "lat": float(r.get("lat", 0)),
                    "lon": float(r.get("lon", 0))
                }
                for r in data
            ]
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        return []

# ============== Route Planning Routes ==============

@api_router.post("/routes/plan", response_model=RouteResponse)
async def plan_route(request: RouteRequest, user: dict = Depends(get_current_user)):
    """Plan a route with break suggestions based on EU regulations"""
    
    # Get vehicle profile
    vehicle = None
    if request.vehicle_profile_id:
        vehicle = await db.vehicle_profiles.find_one(
            {"id": request.vehicle_profile_id, "user_id": user["id"]},
            {"_id": 0}
        )
    else:
        # Get default vehicle
        vehicle = await db.vehicle_profiles.find_one(
            {"user_id": user["id"], "is_default": True},
            {"_id": 0}
        )
    
    # OSRM with NAVIGATION STEPS (Turn-by-Turn)
    try:
        async with httpx.AsyncClient() as client:
            # OSRM with steps for navigation
            osrm_url = f"https://router.project-osrm.org/route/v1/driving/{request.start_lon},{request.start_lat};{request.end_lon},{request.end_lat}?overview=full&geometries=geojson&steps=true&annotations=true"
            
            response = await client.get(osrm_url, timeout=15.0)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("code") == "Ok" and data.get("routes"):
                    route_data = data["routes"][0]
                    geometry = route_data["geometry"]["coordinates"]
                    distance_km = route_data["distance"] / 1000
                    duration_minutes = int(route_data["duration"] / 60)
                    
                    # Extract navigation steps
                    navigation_steps = []
                    for leg in route_data.get("legs", []):
                        for step in leg.get("steps", []):
                            maneuver = step.get("maneuver", {})
                            instruction = step.get("name", "")
                            maneuver_type = maneuver.get("type", "")
                            modifier = maneuver.get("modifier", "")
                            
                            # German instruction
                            instruction_de = translate_navigation(maneuver_type, modifier, instruction)
                            
                            navigation_steps.append(NavigationStep(
                                instruction=f"{maneuver_type} {modifier} on {instruction}".strip(),
                                instruction_de=instruction_de,
                                distance_meters=step.get("distance", 0),
                                duration_seconds=step.get("duration", 0),
                                maneuver_type=maneuver_type,
                                road_name=instruction if instruction else None
                            ))
                    
                    # Calculate break requirements (SICHERHEITSMODUS: 3h 45min)
                    break_calc = calculate_break_requirements(
                        request.current_driving_minutes,
                        request.current_work_minutes,
                        duration_minutes,
                        request.work_start_time
                    )
                    
                    # Find 3 REST STOPS along the route (at 1.5h, 3h, 4.5h)
                    optimal_rest_stop = None
                    break_suggestions = []
                    rest_stop_options = []  # 3 Vorschläge
                    
                    # Get all break options from calculation
                    break_options = break_calc.get("break_options", [])
                    
                    for option in break_options:
                        at_minute = option["at_route_minute"]
                        if at_minute > 0 and at_minute < duration_minutes:
                            break_ratio = at_minute / duration_minutes
                            break_point_index = int(len(geometry) * break_ratio)
                            break_point = geometry[min(break_point_index, len(geometry) - 1)]
                            
                            # Search for rest stop near this break point
                            rest_stop_info = {
                                "type": option["type"],
                                "label": option["label"],
                                "label_en": option["label_en"],
                                "rating": option["rating"],
                                "rating_en": option["rating_en"],
                                "color": option["color"],
                                "at_route_minute": at_minute,
                                "distance_from_start_km": round(distance_km * break_ratio, 1),
                                "location": {"lat": break_point[1], "lon": break_point[0], "name": "Pausenbereich"}
                            }
                            
                            try:
                                parking_response = await client.post(
                                    "https://overpass-api.de/api/interpreter",
                                    data={"data": f"""
                                        [out:json][timeout:8];
                                        (
                                          node["highway"="rest_area"](around:12000,{break_point[1]},{break_point[0]});
                                          node["highway"="services"](around:12000,{break_point[1]},{break_point[0]});
                                          node["amenity"="parking"]["hgv"="yes"](around:12000,{break_point[1]},{break_point[0]});
                                        );
                                        out center;
                                    """},
                                    timeout=10.0
                                )
                                
                                if parking_response.status_code == 200:
                                    parking_data = parking_response.json()
                                    
                                    best_stop = None
                                    best_distance = float('inf')
                                    
                                    for element in parking_data.get("elements", []):
                                        stop_lat = element.get("lat")
                                        stop_lon = element.get("lon")
                                        if stop_lat and stop_lon:
                                            dist = ((stop_lat - break_point[1])**2 + (stop_lon - break_point[0])**2)**0.5
                                            if dist < best_distance:
                                                best_distance = dist
                                                tags = element.get("tags", {})
                                                best_stop = {
                                                    "lat": stop_lat,
                                                    "lon": stop_lon,
                                                    "name": tags.get("name", "Rastplatz"),
                                                    "type": tags.get("highway", tags.get("amenity", "parking")),
                                                    "distance_to_route_km": round(dist * 111, 2)
                                                }
                                    
                                    if best_stop:
                                        rest_stop_info["location"] = {
                                            "lat": best_stop["lat"],
                                            "lon": best_stop["lon"],
                                            "name": best_stop["name"]
                                        }
                                        rest_stop_info["rest_stop_name"] = best_stop["name"]
                                        rest_stop_info["rest_stop_type"] = best_stop["type"]
                                        
                                        # Set first found as optimal
                                        if not optimal_rest_stop:
                                            optimal_rest_stop = best_stop
                            except Exception as e:
                                logging.warning(f"Rest stop search failed for {option['type']}: {e}")
                            
                            rest_stop_options.append(rest_stop_info)
                            
                            # Also create BreakSuggestion for backwards compatibility
                            break_suggestions.append(BreakSuggestion(
                                location=rest_stop_info["location"],
                                break_type="fahrtunterbrechung",
                                duration_minutes=45,
                                reason=f"{option['label']} - {option['rating']}",
                                distance_from_start_km=rest_stop_info["distance_from_start_km"],
                                estimated_arrival=datetime.now(timezone.utc).isoformat(),
                                rest_stop_name=rest_stop_info.get("rest_stop_name")
                            ))
                    
                    return RouteResponse(
                        route_geometry=geometry,
                        distance_km=round(distance_km, 1),
                        duration_minutes=duration_minutes,
                        break_suggestions=break_suggestions,
                        warnings=break_calc["warnings"],
                        rest_stops=[],
                        navigation_steps=navigation_steps,
                        optimal_rest_stop=optimal_rest_stop,
                        rest_stop_options=rest_stop_options
                    )
    except Exception as e:
        logging.warning(f"OSRM failed, trying OpenRouteService: {e}")
    
    # Fallback to OpenRouteService
    ors_profile = "driving-hgv"  # Heavy goods vehicle
    
    ors_headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json"
    }
    
    body = {
        "coordinates": [
            [request.start_lon, request.start_lat],
            [request.end_lon, request.end_lat]
        ],
        "instructions": True,
        "geometry": True
    }
    
    # Add vehicle restrictions if available
    if vehicle:
        body["options"] = {
            "vehicle_type": "hgv",
            "profile_params": {
                "restrictions": {
                    "height": vehicle["height"],
                    "width": vehicle["width"],
                    "length": vehicle["length"],
                    "weight": vehicle["weight"] / 1000,  # Convert to tonnes
                    "axleload": vehicle["axle_load"] / 1000
                }
            }
        }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ORS_BASE_URL}/v2/directions/{ors_profile}/geojson",
                headers=headers,
                json=body,
                timeout=30.0
            )
            
            if response.status_code != 200:
                # Fallback to simple route without restrictions
                body.pop("options", None)
                response = await client.post(
                    f"{ORS_BASE_URL}/v2/directions/{ors_profile}/geojson",
                    headers=headers,
                    json=body,
                    timeout=30.0
                )
            
            data = response.json()
            
            if "features" not in data or len(data["features"]) == 0:
                raise HTTPException(status_code=400, detail="Route konnte nicht berechnet werden. Bitte versuchen Sie es später erneut.")
            
            feature = data["features"][0]
            geometry = feature["geometry"]["coordinates"]
            properties = feature["properties"]
            
            distance_km = properties["summary"]["distance"] / 1000
            duration_minutes = int(properties["summary"]["duration"] / 60)
            
            # Calculate break requirements
            break_calc = calculate_break_requirements(
                request.current_driving_minutes,
                request.current_work_minutes,
                duration_minutes,
                request.work_start_time
            )
            
            # Generate break suggestions
            break_suggestions = []
            if break_calc["break_needed_at_minutes"] and break_calc["break_needed_at_minutes"] < duration_minutes:
                # Calculate position along route for break
                break_ratio = break_calc["break_needed_at_minutes"] / duration_minutes
                break_point_index = int(len(geometry) * break_ratio)
                break_point = geometry[min(break_point_index, len(geometry) - 1)]
                
                break_suggestions.append(BreakSuggestion(
                    location={"lat": break_point[1], "lon": break_point[0], "name": "Empfohlener Pausenort"},
                    break_type=break_calc["break_type"],
                    duration_minutes=break_calc["break_duration"],
                    reason=f"Fahrtunterbrechung nach {break_calc['break_needed_at_minutes']} Min Lenkzeit (EU VO 561/2006)",
                    distance_from_start_km=round(distance_km * break_ratio, 1),
                    estimated_arrival=datetime.now(timezone.utc).isoformat()
                ))
            
            # Search for rest stops along route
            rest_stops = []
            try:
                # Get POIs along route (parking, rest areas)
                poi_body = {
                    "request": "pois",
                    "geometry": {
                        "geojson": {"type": "LineString", "coordinates": geometry},
                        "buffer": 5000  # 5km buffer
                    },
                    "filters": {
                        "category_ids": [596, 597, 598]  # Parking categories
                    },
                    "limit": 20
                }
                
                poi_response = await client.post(
                    f"{ORS_BASE_URL}/pois",
                    headers=headers,
                    json=poi_body,
                    timeout=15.0
                )
                
                if poi_response.status_code == 200:
                    poi_data = poi_response.json()
                    for feature in poi_data.get("features", [])[:10]:
                        coords = feature["geometry"]["coordinates"]
                        props = feature.get("properties", {})
                        rest_stops.append({
                            "lat": coords[1],
                            "lon": coords[0],
                            "name": props.get("osm_tags", {}).get("name", "Rastplatz"),
                            "type": "parking"
                        })
            except Exception:
                pass  # POI search is optional
            
            return RouteResponse(
                route_geometry=geometry,
                distance_km=round(distance_km, 1),
                duration_minutes=duration_minutes,
                break_suggestions=break_suggestions,
                warnings=break_calc["warnings"],
                rest_stops=rest_stops
            )
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Route service error: {str(e)}")

@api_router.post("/routes/calculate-breaks")
async def calculate_breaks(
    current_driving_minutes: int,
    current_work_minutes: int,
    planned_duration_minutes: int,
    user: dict = Depends(get_current_user)
):
    """Calculate break requirements without route planning"""
    return calculate_break_requirements(
        current_driving_minutes,
        current_work_minutes,
        planned_duration_minutes
    )

# ============== AI Assistant Route ==============

@api_router.post("/ai/break-advice")
async def get_ai_break_advice(
    current_driving_minutes: int,
    current_work_minutes: int,
    route_duration_minutes: int,
    user: dict = Depends(get_current_user)
):
    """Get AI-powered break advice based on current driving status"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    llm_key = os.environ.get('EMERGENT_LLM_KEY')
    if not llm_key:
        raise HTTPException(status_code=500, detail="LLM not configured")
    
    language = user.get("language", "de")
    
    system_message = """Du bist ein Experte für EU-Verordnung 561/2006 (Lenk- und Ruhezeiten) und das deutsche Arbeitszeitgesetz für Berufskraftfahrer.
Gib präzise, praktische Ratschläge zu Pausen und Ruhezeiten.
Berücksichtige:
- Max 4,5h Lenkzeit ohne Pause (45 Min Pause, aufteilbar in 15+30 Min)
- Max 9h tägliche Lenkzeit (2x pro Woche auf 10h erweiterbar)
- Max 56h wöchentliche Lenkzeit
- Max 90h in 2 Wochen
- Min 11h tägliche Ruhezeit (3x pro Woche auf 9h reduzierbar)
- Min 45h wöchentliche Ruhezeit (alle 2 Wochen auf 24h reduzierbar)
Antworte kurz und prägnant."""

    if language == "en":
        system_message = """You are an expert on EU Regulation 561/2006 (driving and rest times) and German working time laws for professional drivers.
Give precise, practical advice on breaks and rest periods.
Consider:
- Max 4.5h driving without break (45 min break, can be split 15+30 min)
- Max 9h daily driving (extendable to 10h twice a week)
- Max 56h weekly driving
- Max 90h in 2 weeks
- Min 11h daily rest (reducible to 9h three times a week)
- Min 45h weekly rest (reducible to 24h every 2 weeks)
Answer briefly and precisely."""
    
    prompt = f"""Aktuelle Situation:
- Lenkzeit heute: {current_driving_minutes} Minuten
- Arbeitszeit heute: {current_work_minutes} Minuten
- Geplante Fahrtdauer: {route_duration_minutes} Minuten

Wann und wie lange muss ich eine Pause machen? Gibt es Warnungen?"""
    
    if language == "en":
        prompt = f"""Current situation:
- Driving time today: {current_driving_minutes} minutes
- Working time today: {current_work_minutes} minutes
- Planned trip duration: {route_duration_minutes} minutes

When and how long should I take a break? Any warnings?"""
    
    try:
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"break-advice-{user['id']}",
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {
            "advice": response,
            "calculated": calculate_break_requirements(
                current_driving_minutes,
                current_work_minutes,
                route_duration_minutes
            )
        }
    except Exception as e:
        logging.error(f"AI error: {e}")
        # Fallback to calculated advice only
        return {
            "advice": None,
            "calculated": calculate_break_requirements(
                current_driving_minutes,
                current_work_minutes,
                route_duration_minutes
            )
        }

# ============== Holidays API ==============

@api_router.get("/holidays/{country_code}")
async def get_holidays(country_code: str, year: int = None):
    """Get public holidays for a country (DE, AT, CH, etc.)"""
    if year is None:
        year = datetime.now().year
    
    # German holidays for 2024/2025
    german_holidays = {
        2024: [
            {"date": "2024-01-01", "name": "Neujahr", "name_en": "New Year"},
            {"date": "2024-03-29", "name": "Karfreitag", "name_en": "Good Friday"},
            {"date": "2024-04-01", "name": "Ostermontag", "name_en": "Easter Monday"},
            {"date": "2024-05-01", "name": "Tag der Arbeit", "name_en": "Labour Day"},
            {"date": "2024-05-09", "name": "Christi Himmelfahrt", "name_en": "Ascension Day"},
            {"date": "2024-05-20", "name": "Pfingstmontag", "name_en": "Whit Monday"},
            {"date": "2024-10-03", "name": "Tag der Deutschen Einheit", "name_en": "German Unity Day"},
            {"date": "2024-12-25", "name": "1. Weihnachtstag", "name_en": "Christmas Day"},
            {"date": "2024-12-26", "name": "2. Weihnachtstag", "name_en": "Boxing Day"},
        ],
        2025: [
            {"date": "2025-01-01", "name": "Neujahr", "name_en": "New Year"},
            {"date": "2025-04-18", "name": "Karfreitag", "name_en": "Good Friday"},
            {"date": "2025-04-21", "name": "Ostermontag", "name_en": "Easter Monday"},
            {"date": "2025-05-01", "name": "Tag der Arbeit", "name_en": "Labour Day"},
            {"date": "2025-05-29", "name": "Christi Himmelfahrt", "name_en": "Ascension Day"},
            {"date": "2025-06-09", "name": "Pfingstmontag", "name_en": "Whit Monday"},
            {"date": "2025-10-03", "name": "Tag der Deutschen Einheit", "name_en": "German Unity Day"},
            {"date": "2025-12-25", "name": "1. Weihnachtstag", "name_en": "Christmas Day"},
            {"date": "2025-12-26", "name": "2. Weihnachtstag", "name_en": "Boxing Day"},
        ]
    }
    
    if country_code.upper() == "DE":
        return german_holidays.get(year, [])
    
    return []

# ============== GPS/Location Routes ==============

@api_router.post("/location/update")
async def update_location(location: LocationUpdate, user: dict = Depends(get_current_user)):
    """Update driver's current GPS location"""
    location_doc = {
        "user_id": user["id"],
        "driver_name": user["name"],
        "latitude": location.latitude,
        "longitude": location.longitude,
        "speed": location.speed,
        "heading": location.heading,
        "accuracy": location.accuracy,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert - update if exists, insert if not
    await db.driver_locations.update_one(
        {"user_id": user["id"]},
        {"$set": location_doc},
        upsert=True
    )
    
    return {"status": "updated", "timestamp": location_doc["last_updated"]}

@api_router.get("/location/current")
async def get_current_location(user: dict = Depends(get_current_user)):
    """Get driver's last known location"""
    location = await db.driver_locations.find_one(
        {"user_id": user["id"]},
        {"_id": 0}
    )
    return location or {"error": "No location data"}

# ============== Fleet Manager Routes ==============

@api_router.post("/fleet/create", response_model=Fleet)
async def create_fleet(fleet_data: FleetCreate, user: dict = Depends(get_current_user)):
    """Create a new fleet (manager only)"""
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Only managers can create fleets")
    
    fleet_id = str(uuid.uuid4())
    fleet_doc = {
        "id": fleet_id,
        "name": fleet_data.name,
        "company": fleet_data.company,
        "manager_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.fleets.insert_one(fleet_doc)
    
    # Update manager's fleet_id
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"fleet_id": fleet_id}}
    )
    
    return Fleet(**fleet_doc)

@api_router.post("/fleet/invite")
async def invite_driver(invite: DriverInvite, user: dict = Depends(get_current_user)):
    """Invite a driver to join the fleet"""
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Only managers can invite drivers")
    
    # Check if fleet belongs to manager
    fleet = await db.fleets.find_one({"id": invite.fleet_id, "manager_id": user["id"]})
    if not fleet:
        raise HTTPException(status_code=404, detail="Fleet not found")
    
    # Find driver by email
    driver = await db.users.find_one({"email": invite.email, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Update driver's fleet_id
    await db.users.update_one(
        {"id": driver["id"]},
        {"$set": {"fleet_id": invite.fleet_id}}
    )
    
    return {"status": "invited", "driver_name": driver["name"]}

@api_router.get("/fleet/drivers")
async def get_fleet_drivers(user: dict = Depends(get_current_user)):
    """Get all drivers in the manager's fleet with their current status"""
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Only managers can view fleet")
    
    fleet_id = user.get("fleet_id")
    if not fleet_id:
        return []
    
    # Get all drivers in fleet
    drivers = await db.users.find(
        {"fleet_id": fleet_id, "role": "driver"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    # Enrich with location and driving status
    result = []
    for driver in drivers:
        # Get location
        location = await db.driver_locations.find_one(
            {"user_id": driver["id"]},
            {"_id": 0}
        )
        
        # Get today's driving log
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        log = await db.driving_logs.find_one(
            {"user_id": driver["id"], "date": today},
            {"_id": 0}
        )
        
        driver_info = {
            "id": driver["id"],
            "name": driver["name"],
            "email": driver["email"],
            "location": location,
            "today_driving_minutes": log.get("total_driving_minutes", 0) if log else 0,
            "today_work_minutes": log.get("total_work_minutes", 0) if log else 0,
            "status": "offline"
        }
        
        # Determine status based on location update time
        if location:
            last_update = datetime.fromisoformat(location["last_updated"].replace("Z", "+00:00"))
            minutes_ago = (datetime.now(timezone.utc) - last_update).total_seconds() / 60
            if minutes_ago < 5:
                driver_info["status"] = "online"
                if location.get("speed", 0) > 5:
                    driver_info["status"] = "driving"
        
        result.append(driver_info)
    
    return result

@api_router.get("/fleet/overview")
async def get_fleet_overview(user: dict = Depends(get_current_user)):
    """Get fleet statistics overview"""
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Only managers can view fleet")
    
    fleet_id = user.get("fleet_id")
    if not fleet_id:
        return {"error": "No fleet found"}
    
    # Count drivers
    driver_count = await db.users.count_documents({"fleet_id": fleet_id, "role": "driver"})
    
    # Get today's logs for all fleet drivers
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    drivers = await db.users.find({"fleet_id": fleet_id, "role": "driver"}, {"id": 1}).to_list(100)
    driver_ids = [d["id"] for d in drivers]
    
    logs = await db.driving_logs.find(
        {"user_id": {"$in": driver_ids}, "date": today},
        {"_id": 0}
    ).to_list(100)
    
    total_driving = sum(log.get("total_driving_minutes", 0) for log in logs)
    drivers_driving = len([l for l in logs if l.get("total_driving_minutes", 0) > 0])
    
    # Check for warnings (drivers approaching limits)
    warnings = []
    for log in logs:
        if log.get("total_driving_minutes", 0) > 450:  # > 7.5h
            driver = await db.users.find_one({"id": log["user_id"]}, {"name": 1})
            warnings.append({
                "driver": driver.get("name", "Unknown"),
                "type": "driving_limit",
                "message": f"Lenkzeit bei {log['total_driving_minutes']} Min"
            })
    
    return {
        "total_drivers": driver_count,
        "drivers_active_today": drivers_driving,
        "total_driving_minutes_today": total_driving,
        "warnings": warnings
    }

# ============== Extended Fleet Management ==============

@api_router.get("/fleet/live-map")
async def get_fleet_live_map(user: dict = Depends(get_current_user)):
    """
    Live-Karte mit allen Fahrzeugen der Flotte
    Zeigt Position, Status und Fahrer aller Fahrzeuge
    """
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Nur für Manager")
    
    fleet_id = user.get("fleet_id")
    if not fleet_id:
        return {"vehicles": [], "error": "Keine Flotte zugeordnet"}
    
    # Alle Fahrer der Flotte
    drivers = await db.users.find(
        {"fleet_id": fleet_id, "role": "driver"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    vehicles = []
    for driver in drivers:
        # GPS-Position
        location = await db.driver_locations.find_one(
            {"user_id": driver["id"]},
            {"_id": 0}
        )
        
        # Fahrzeugprofil
        vehicle = await db.vehicles.find_one(
            {"user_id": driver["id"], "is_default": True},
            {"_id": 0}
        )
        if not vehicle:
            vehicle = await db.vehicles.find_one(
                {"user_id": driver["id"]},
                {"_id": 0}
            )
        
        # Heutiges Fahrtenbuch
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        log = await db.driving_logs.find_one(
            {"user_id": driver["id"], "date": today},
            {"_id": 0}
        )
        
        # Status bestimmen
        status = "offline"
        if location:
            last_update = datetime.fromisoformat(location["last_updated"].replace("Z", "+00:00"))
            minutes_ago = (datetime.now(timezone.utc) - last_update).total_seconds() / 60
            if minutes_ago < 5:
                status = "online"
                if location.get("speed", 0) > 5:
                    status = "driving"
                elif location.get("speed", 0) == 0:
                    status = "parked"
        
        vehicles.append({
            "driver_id": driver["id"],
            "driver_name": driver.get("name", "Unbekannt"),
            "driver_email": driver.get("email"),
            "vehicle": {
                "name": vehicle.get("name", "Kein Fahrzeug") if vehicle else "Kein Fahrzeug",
                "type": vehicle.get("vehicle_type", "truck") if vehicle else "truck",
                "plate": vehicle.get("plate", "") if vehicle else ""
            },
            "location": {
                "lat": location.get("lat") if location else None,
                "lon": location.get("lon") if location else None,
                "speed": location.get("speed", 0) if location else 0,
                "heading": location.get("heading", 0) if location else 0,
                "last_update": location.get("last_updated") if location else None
            },
            "status": status,
            "today": {
                "driving_minutes": log.get("total_driving_minutes", 0) if log else 0,
                "work_minutes": log.get("total_work_minutes", 0) if log else 0,
                "remaining_driving": max(0, 540 - (log.get("total_driving_minutes", 0) if log else 0)),
                "breaks": log.get("breaks", []) if log else []
            }
        })
    
    return {
        "vehicles": vehicles,
        "total": len(vehicles),
        "online": len([v for v in vehicles if v["status"] != "offline"]),
        "driving": len([v for v in vehicles if v["status"] == "driving"]),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/fleet/driver-overview")
async def get_fleet_driver_overview(user: dict = Depends(get_current_user)):
    """
    Lenk- und Ruhezeit-Übersicht aller Fahrer
    Mit Compliance-Status und Warnungen
    """
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Nur für Manager")
    
    fleet_id = user.get("fleet_id")
    if not fleet_id:
        return {"drivers": []}
    
    drivers = await db.users.find(
        {"fleet_id": fleet_id, "role": "driver"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week_start = (datetime.now(timezone.utc) - timedelta(days=datetime.now().weekday())).strftime("%Y-%m-%d")
    
    driver_overview = []
    for driver in drivers:
        # Heutiges Log
        today_log = await db.driving_logs.find_one(
            {"user_id": driver["id"], "date": today},
            {"_id": 0}
        )
        
        # Wochenlogs
        week_logs = await db.driving_logs.find(
            {"user_id": driver["id"], "date": {"$gte": week_start}},
            {"_id": 0}
        ).to_list(7)
        
        # Berechnungen
        today_driving = today_log.get("total_driving_minutes", 0) if today_log else 0
        week_driving = sum(log.get("total_driving_minutes", 0) for log in week_logs)
        
        # Compliance-Status
        compliance = "green"
        warnings = []
        
        if today_driving >= 540:  # 9h erreicht
            compliance = "red"
            warnings.append("Tageslenkzeit erreicht!")
        elif today_driving >= 480:  # 8h
            compliance = "yellow"
            warnings.append("Tageslenkzeit fast erreicht")
        
        if week_driving >= 3360:  # 56h
            compliance = "red"
            warnings.append("Wochenlenkzeit erreicht!")
        elif week_driving >= 3000:  # 50h
            if compliance != "red":
                compliance = "yellow"
            warnings.append("Wochenlenkzeit fast erreicht")
        
        # Letzte Pause
        last_break = None
        if today_log and today_log.get("breaks"):
            last_break = today_log["breaks"][-1]
        
        driver_overview.append({
            "id": driver["id"],
            "name": driver.get("name", "Unbekannt"),
            "email": driver.get("email"),
            "compliance": compliance,
            "warnings": warnings,
            "today": {
                "driving_minutes": today_driving,
                "work_minutes": today_log.get("total_work_minutes", 0) if today_log else 0,
                "remaining_driving": max(0, 540 - today_driving),
                "work_start": today_log.get("work_start_time") if today_log else None,
                "driving_start": today_log.get("driving_start_time") if today_log else None
            },
            "week": {
                "driving_minutes": week_driving,
                "remaining_driving": max(0, 3360 - week_driving),
                "days_worked": len([l for l in week_logs if l.get("total_driving_minutes", 0) > 0])
            },
            "last_break": last_break
        })
    
    # Sortieren: Rot > Gelb > Grün
    priority = {"red": 0, "yellow": 1, "green": 2}
    driver_overview.sort(key=lambda x: priority.get(x["compliance"], 3))
    
    return {
        "drivers": driver_overview,
        "summary": {
            "total": len(driver_overview),
            "compliant": len([d for d in driver_overview if d["compliance"] == "green"]),
            "warning": len([d for d in driver_overview if d["compliance"] == "yellow"]),
            "critical": len([d for d in driver_overview if d["compliance"] == "red"])
        }
    }

@api_router.get("/fleet/cost-overview")
async def get_fleet_cost_overview(
    period: str = "week",  # day, week, month
    user: dict = Depends(get_current_user)
):
    """
    Kostenübersicht pro Fahrzeug/Tour
    Maut, Kraftstoff, Gesamtkosten
    """
    if user.get("role") != "manager":
        raise HTTPException(status_code=403, detail="Nur für Manager")
    
    fleet_id = user.get("fleet_id")
    if not fleet_id:
        return {"costs": []}
    
    # Zeitraum bestimmen
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now.strftime("%Y-%m-%d")
    elif period == "week":
        start_date = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    else:  # month
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
    
    drivers = await db.users.find(
        {"fleet_id": fleet_id, "role": "driver"},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    cost_overview = []
    total_toll = 0
    total_fuel = 0
    total_km = 0
    
    for driver in drivers:
        # Fahrzeug für Verbrauch
        vehicle = await db.vehicles.find_one(
            {"user_id": driver["id"], "is_default": True},
            {"_id": 0}
        )
        fuel_consumption = vehicle.get("fuel_consumption", 32) if vehicle else 32
        
        # Fahrten im Zeitraum (aus driving_logs)
        logs = await db.driving_logs.find(
            {"user_id": driver["id"], "date": {"$gte": start_date}},
            {"_id": 0}
        ).to_list(31)
        
        # Schätzung basierend auf Fahrzeit (80 km/h Durchschnitt)
        driving_minutes = sum(log.get("total_driving_minutes", 0) for log in logs)
        estimated_km = (driving_minutes / 60) * 75  # ~75 km/h Durchschnitt
        
        # Kosten berechnen
        fuel_liters = (estimated_km / 100) * fuel_consumption
        fuel_cost = fuel_liters * 1.85  # €/L
        toll_cost = estimated_km * 0.19  # DE Maut ~0.19 €/km
        
        total_toll += toll_cost
        total_fuel += fuel_cost
        total_km += estimated_km
        
        cost_overview.append({
            "driver_id": driver["id"],
            "driver_name": driver.get("name", "Unbekannt"),
            "vehicle": vehicle.get("name", "Unbekannt") if vehicle else "Unbekannt",
            "period": period,
            "kilometers": round(estimated_km, 1),
            "driving_hours": round(driving_minutes / 60, 1),
            "costs": {
                "fuel": round(fuel_cost, 2),
                "toll": round(toll_cost, 2),
                "total": round(fuel_cost + toll_cost, 2)
            },
            "efficiency": {
                "fuel_consumption": fuel_consumption,
                "cost_per_km": round((fuel_cost + toll_cost) / max(estimated_km, 1), 3)
            }
        })
    
    # Sortieren nach Gesamtkosten
    cost_overview.sort(key=lambda x: x["costs"]["total"], reverse=True)
    
    return {
        "period": period,
        "start_date": start_date,
        "drivers": cost_overview,
        "totals": {
            "kilometers": round(total_km, 1),
            "fuel_cost": round(total_fuel, 2),
            "toll_cost": round(total_toll, 2),
            "total_cost": round(total_fuel + total_toll, 2)
        },
        "currency": "EUR"
    }

# ============== Truck Parking/Rest Stops Routes ==============

@api_router.get("/parking/nearby")
async def get_nearby_parking(lat: float, lon: float, radius: int = 10000, user: dict = Depends(get_current_user)):
    """Get nearby truck parking using Overpass API (OpenStreetMap)"""
    
    # Overpass API query for truck parking and rest areas
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    # Query for: amenity=parking + hgv=yes, highway=rest_area, highway=services
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="parking"]["hgv"="yes"](around:{radius},{lat},{lon});
      node["amenity"="parking"]["access"="hgv"](around:{radius},{lat},{lon});
      node["highway"="rest_area"](around:{radius},{lat},{lon});
      node["highway"="services"](around:{radius},{lat},{lon});
      way["amenity"="parking"]["hgv"="yes"](around:{radius},{lat},{lon});
      way["highway"="rest_area"](around:{radius},{lat},{lon});
      way["highway"="services"](around:{radius},{lat},{lon});
    );
    out center;
    """
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                overpass_url,
                data={"data": query},
                timeout=30.0
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            
            parking_spots = []
            for element in data.get("elements", []):
                # Get coordinates
                if element["type"] == "node":
                    spot_lat = element["lat"]
                    spot_lon = element["lon"]
                elif element["type"] == "way" and "center" in element:
                    spot_lat = element["center"]["lat"]
                    spot_lon = element["center"]["lon"]
                else:
                    continue
                
                tags = element.get("tags", {})
                
                parking_spots.append({
                    "id": element["id"],
                    "lat": spot_lat,
                    "lon": spot_lon,
                    "name": tags.get("name", "LKW-Parkplatz"),
                    "type": tags.get("highway", tags.get("amenity", "parking")),
                    "capacity": tags.get("capacity", None),
                    "fee": tags.get("fee", None),
                    "lit": tags.get("lit", None),
                    "surface": tags.get("surface", None)
                })
            
            return parking_spots[:50]  # Limit to 50 results
            
    except Exception as e:
        logging.error(f"Overpass API error: {e}")
        return []

@api_router.get("/parking/along-route")
async def get_parking_along_route(
    start_lat: float, 
    start_lon: float, 
    end_lat: float, 
    end_lon: float,
    user: dict = Depends(get_current_user)
):
    """Get truck parking along a route corridor"""
    # Calculate bounding box with buffer
    min_lat = min(start_lat, end_lat) - 0.2
    max_lat = max(start_lat, end_lat) + 0.2
    min_lon = min(start_lon, end_lon) - 0.2
    max_lon = max(start_lon, end_lon) + 0.2
    
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="parking"]["hgv"="yes"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["highway"="rest_area"]({min_lat},{min_lon},{max_lat},{max_lon});
      node["highway"="services"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["amenity"="parking"]["hgv"="yes"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["highway"="rest_area"]({min_lat},{min_lon},{max_lat},{max_lon});
      way["highway"="services"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out center;
    """
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                overpass_url,
                data={"data": query},
                timeout=30.0
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            
            parking_spots = []
            for element in data.get("elements", []):
                if element["type"] == "node":
                    spot_lat = element["lat"]
                    spot_lon = element["lon"]
                elif element["type"] == "way" and "center" in element:
                    spot_lat = element["center"]["lat"]
                    spot_lon = element["center"]["lon"]
                else:
                    continue
                
                tags = element.get("tags", {})
                
                parking_spots.append({
                    "id": element["id"],
                    "lat": spot_lat,
                    "lon": spot_lon,
                    "name": tags.get("name", "LKW-Parkplatz"),
                    "type": tags.get("highway", tags.get("amenity", "parking")),
                    "capacity": tags.get("capacity"),
                    "fee": tags.get("fee")
                })
            
            return parking_spots[:100]
            
    except Exception as e:
        logging.error(f"Overpass API error: {e}")
        return []

# ============== Notification Settings Routes ==============

@api_router.get("/notifications/settings")
async def get_notification_settings(user: dict = Depends(get_current_user)):
    """Get user's notification settings"""
    return user.get("notification_settings", {
        "break_reminder": True,
        "break_reminder_minutes": 30,
        "weekly_limit_warning": True,
        "weekly_limit_percent": 80
    })

@api_router.put("/notifications/settings")
async def update_notification_settings(
    settings: NotificationSettings,
    user: dict = Depends(get_current_user)
):
    """Update user's notification settings"""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"notification_settings": settings.model_dump()}}
    )
    return {"status": "updated", "settings": settings.model_dump()}

@api_router.get("/notifications/check")
async def check_notifications(user: dict = Depends(get_current_user)):
    """Check if any notifications should be triggered"""
    settings = user.get("notification_settings", {})
    notifications = []
    
    # Get today's log
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log = await db.driving_logs.find_one(
        {"user_id": user["id"], "date": today},
        {"_id": 0}
    )
    
    current_driving = log.get("total_driving_minutes", 0) if log else 0
    
    # Break reminder check
    if settings.get("break_reminder", True):
        minutes_until_break = 270 - (current_driving % 270)
        reminder_threshold = settings.get("break_reminder_minutes", 30)
        
        if minutes_until_break <= reminder_threshold and minutes_until_break > 0:
            notifications.append({
                "type": "break_reminder",
                "priority": "high",
                "title": "Pausenerinnerung",
                "title_en": "Break Reminder",
                "message": f"Fahrtunterbrechung in {minutes_until_break} Minuten erforderlich",
                "message_en": f"Driving break required in {minutes_until_break} minutes"
            })
    
    # Weekly limit warning
    if settings.get("weekly_limit_warning", True):
        # Get week's driving
        week_start = datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday())
        week_logs = await db.driving_logs.find({
            "user_id": user["id"],
            "date": {"$gte": week_start.strftime("%Y-%m-%d")}
        }, {"_id": 0}).to_list(10)
        
        week_driving = sum(l.get("total_driving_minutes", 0) for l in week_logs)
        limit_percent = settings.get("weekly_limit_percent", 80)
        
        if week_driving >= (3360 * limit_percent / 100):  # 56h = 3360min
            notifications.append({
                "type": "weekly_limit",
                "priority": "medium",
                "title": "Wochenlimit-Warnung",
                "title_en": "Weekly Limit Warning",
                "message": f"Wöchentliche Lenkzeit bei {week_driving} von 3360 Minuten",
                "message_en": f"Weekly driving at {week_driving} of 3360 minutes"
            })
    
    return {"notifications": notifications}

# ============== Tachograph Routes (Universelle API) ==============

from tachograph.service import get_tachograph_service, TachographService
from tachograph.models import (
    TachographData, TachographType, DriverActivity, ConnectionStatus,
    ComplianceStatus, DrivingPermission,
    LEGAL_DISCLAIMER_DE, LEGAL_DISCLAIMER_LONG_DE, 
    ARTICLE_12_EXCEPTION_DE, DRIVER_RESPONSIBILITY_DE
)

class TachographConnectRequest(BaseModel):
    tachograph_type: str = "manual"  # manual, simulation, vdo_dtco_4.1, etc.
    device_id: Optional[str] = None

class ActivityChangeRequest(BaseModel):
    activity: str  # driving, working, available, rest
    driver: int = 1

class ManualTimeRequest(BaseModel):
    minutes_today: int = 0
    minutes_since_break: int = 0
    minutes_week: int = 0

@api_router.post("/tachograph/connect")
async def tachograph_connect(
    request: TachographConnectRequest,
    user: dict = Depends(get_current_user)
):
    """Mit Tachograph verbinden (Universal API)"""
    service = get_tachograph_service()
    
    # Typ-Mapping
    type_map = {
        "manual": TachographType.MANUAL,
        "simulation": TachographType.SIMULATION,
        "vdo_dtco_4.0": TachographType.VDO_DTCO_4_0,
        "vdo_dtco_4.1": TachographType.VDO_DTCO_4_1,
        "vdo_dtco_4.1a": TachographType.VDO_DTCO_4_1A,
    }
    
    tacho_type = type_map.get(request.tachograph_type.lower(), TachographType.MANUAL)
    success = await service.connect(tacho_type, request.device_id)
    
    return {
        "connected": success,
        "tachograph_type": service.tachograph_type.value,
        "status": service.connection_status.value
    }

@api_router.post("/tachograph/disconnect")
async def tachograph_disconnect(user: dict = Depends(get_current_user)):
    """Tachograph-Verbindung trennen"""
    service = get_tachograph_service()
    await service.disconnect()
    return {"disconnected": True}

@api_router.get("/tachograph/data")
async def get_tachograph_data(user: dict = Depends(get_current_user)):
    """Aktuelle Tachograph-Daten abrufen"""
    service = get_tachograph_service()
    
    if not service.is_connected:
        # Auto-Connect im manuellen Modus
        await service.connect(TachographType.MANUAL)
    
    data = await service.get_current_data()
    return data.model_dump()

@api_router.get("/tachograph/compliance")
async def get_compliance_status(
    avg_speed: float = 80.0,
    user: dict = Depends(get_current_user)
):
    """
    Compliance-Status abrufen (EU 561/2006)
    
    Gibt Warnungen, Empfehlungen und Restzeiten zurück
    """
    service = get_tachograph_service()
    
    if not service.is_connected:
        await service.connect(TachographType.MANUAL)
        
    await service.get_current_data()  # Refresh
    status = service.get_compliance_status(avg_speed)
    
    return status.model_dump()

@api_router.get("/tachograph/may-drive")
async def may_driver_drive(
    avg_speed: float = 80.0,
    user: dict = Depends(get_current_user)
):
    """
    Einfache Ja/Nein Abfrage: Darf der Fahrer noch fahren?
    
    Ideal für schnelle UI-Updates
    """
    service = get_tachograph_service()
    
    if not service.is_connected:
        await service.connect(TachographType.MANUAL)
        
    await service.get_current_data()
    permission = service.may_drive(avg_speed)
    
    return permission.model_dump()

@api_router.get("/tachograph/driving-mode")
async def get_driving_mode_display(user: dict = Depends(get_current_user)):
    """
    Minimale Anzeige für Fahrmodus (nur 3 Infos!)
    
    Optimiert für Nicht-Ablenkung während der Fahrt
    """
    service = get_tachograph_service()
    
    if not service.is_connected:
        await service.connect(TachographType.MANUAL)
        
    await service.get_current_data()
    return service.get_driving_mode_display()

@api_router.post("/tachograph/activity")
async def set_driver_activity(
    request: ActivityChangeRequest,
    user: dict = Depends(get_current_user)
):
    """
    Fahrer-Aktivität setzen (nur im manuellen Modus)
    
    Aktivitäten: driving, working, available, rest
    """
    service = get_tachograph_service()
    
    activity_map = {
        "driving": DriverActivity.DRIVING,
        "working": DriverActivity.WORKING,
        "available": DriverActivity.AVAILABLE,
        "rest": DriverActivity.REST
    }
    
    activity = activity_map.get(request.activity.lower(), DriverActivity.REST)
    success = await service.set_activity(activity, request.driver)
    
    # Daten aktualisieren
    data = await service.get_current_data()
    
    return {
        "success": success,
        "current_activity": data.driver_1_activity.value,
        "driving_since_break_minutes": data.driving_time_since_break_minutes
    }

@api_router.post("/tachograph/manual-time")
async def set_manual_driving_time(
    request: ManualTimeRequest,
    user: dict = Depends(get_current_user)
):
    """Lenkzeit manuell setzen (z.B. aus Fahrerkarte übertragen)"""
    service = get_tachograph_service()
    
    success = await service.set_driving_time_manual(
        request.minutes_today,
        request.minutes_since_break,
        request.minutes_week
    )
    
    data = await service.get_current_data()
    
    return {
        "success": success,
        "driving_today": data.driving_time_today_minutes,
        "driving_since_break": data.driving_time_since_break_minutes
    }

@api_router.get("/tachograph/legal-texts")
async def get_legal_texts(language: str = "de"):
    """
    Haftungsausschluss und rechtliche Hinweise
    
    Wichtig für Compliance und App-Zulassung!
    """
    if language == "de":
        return {
            "disclaimer_short": LEGAL_DISCLAIMER_DE,
            "disclaimer_long": LEGAL_DISCLAIMER_LONG_DE,
            "article_12": ARTICLE_12_EXCEPTION_DE,
            "driver_responsibility": DRIVER_RESPONSIBILITY_DE
        }
    else:
        # Englisch (TODO: Übersetzung)
        return {
            "disclaimer_short": "Notice: This application is an assistance system. The displays of the digital control device and applicable regulations remain authoritative.",
            "disclaimer_long": "The provided information serves only to support the driver in planning. No guarantee for accuracy.",
            "article_12": "In exceptional circumstances, deviation from driving/rest times may be permitted to reach a safe stopping place.",
            "driver_responsibility": "The driver remains responsible for compliance with regulations at all times."
        }

@api_router.get("/tachograph/available-types")
async def get_available_tachograph_types():
    """Liste aller unterstützten Tachograph-Typen"""
    return {
        "types": [
            {"id": "manual", "name": "Manuelle Eingabe", "available": True},
            {"id": "simulation", "name": "Simulation (Demo)", "available": True},
            {"id": "vdo_dtco_4.0", "name": "VDO DTCO 4.0", "available": False, "note": "Bluetooth SDK erforderlich"},
            {"id": "vdo_dtco_4.1", "name": "VDO DTCO 4.1", "available": False, "note": "Bluetooth SDK erforderlich"},
            {"id": "vdo_dtco_4.1a", "name": "VDO DTCO 4.1a", "available": False, "note": "Bluetooth SDK erforderlich"},
            {"id": "stoneridge_se5000", "name": "Stoneridge SE5000", "available": False, "note": "Bluetooth SDK erforderlich"},
        ]
    }

# ============== Simulation Routes ==============

@api_router.post("/tachograph/simulation/start")
async def start_simulation(
    scenario: str = "fresh",
    speed: float = 60.0,
    user: dict = Depends(get_current_user)
):
    """
    Simulation starten (für Demo/Test)
    
    Scenarios:
    - fresh: Neuer Tag, keine Lenkzeit
    - mid_day: Mitte des Tages, 4h gefahren
    - near_break: Kurz vor Pflichtpause
    - overtime: Überstunden (zum Testen)
    """
    service = get_tachograph_service()
    
    # Auf Simulation umschalten
    await service.connect(TachographType.SIMULATION)
    await service.start_simulation(scenario, speed)
    
    return {
        "simulation_started": True,
        "scenario": scenario,
        "speed": speed
    }

@api_router.post("/tachograph/simulation/stop")
async def stop_simulation(user: dict = Depends(get_current_user)):
    """Simulation stoppen"""
    service = get_tachograph_service()
    await service.stop_simulation()
    return {"simulation_stopped": True}

@api_router.get("/tachograph/simulation/state")
async def get_simulation_state(user: dict = Depends(get_current_user)):
    """
    Aktuellen Simulationsstatus abrufen
    
    Enthält:
    - Laufstatus und Geschwindigkeit
    - Aktuelle Lenkzeiten
    - Pausenfortschritt
    - Zwangspause-Status
    """
    service = get_tachograph_service()
    
    if hasattr(service._adapter, 'get_simulation_state'):
        state = service._adapter.get_simulation_state()
        return {
            "is_simulation": True,
            **state
        }
    
    return {
        "is_simulation": False,
        "message": "Kein Simulationsmodus aktiv"
    }

@api_router.post("/tachograph/simulation/scenario/{scenario}")
async def load_scenario(
    scenario: str,
    user: dict = Depends(get_current_user)
):
    """
    Szenario laden
    
    Scenarios:
    - fresh: Neuer Tag (0h Lenkzeit)
    - mid_day: 2h gefahren
    - near_break: 4h 15min (kurz vor Pflichtpause!)
    - overtime: Zwangspause aktiv
    - after_break: Nach 45min Pause
    """
    service = get_tachograph_service()
    
    if hasattr(service._adapter, 'set_scenario'):
        success = await service._adapter.set_scenario(scenario)
        if success:
            data = await service.get_current_data()
            return {
                "scenario_loaded": scenario,
                "driving_since_break": data.driving_time_since_break_minutes,
                "driving_today": data.driving_time_today_minutes,
                "activity": data.driver_1_activity.value
            }
    
    return {"error": f"Szenario '{scenario}' nicht gefunden"}

@api_router.post("/tachograph/simulation/speed/{speed}")
async def set_simulation_speed(
    speed: float,
    user: dict = Depends(get_current_user)
):
    """
    Simulationsgeschwindigkeit ändern
    
    Speed:
    - 1 = Echtzeit
    - 60 = 1 Minute pro Sekunde (Standard)
    - 120 = 2 Minuten pro Sekunde
    - 300 = 5 Minuten pro Sekunde (Max)
    """
    service = get_tachograph_service()
    
    if hasattr(service._adapter, 'set_simulation_speed'):
        service._adapter.set_simulation_speed(speed)
        return {
            "speed_set": speed,
            "description": f"{speed}x Echtzeit"
        }
    
    return {"error": "Simulation nicht aktiv"}

@api_router.post("/tachograph/simulation/reset")
async def reset_simulation(user: dict = Depends(get_current_user)):
    """Simulation komplett zurücksetzen"""
    service = get_tachograph_service()
    
    if hasattr(service._adapter, 'reset_simulation'):
        await service._adapter.reset_simulation()
        return {"reset": True}
    
    return {"error": "Simulation nicht aktiv"}

# ============== TomTom Truck Routing (PRIMARY) ==============

class TruckRouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    vehicle_height: float = 4.0
    vehicle_width: float = 2.55
    vehicle_length: float = 16.5
    vehicle_weight: int = 40000
    vehicle_axles: int = 5
    hazmat_classes: List[str] = []
    include_toll: bool = True
    include_speed_cameras: bool = True
    avoid_toll: bool = False
    avoid_motorways: bool = False
    route_type: str = "fastest"  # fastest, shortest, eco

# Keep old endpoint name for backwards compatibility
class HERERouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    vehicle_height: float = 4.0
    vehicle_width: float = 2.55
    vehicle_length: float = 16.5
    vehicle_weight: int = 40000
    vehicle_axles: int = 5
    hazmat_classes: List[str] = []
    include_toll: bool = True
    include_speed_cameras: bool = True

# Professional Route Request with Waypoints and Alternatives
class ProfessionalRouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    waypoints: List[List[float]] = []  # [[lat, lon], ...]
    vehicle_height: float = 4.0
    vehicle_width: float = 2.55
    vehicle_length: float = 16.5
    vehicle_weight: int = 40000
    vehicle_axles: int = 5
    hazmat_classes: List[str] = []
    include_toll: bool = True
    include_speed_cameras: bool = True
    alternatives: int = 2  # Number of alternative routes to return
    eco_routing: bool = False  # Kraftstoffsparende Route berechnen
    fuel_consumption_l_per_100km: float = 32.0  # Durchschnittsverbrauch

# Traffic Check Request
class TrafficCheckRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    waypoints: List[List[float]] = []
    current_route_duration: int  # Current route duration in minutes

@api_router.post("/route/here")
async def calculate_truck_route(
    request: HERERouteRequest,
    user: dict = Depends(get_current_user)
):
    """
    Berechnet LKW-Route mit TomTom Truck Routing API (ersetzt HERE)
    
    Inklusive:
    - Fahrzeugspezifische Restriktionen (Höhe, Gewicht, Länge, Achsen)
    - Mautkosten-Berechnung
    - Blitzer-Warnungen entlang der Route
    """
    tomtom_service = get_tomtom_service()
    toll_service = get_toll_service()
    camera_service = get_speed_camera_service()
    
    # TomTom Truck-Profil erstellen
    truck_profile = TruckProfile(
        height_m=request.vehicle_height,
        width_m=request.vehicle_width,
        length_m=request.vehicle_length,
        weight_kg=request.vehicle_weight,
        axle_count=request.vehicle_axles,
        axle_weight_kg=int(request.vehicle_weight / request.vehicle_axles)
    )
    
    # Route berechnen mit TomTom
    route = await tomtom_service.calculate_truck_route(
        start_lat=request.start_lat,
        start_lon=request.start_lon,
        end_lat=request.end_lat,
        end_lon=request.end_lon,
        truck_profile=truck_profile,
        traffic=True,
        alternatives=2
    )
    
    if "error" in route:
        # Log error but continue - TomTom should handle most cases
        logger.warning(f"TomTom Fehler: {route['error']}")
        return {"error": route['error'], "message": "Route calculation failed"}
    
    # Mautkosten berechnen
    toll_info = None
    if request.include_toll and route.get('geometry'):
        toll_info = await toll_service.calculate_toll_cost(
            route_geometry=route['geometry'],
            vehicle_params={
                'gross_weight': request.vehicle_weight,
                'axles': request.vehicle_axles,
                'height': request.vehicle_height,
                'length': request.vehicle_length
            }
        )
    
    # Blitzer finden - DEAKTIVIERT (Code bleibt erhalten für spätere Nutzung)
    # Um zu aktivieren: SPEED_CAMERAS_ENABLED = True setzen
    SPEED_CAMERAS_ENABLED = False
    speed_cameras = []
    if SPEED_CAMERAS_ENABLED and request.include_speed_cameras and route.get('geometry'):
        speed_cameras = await camera_service.get_speed_cameras_along_route(
            route_geometry=route['geometry'],
            buffer_meters=500
        )
    
    return {
        "route": {
            "source": route.get('source', 'tomtom'),
            "geometry": route.get('geometry', []),
            "distance_km": route.get('distance_km', 0),
            "duration_minutes": route.get('duration_minutes', 0),
            "truck_compliant": route.get('truck_compliant', True),
            "traffic_delay_minutes": route.get('traffic_delay_minutes', 0),
            "departure_time": route.get('departure_time'),
            "arrival_time": route.get('arrival_time'),
            "alternatives": route.get('alternatives', []),
            "warnings": route.get('warnings', []),
            "instructions": route.get('instructions', [])
        },
        "toll": toll_info,
        "speed_cameras": speed_cameras,
        "legal_notice": {
            "speed_cameras": "⚠️ Nur visuelle Warnung - DE: Aktive Nutzung während Fahrt verboten!",
            "toll": "⚠️ Mautkosten sind Schätzungen - tatsächliche Kosten können abweichen"
        }
    }

@api_router.post("/route/professional")
async def calculate_professional_route(
    request: ProfessionalRouteRequest,
    user: dict = Depends(get_current_user)
):
    """
    Professionelle LKW-Routenberechnung mit:
    - Mehreren Routenvorschlägen (wie Google Maps)
    - Zwischenzielen (Waypoints)
    - Fahrzeugspezifischen Restriktionen
    - Mautkosten und Blitzer-Warnungen
    - Eco-Routing (kraftstoffsparende Route)
    """
    tomtom_service = get_tomtom_service()
    toll_service = get_toll_service()
    camera_service = get_speed_camera_service()
    
    # TomTom Truck-Profil erstellen
    truck_profile = TruckProfile(
        height_m=request.vehicle_height,
        width_m=request.vehicle_width,
        length_m=request.vehicle_length,
        weight_kg=request.vehicle_weight,
        axle_count=request.vehicle_axles,
        axle_weight_kg=int(request.vehicle_weight / request.vehicle_axles)
    )
    
    # Waypoints für TomTom konvertieren (lat, lon -> tuple)
    waypoints = [(wp[0], wp[1]) for wp in request.waypoints] if request.waypoints else None
    
    # Route-Typ: eco für Kraftstoffsparen, sonst fastest
    route_type = "eco" if request.eco_routing else "fastest"
    
    # Route berechnen mit TomTom inkl. Alternativen
    route = await tomtom_service.calculate_truck_route(
        start_lat=request.start_lat,
        start_lon=request.start_lon,
        end_lat=request.end_lat,
        end_lon=request.end_lon,
        truck_profile=truck_profile,
        waypoints=waypoints,
        route_type=route_type,
        traffic=True,
        alternatives=request.alternatives
    )
    
    if "error" in route:
        logger.warning(f"TomTom Fehler: {route['error']}")
        raise HTTPException(status_code=500, detail=f"Routenberechnung fehlgeschlagen: {route['error']}")
    
    # OPTIMIERUNG: Mautkosten und andere Berechnungen PARALLEL ausführen
    import asyncio
    
    async def calc_toll():
        if request.include_toll and route.get('geometry'):
            return await toll_service.calculate_toll_cost(
                route_geometry=route['geometry'],
                vehicle_params={
                    'gross_weight': request.vehicle_weight,
                    'axles': request.vehicle_axles,
                    'height': request.vehicle_height,
                    'length': request.vehicle_length
                }
            )
        return None
    
    # Blitzer sind deaktiviert - kein API-Call
    speed_cameras = []
    
    # Alternative Routen vorbereiten (TomTom liefert sie bereits mit)
    alternatives = []
    raw_alternatives = route.get('alternatives', [])
    
    # TomTom-Alternativen direkt verwenden (OHNE extra API-Call für eco-Route)
    for alt in raw_alternatives:
        if alt.get('geometry') or (alt.get('distance_km') and alt.get('duration_minutes')):
            alternatives.append({
                "distance_km": alt.get('distance_km', 0),
                "duration_minutes": alt.get('duration_minutes', 0),
                "traffic_delay_minutes": alt.get('traffic_delay_minutes', 0),
                "geometry": alt.get('geometry', []),
                "instructions": alt.get('instructions', []),
                "source": "tomtom_alt",
                "toll_cost": 0
            })
    
    # Mautberechnung (einziger zusätzlicher API-Call)
    toll_info = await calc_toll()
    
    # Berechne Lenk- und Ruhezeiten + Rastplatz-Empfehlungen
    duration_minutes = route.get('duration_minutes', 0)
    geometry = route.get('geometry', [])
    
    break_calc = calculate_break_requirements(
        current_driving_minutes=0,  # Annahme: Fahrt beginnt frisch
        current_work_minutes=0,
        route_duration_minutes=duration_minutes
    )
    
    # 3 Rastplatz-Empfehlungen entlang der Route berechnen - MIT echten Rastplätzen
    rest_stop_suggestions = []
    distance_km = route.get('distance_km', 0)
    
    async def find_real_rest_stop(lat: float, lon: float, search_radius_km: float = 15) -> dict:
        """Sucht einen echten LKW-Rastplatz in der Nähe via TomTom POI Search"""
        try:
            tomtom_key = os.environ.get('TOMTOM_API_KEY', 'HdPMKF3SXKMZtPAoYoCAS1DToCYUmenX')
            # TomTom POI Search für Rastplätze, Autohöfe, Tankstellen
            categories = "7311,7321,7313,7315"  # Rest areas, parking, gas stations, truck stops
            url = f"https://api.tomtom.com/search/2/nearbySearch/.json?key={tomtom_key}&lat={lat}&lon={lon}&radius={int(search_radius_km * 1000)}&categorySet={categories}&limit=5"
            
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    
                    # Bevorzuge LKW-Parkplätze und Autohöfe
                    for poi in results:
                        name = poi.get("poi", {}).get("name", "Rastplatz")
                        pos = poi.get("position", {})
                        address = poi.get("address", {})
                        
                        # Prüfe ob LKW-tauglich (größere Parkplätze, Autohöfe)
                        categories = poi.get("poi", {}).get("categorySet", [])
                        is_truck_friendly = any(c.get("id") in [7311, 7321] for c in categories)
                        
                        return {
                            "name": name,
                            "lat": pos.get("lat", lat),
                            "lon": pos.get("lon", lon),
                            "address": address.get("freeformAddress", ""),
                            "is_truck_friendly": is_truck_friendly,
                            "found": True
                        }
        except Exception as e:
            print(f"Rest stop search error: {e}")
        
        return {"found": False}
    
    for option in break_calc.get("break_options", []):
        at_minute = option["at_route_minute"]
        if at_minute > 0 and at_minute < duration_minutes and len(geometry) > 0:
            break_ratio = at_minute / duration_minutes
            break_point_index = int(len(geometry) * break_ratio)
            break_point = geometry[min(break_point_index, len(geometry) - 1)]
            
            # Koordinaten des Punktes auf der Route
            route_lat = break_point[1] if isinstance(break_point, list) and len(break_point) >= 2 else break_point.get("lat", 0)
            route_lon = break_point[0] if isinstance(break_point, list) and len(break_point) >= 2 else break_point.get("lon", 0)
            
            # Suche echten Rastplatz in der Nähe
            real_stop = await find_real_rest_stop(route_lat, route_lon)
            
            suggestion = {
                "type": option["type"],
                "label": option["label"],
                "rating": option["rating"],
                "color": option["color"],
                "at_route_minute": at_minute,
                "distance_from_start_km": round(distance_km * break_ratio, 1),
                "location": {
                    "lat": real_stop.get("lat", route_lat) if real_stop.get("found") else route_lat,
                    "lon": real_stop.get("lon", route_lon) if real_stop.get("found") else route_lon
                }
            }
            
            # Wenn echter Rastplatz gefunden, füge Details hinzu
            if real_stop.get("found"):
                suggestion["rest_stop_name"] = real_stop.get("name", "Rastplatz")
                suggestion["rest_stop_address"] = real_stop.get("address", "")
                suggestion["is_truck_friendly"] = real_stop.get("is_truck_friendly", False)
            
            rest_stop_suggestions.append(suggestion)
    
    return {
        "route": {
            "source": route.get('source', 'tomtom'),
            "geometry": route.get('geometry', []),
            "distance_km": route.get('distance_km', 0),
            "duration_minutes": route.get('duration_minutes', 0),
            "truck_compliant": route.get('truck_compliant', True),
            "traffic_delay_minutes": route.get('traffic_delay_minutes', 0),
            "departure_time": route.get('departure_time'),
            "arrival_time": route.get('arrival_time'),
            "warnings": route.get('warnings', []) + break_calc.get('warnings', []),
            "instructions": route.get('instructions', [])
        },
        "alternatives": alternatives,
        "toll": toll_info,
        "speed_cameras": speed_cameras,
        "waypoints_used": len(request.waypoints) if request.waypoints else 0,
        "compliance": {
            "remaining_driving_before_break": break_calc.get("remaining_driving_before_break"),
            "remaining_daily_driving": break_calc.get("remaining_daily_driving"),
            "remaining_after_route": break_calc.get("remaining_after_route"),
            "can_extend_today": break_calc.get("can_extend_today"),
            "max_daily_normal": break_calc.get("max_daily_normal"),
            "max_daily_extended": break_calc.get("max_daily_extended")
        },
        "rest_stop_suggestions": rest_stop_suggestions,
        "legal_notice": {
            "speed_cameras": "⚠️ Nur visuelle Warnung - DE: Aktive Nutzung während Fahrt verboten!",
            "toll": "⚠️ Mautkosten sind Schätzungen",
            "compliance": "EU-Verordnung 561/2006 - Lenk- und Ruhezeiten"
        }
    }

@api_router.post("/route/traffic-check")
async def check_traffic_updates(
    request: TrafficCheckRequest,
    user: dict = Depends(get_current_user)
):
    """
    Prüft auf Verkehrsstörungen und schlägt alternative Route vor.
    Wird während der Navigation kontinuierlich aufgerufen.
    """
    tomtom_service = get_tomtom_service()
    
    # Waypoints konvertieren
    waypoints = [(wp[0], wp[1]) for wp in request.waypoints] if request.waypoints else None
    
    # Aktuelle Route mit Echtzeit-Verkehr berechnen
    current_route = await tomtom_service.calculate_truck_route(
        start_lat=request.start_lat,
        start_lon=request.start_lon,
        end_lat=request.end_lat,
        end_lon=request.end_lon,
        waypoints=waypoints,
        traffic=True,
        alternatives=1
    )
    
    if "error" in current_route:
        return {
            "has_better_route": False,
            "error": current_route['error']
        }
    
    new_duration = current_route.get('duration_minutes', 0)
    traffic_delay = current_route.get('traffic_delay_minutes', 0)
    
    # Prüfe ob signifikante Verzögerung vorliegt (> 10 Minuten)
    time_difference = new_duration - request.current_route_duration
    
    if time_difference > 10 or traffic_delay > 15:
        # Versuche alternative Route ohne Stau
        alt_routes = current_route.get('alternatives', [])
        
        if alt_routes:
            best_alt = min(alt_routes, key=lambda x: x.get('duration_minutes', float('inf')))
            if best_alt.get('duration_minutes', float('inf')) < new_duration - 5:
                return {
                    "has_better_route": True,
                    "time_saved_minutes": round(new_duration - best_alt['duration_minutes']),
                    "new_duration_minutes": round(best_alt['duration_minutes']),
                    "current_traffic_delay": round(traffic_delay),
                    "alternative_route": {
                        "geometry": best_alt.get('geometry', current_route.get('geometry', [])),
                        "distance_km": best_alt.get('distance_km', 0),
                        "duration_minutes": best_alt.get('duration_minutes', 0),
                        "traffic_delay_minutes": best_alt.get('traffic_delay_minutes', 0)
                    }
                }
        
        # Keine bessere Alternative, aber Stau-Info
        return {
            "has_better_route": False,
            "current_traffic_delay": round(traffic_delay),
            "new_duration_minutes": round(new_duration),
            "reason": "Keine schnellere Alternative verfügbar"
        }
    
    return {
        "has_better_route": False,
        "current_traffic_delay": round(traffic_delay),
        "message": "Route ist optimal"
    }

# ============== Maut-Berechnung ==============

class TollCalculationRequest(BaseModel):
    route_geometry: List[List[float]]
    vehicle_weight: int = 40000
    vehicle_axles: int = 5
    vehicle_height: float = 4.0
    vehicle_length: float = 16.5
    emission_class: str = "EURO_6"

@api_router.post("/toll/calculate")
async def calculate_toll_costs(
    request: TollCalculationRequest,
    user: dict = Depends(get_current_user)
):
    """
    Berechnet Mautkosten für eine gegebene Route
    
    ⚠️ Hinweis: Kosten sind Schätzungen!
    """
    toll_service = get_toll_service()
    
    result = await toll_service.calculate_toll_cost(
        route_geometry=request.route_geometry,
        vehicle_params={
            'gross_weight': request.vehicle_weight,
            'axles': request.vehicle_axles,
            'height': request.vehicle_height,
            'length': request.vehicle_length,
            'emission_class': request.emission_class
        }
    )
    
    return result

# ============== Blitzer-Warnungen ==============

class SpeedCameraRequest(BaseModel):
    route_geometry: List[List[float]]
    buffer_meters: int = 500

@api_router.post("/speed-cameras/along-route")
async def get_speed_cameras(
    request: SpeedCameraRequest,
    user: dict = Depends(get_current_user)
):
    """
    Findet Blitzer entlang einer Route
    
    ⚠️ RECHTLICHER HINWEIS (Deutschland):
    Die Nutzung von Blitzer-Warnern während der Fahrt ist verboten!
    Diese Funktion dient nur zur Routenplanung VOR Fahrtantritt.
    """
    camera_service = get_speed_camera_service()
    
    cameras = await camera_service.get_speed_cameras_along_route(
        route_geometry=request.route_geometry,
        buffer_meters=request.buffer_meters
    )
    
    return {
        "cameras": cameras,
        "count": len(cameras),
        "legal_disclaimer": SPEED_CAMERA_LEGAL_DISCLAIMER_DE
    }

@api_router.get("/speed-cameras/legal-notice")
async def get_speed_camera_legal_notice(language: str = "de"):
    """Rechtliche Hinweise für Blitzer-Warnungen"""
    return {
        "disclaimer": SPEED_CAMERA_LEGAL_DISCLAIMER_DE if language == "de" else SPEED_CAMERA_LEGAL_DISCLAIMER_EN,
        "summary": {
            "de": "⚠️ Nutzung während Fahrt verboten - nur zur Planung!",
            "en": "⚠️ Use while driving prohibited - for planning only!"
        }
    }

# ============== Gesamtkosten-Berechnung ==============

class TripCostRequest(BaseModel):
    distance_km: float
    toll_cost: float = 0
    fuel_consumption_l_per_100km: float = 32
    fuel_price_per_liter: float = 1.85

@api_router.post("/costs/calculate-trip")
async def calculate_trip_costs(
    request: TripCostRequest,
    user: dict = Depends(get_current_user)
):
    """
    Berechnet Gesamtkosten einer Fahrt
    
    Beinhaltet:
    - Mautkosten
    - Kraftstoffkosten
    - Gesamtkosten
    """
    fuel_needed = (request.distance_km / 100) * request.fuel_consumption_l_per_100km
    fuel_cost = round(fuel_needed * request.fuel_price_per_liter, 2)
    total_cost = round(request.toll_cost + fuel_cost, 2)
    
    return {
        "distance_km": request.distance_km,
        "fuel": {
            "consumption_l_per_100km": request.fuel_consumption_l_per_100km,
            "total_liters": round(fuel_needed, 1),
            "price_per_liter": request.fuel_price_per_liter,
            "cost": fuel_cost
        },
        "toll": {
            "cost": request.toll_cost
        },
        "total_cost": total_cost,
        "currency": "EUR",
        "disclaimer": "⚠️ Alle Kosten sind Schätzungen"
    }

# ============== Status Routes ==============

@api_router.get("/")
async def root():
    return {"message": "TruckerMaps API", "version": "2.1.0"}

@api_router.get("/health")
async def health():
    tomtom_service = get_tomtom_service()
    return {
        "status": "healthy",
        "tomtom_api_configured": tomtom_service.is_configured,
        "version": "2.1.0"
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
