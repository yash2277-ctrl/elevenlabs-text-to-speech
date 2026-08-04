from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlmodel import Session, select
import httpx
import os
import uuid
import jwt
import json
from typing import List, Optional
from datetime import timedelta, datetime
from dotenv import load_dotenv
import io

from database import (
    create_db_and_tables, get_session,
    User, GenerationHistory, Agent, Project, DubbingJob,
    TranscriptionJob, Article
)
from auth import (
    verify_password, get_password_hash, create_access_token,
    SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
)
from pydantic import BaseModel, field_validator
import hashlib
import time
from collections import defaultdict

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma', '.mp4', '.mov', '.avi', '.mkv', '.webm'}
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'}

AUDIO_MAGIC_BYTES = {
    b'\xff\xfb': 'mp3', b'\xff\xf3': 'mp3', b'\xff\xf2': 'mp3',
    b'\x49\x44\x33': 'mp3',
    b'RIFF': 'wav',
    b'OggS': 'ogg',
    b'\x66\x4c\x61\x43': 'flac',
    b'\x4d\x34\x41\x20': 'm4a',
    b'\x00\x00\x00\x1c\x66\x74\x79\x70': 'mp4',
    b'\x00\x00\x00\x14\x66\x74\x79\x70': 'mov',
    b'\x1a\x45\xdf\xa3': 'mkv',
    b'\x52\x49\x46\x46': 'avi',
    b'\x00\x00\x00\x18\x66\x74\x79\x70': 'mp4',
}

def validate_audio_file(filename: str, content: bytes = None):
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400,
            detail=f"Cannot read '{filename}' — this endpoint accepts audio/video files only, not images. Please upload a valid audio file (.mp3, .wav, .ogg, etc.).")
    if ext not in AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400,
            detail=f"Unsupported file format '{ext}'. Please upload an audio file (.mp3, .wav, .ogg, .m4a, etc.).")
    if content and len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413,
            detail="File too large. Maximum size is 100 MB.")
    if content and len(content) >= 4:
        magic = content[:4]
        is_valid = any(magic.startswith(m) for m in AUDIO_MAGIC_BYTES)
        if not is_valid:
            raise HTTPException(status_code=400,
                detail=f"File '{filename}' does not appear to be a valid audio/video file (magic bytes don't match).")

load_dotenv()
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
API_BASE_URL = "https://api.elevenlabs.io/v1"

app = FastAPI(title="ElevenLabs Clone Backend")

_rate_limit_store = defaultdict(list)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    now = time.time()
    client_ip = request.client.host if request.client else "unknown"
    _rate_limit_store[client_ip] = [t for t in _rate_limit_store[client_ip] if t > now - 60]
    if len(_rate_limit_store[client_ip]) >= 30:
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
    _rate_limit_store[client_ip].append(now)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUDIO_DIR = "audio_files"
UPLOAD_DIR = "uploads"
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# ──────────────────────────────────────────────
# Pydantic Request Models
# ──────────────────────────────────────────────
class UserCreate(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TTSRequest(BaseModel):
    text: str
    model_id: str = "eleven_multilingual_v2"
    voice_settings: Optional[dict] = {"stability": 0.5, "similarity_boost": 0.75}
    emotion: Optional[str] = None
    speed: Optional[float] = None
    pitch: Optional[float] = None
    language: str = "en"
    genre: str = "auto"

class AgentCreateRequest(BaseModel):
    name: str = "My Agent"
    system_prompt: str = "You are a helpful assistant."
    first_message: str = "Hello! How can I help you today?"
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"

class ProjectCreateRequest(BaseModel):
    name: str = "Untitled Project"
    paragraphs: list = []

class MusicGenerationRequest(BaseModel):
    text: str
    duration_seconds: float = 10.0
    genre: Optional[str] = None
    mood: Optional[str] = None

    @field_validator('duration_seconds')
    @classmethod
    def validate_duration(cls, v):
        if v < 0.5:
            return 0.5
        if v > 120:
            return 120
        return v

class ArticleCreateRequest(BaseModel):
    title: str
    content: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    model_id: str = "eleven_multilingual_v2"
    language: str = "en"
    genre: str = "auto"

# ──────────────────────────────────────────────
# Auth
# ──────────────────────────────────────────────
def get_current_user(token: str, session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        raise credentials_exception
    return user

@app.post("/api/v1/auth/register", response_model=Token)
def register(user: UserCreate, session: Session = Depends(get_session)):
    db_user = session.exec(select(User).where(User.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_password)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": new_user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/v1/auth/login", response_model=Token)
def login(user: UserCreate, session: Session = Depends(get_session)):
    db_user = session.exec(select(User).where(User.email == user.email)).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": db_user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
import edge_tts

def has_api_key():
    return ELEVENLABS_API_KEY and ELEVENLABS_API_KEY != "your_api_key_here"


# ──────────────────────────────────────────────
# EMOTIONAL TTS: Map emotion names to ElevenLabs API params
# ──────────────────────────────────────────────
def get_elevenlabs_emotion_params(emotion: Optional[str] = None):
    emotion_map = {
        "neutral": {},
        "happy": {"stability": 0.3, "similarity_boost": 0.8, "style": 0.5},
        "sad": {"stability": 0.6, "similarity_boost": 0.7, "style": 0.8},
        "excited": {"stability": 0.2, "similarity_boost": 0.9, "style": 0.7},
        "angry": {"stability": 0.1, "similarity_boost": 0.9, "style": 0.9},
        "whisper": {"stability": 0.8, "similarity_boost": 0.5, "style": 0.3},
        "fearful": {"stability": 0.4, "similarity_boost": 0.8, "style": 0.8},
    }
    return emotion_map.get(emotion, {})


# ──────────────────────────────────────────────
# VOICE LIBRARY with curated collections
# ──────────────────────────────────────────────
MOCK_VOICES = [
    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "VR6AewLTigWG4xSOukaG", "name": "Arnold", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "EXAVITQu4vr4xnSDxMaL", "name": "Bella", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "N2lVS1w4EtoT3dr4eOWO", "name": "Callum", "category": "premade",
     "labels": {"accent": "Transatlantic", "age": "middle-aged", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "IKne3meq5aSn9XLyUdCD", "name": "Charlie", "category": "premade",
     "labels": {"accent": "Australian", "age": "middle-aged", "gender": "male", "use_case": "conversational", "collection": "conversational"}},
    {"voice_id": "XB0fDUnXU5powz51qWjX", "name": "Charlotte", "category": "premade",
     "labels": {"accent": "Swedish", "age": "young", "gender": "female", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "2EiwWnXFnvU5JabPnv8n", "name": "Clyde", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "onwK4e9ZLuTAKqWW03F9", "name": "Daniel", "category": "premade",
     "labels": {"accent": "British", "age": "middle-aged", "gender": "male", "use_case": "news", "collection": "news"}},
    {"voice_id": "AZnzlk1XvdvUeBnXmlld", "name": "Domi", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "MF3mGyEYCl7XYWbV9V6O", "name": "Elli", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "LcfcDJNUP1GQjkzn1xUU", "name": "Emily", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "meditation", "collection": "wellness"}},
    {"voice_id": "g5CIjZEefAph4nQFvHAz", "name": "Ethan", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "ASMR", "collection": "wellness"}},
    {"voice_id": "D38z5RcWu1voky8WS1ja", "name": "Fin", "category": "premade",
     "labels": {"accent": "Irish", "age": "old", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "jsCqWAovK2MfzahiPUJG", "name": "Freya", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "jBpfuIE2acCO8z3wKOUl", "name": "Gigi", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "animation", "collection": "characters"}},
    {"voice_id": "zcAOhNBS3c14rBihAFp1", "name": "Giovanni", "category": "premade",
     "labels": {"accent": "Italian", "age": "young", "gender": "male", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "z9fAnlkpzviPz146aGWa", "name": "Glinda", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "female", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "oWAxZDx7w5VEj9dCyTzz", "name": "Grace", "category": "premade",
     "labels": {"accent": "American-Southern", "age": "young", "gender": "female", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "SOYHLrjzK2X1ezoPC6cr", "name": "Harry", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "ZQe5CZNOzWyzOMU5mhHL", "name": "James", "category": "premade",
     "labels": {"accent": "Australian", "age": "old", "gender": "male", "use_case": "news", "collection": "news"}},
    {"voice_id": "bVMeCyTHy58xNoL34h3p", "name": "Jeremy", "category": "premade",
     "labels": {"accent": "American-Irish", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "t0jbNlBVZ17f02VDIeMI", "name": "Jessie", "category": "premade",
     "labels": {"accent": "American", "age": "old", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "Zlb1dXrJ653qPTzKUvB3", "name": "Joseph", "category": "premade",
     "labels": {"accent": "British", "age": "middle-aged", "gender": "male", "use_case": "news", "collection": "news"}},
    {"voice_id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "TX3OmfQAxAagI2v1cl92", "name": "Liam", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "female", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "Yko7PKHZNXotIFUBG7I9", "name": "Matthew", "category": "premade",
     "labels": {"accent": "British", "age": "middle-aged", "gender": "male", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "flq6f7yk4E4fJM5XTYuZ", "name": "Michael", "category": "premade",
     "labels": {"accent": "American", "age": "old", "gender": "male", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "zrHiDhphv9ZnVPUqCQEP", "name": "Mimi", "category": "premade",
     "labels": {"accent": "Swedish", "age": "young", "gender": "female", "use_case": "animation", "collection": "characters"}},
    {"voice_id": "piTKgcLEGmPE4e6mJC43", "name": "Nicole", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "audiobook", "collection": "audiobooks"}},
    {"voice_id": "ODq5zmih8GrVes37Dizd", "name": "Patrick", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "male", "use_case": "characters", "collection": "characters"}},
    {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "female", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "yoZ06aBxZCGjiILjnOsT", "name": "Sam", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "narration", "collection": "narrators"}},
    {"voice_id": "pMsXgVXv3BLzUgSXRplE", "name": "Serena", "category": "premade",
     "labels": {"accent": "American", "age": "middle-aged", "gender": "female", "use_case": "interactive", "collection": "conversational"}},
    {"voice_id": "GBv7mTt0atIp3Br8iCZE", "name": "Thomas", "category": "premade",
     "labels": {"accent": "American", "age": "young", "gender": "male", "use_case": "meditation", "collection": "wellness"}},
]

VOICE_COLLECTIONS = {
    "narrators": {"name": "Narrators", "description": "Best voices for storytelling and narration"},
    "characters": {"name": "Characters", "description": "Expressive voices for character dialogue"},
    "news": {"name": "News & Announcements", "description": "Authoritative voices for news reading"},
    "audiobooks": {"name": "Audiobooks", "description": "Warm voices perfect for long-form listening"},
    "conversational": {"name": "Conversational", "description": "Natural voices for chatbots and assistants"},
    "wellness": {"name": "Wellness & Meditation", "description": "Calm voices for meditation and ASMR"},
}

# ──────────────────────────────────────────────
# FALLBACK TTS: edge-tts voice mapping (used when no API key)
# ──────────────────────────────────────────────
LANGUAGE_VOICES = {
    "hi": ["hi-IN-SwaraNeural", "hi-IN-MadhurNeural"],
    "mr": ["mr-IN-AarohiNeural", "mr-IN-ManoharNeural"],
    "bn": ["bn-IN-TanishaaNeural", "bn-IN-BashkarNeural"],
    "gu": ["gu-IN-DhwaniNeural", "gu-IN-NiranjanNeural"],
    "kn": ["kn-IN-SapnaNeural", "kn-IN-GaganNeural"],
    "ml": ["ml-IN-SobhanaNeural", "ml-IN-MidhunNeural"],
    "ta": ["ta-IN-PallaviNeural", "ta-IN-ValluvarNeural"],
    "te": ["te-IN-ShrutiNeural", "te-IN-MohanNeural"],
    "ur": ["ur-IN-GulNeural", "ur-IN-SalmanNeural"],
    "pa": ["gu-IN-DhwaniNeural", "gu-IN-NiranjanNeural"],
    "ne": ["ne-NP-HemkalaNeural", "ne-NP-SagarNeural"],
    "en": [],  # English uses hash-based mapping below
    "es": ["es-ES-ElviraNeural", "es-ES-AlvaroNeural"],
    "fr": ["fr-FR-VivienneMultilingualNeural", "fr-FR-RemyMultilingualNeural"],
    "de": ["de-DE-SeraphinaMultilingualNeural", "de-DE-FlorianMultilingualNeural"],
    "it": ["it-IT-ElsaNeural", "it-IT-GiuseppeMultilingualNeural"],
    "pt": ["pt-BR-ThalitaMultilingualNeural", "pt-BR-AntonioNeural"],
    "ru": ["ru-RU-SvetlanaNeural", "ru-RU-DmitryNeural"],
    "ja": ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural"],
    "ko": ["ko-KR-SunHiNeural", "ko-KR-HyunsuMultilingualNeural"],
    "zh": ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"],
    "ar": ["ar-SA-ZariyahNeural", "ar-SA-HamedNeural"],
    "tr": ["tr-TR-EmelNeural", "tr-TR-AhmetNeural"],
    "nl": ["nl-NL-FennaNeural", "nl-NL-MaartenNeural"],
    "pl": ["pl-PL-ZofiaNeural", "pl-PL-MarekNeural"],
    "sv": ["sv-SE-SofieNeural", "sv-SE-MattiasNeural"],
    "da": ["da-DK-ChristelNeural", "da-DK-JeppeNeural"],
    "fi": ["fi-FI-NooraNeural", "fi-FI-HarriNeural"],
    "nb": ["nb-NO-PernilleNeural", "nb-NO-FinnNeural"],
    "cs": ["cs-CZ-VlastaNeural", "cs-CZ-AntoninNeural"],
    "hu": ["hu-HU-NoemiNeural", "hu-HU-TamasNeural"],
    "ro": ["ro-RO-AlinaNeural", "ro-RO-EmilNeural"],
    "th": ["th-TH-PremwadeeNeural", "th-TH-NiwatNeural"],
    "vi": ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"],
    "id": ["id-ID-GadisNeural", "id-ID-ArdiNeural"],
    "ms": ["ms-MY-YasminNeural", "ms-MY-OsmanNeural"],
    "el": ["el-GR-AthinaNeural", "el-GR-NestorasNeural"],
    "he": ["he-IL-HilaNeural", "he-IL-AvriNeural"],
}

EDGE_TTS_VOICES = [
    "en-US-JennyNeural", "en-US-AriaNeural", "en-US-GuyNeural",
    "en-US-MichelleNeural", "en-US-EricNeural", "en-US-AndrewNeural",
    "en-US-AnaNeural", "en-US-BrianNeural", "en-US-ChristopherNeural",
    "en-US-RogerNeural", "en-US-SteffanNeural",
    "en-GB-LibbyNeural", "en-GB-RyanNeural", "en-GB-ThomasNeural",
    "en-GB-SoniaNeural", "en-GB-MaisieNeural",
    "en-AU-NatashaNeural", "en-AU-WilliamNeural",
    "en-IE-ConnorNeural", "en-IE-EmilyNeural",
    "en-IN-NeerjaNeural", "en-IN-PrabhatNeural",
    "en-ZA-LeahNeural", "en-ZA-LukeNeural",
    "en-SG-LunaNeural", "en-SG-WayneNeural",
    "en-PH-RosaNeural", "en-PH-JamesNeural",
    "en-NZ-MitchellNeural", "en-NZ-MollyNeural",
]

# ──────────────────────────────────────────────
# GENRE-AWARE STORYTELLING VOICES
# ──────────────────────────────────────────────
GENRE_VOICE_MAP = {
    "horror":      {"voice": "en-US-RogerNeural",    "rate": "-8%",  "pitch": "-30Hz", "desc": "Deep, grim voice for horror"},
    "thriller":    {"voice": "en-US-BrianNeural",    "rate": "+5%",  "pitch": "+0Hz",  "desc": "Intense, gripping voice"},
    "mystery":     {"voice": "en-GB-ThomasNeural",   "rate": "-5%",  "pitch": "+0Hz",  "desc": "Sophisticated, enigmatic voice"},
    "romance":     {"voice": "en-US-MichelleNeural", "rate": "",     "pitch": "",     "desc": "Warm, tender voice"},
    "drama":       {"voice": "en-GB-LibbyNeural",    "rate": "",     "pitch": "",     "desc": "Expressive, emotional voice"},
    "comedy":      {"voice": "en-IE-EmilyNeural",    "rate": "+12%", "pitch": "+15Hz", "desc": "Lively, cheerful voice"},
    "fantasy":     {"voice": "en-GB-MaisieNeural",   "rate": "+5%",  "pitch": "+10Hz", "desc": "Whimsical, enchanting voice"},
    "sci_fi":      {"voice": "en-US-AndrewNeural",   "rate": "",     "pitch": "",     "desc": "Futuristic, steady voice"},
    "adventure":   {"voice": "en-AU-NatashaNeural",  "rate": "+10%", "pitch": "",     "desc": "Energetic, bold voice"},
    "tragedy":     {"voice": "en-US-AnaNeural",      "rate": "-10%", "pitch": "-20Hz", "desc": "Soft, melancholic voice"},
    "inspirational":{"voice": "en-US-AriaNeural",    "rate": "+5%",  "pitch": "",     "desc": "Bright, uplifting voice"},
    "documentary": {"voice": "en-GB-RyanNeural",     "rate": "",     "pitch": "",     "desc": "Authoritative, calm narrator"},
    "western":     {"voice": "en-US-SteffanNeural",  "rate": "",     "pitch": "-15Hz", "desc": "Rugged, grounded voice"},
    "noir":        {"voice": "en-US-RogerNeural",    "rate": "-12%", "pitch": "-40Hz", "desc": "Gritty, dark detective voice"},
    "fairytale":   {"voice": "en-IE-EmilyNeural",    "rate": "-5%",  "pitch": "+10Hz", "desc": "Magical, storybook voice"},
    "children":    {"voice": "en-GB-MaisieNeural",   "rate": "+15%", "pitch": "+30Hz", "desc": "Friendly, playful voice"},
    "news":        {"voice": "en-GB-RyanNeural",     "rate": "",     "pitch": "",     "desc": "Neutral, professional voice"},
    "narration":   {"voice": "en-US-GuyNeural",      "rate": "",     "pitch": "",     "desc": "Warm, engaging storyteller"},
}

GENRE_KEYWORDS = {
    "horror": ["scary", "afraid", "fear", "terror", "dark", "monster", "ghost", "scream",
               "blood", "horror", "creepy", "haunted", "dread", "nightmare", "shadows",
               "corpse", "evil", "demonic", "vampire", "zombie", "haunting", "spooky",
               "chilling", "gruesome", "macabre", "howl", "graveyard"],
    "thriller": ["suspense", "chase", "hunt", "conspiracy", "twist", "escape", "pursuit",
                 "killer", "detective", "investigation", "hostage", "thriller", "showdown"],
    "mystery": ["mystery", "puzzle", "clue", "detective", "investigate", "suspect",
                "alibi", "enigma", "curious", "strange", "unexplained", "secrets", "riddle"],
    "romance": ["love", "kiss", "heart", "romance", "passion", "darling", "sweet",
                "romantic", "embrace", "soulmate", "cherish", "tender", "affection",
                "desire", "devotion", "beloved", "courtship"],
    "comedy": ["funny", "joke", "laugh", "humor", "hilarious", "comedy", "silly",
               "amusing", "wit", "comedic", "ridiculous", "absurd", "satire", "punchline"],
    "fantasy": ["magic", "dragon", "sword", "quest", "wizard", "enchanted", "spell",
                "kingdom", "mythical", "sorcerer", "fairy", "elf", "dwarf", "prophecy",
                "realm", "mystical", "unicorn", "potion", "wand"],
    "sci_fi": ["alien", "space", "robot", "future", "futuristic", "cyber", "nano",
               "quantum", "hologram", "starship", "galaxy", "android", "time travel",
               "dimension", "clone", "artificial intelligence", "spaceship"],
    "adventure": ["adventure", "expedition", "journey", "treasure", "explore", "voyage",
                  "quest", "discover", "survival", "jungle", "desert", "island",
                  "lost", "wilderness", "shipwreck", "map"],
    "tragedy": ["tragic", "death", "grief", "sorrow", "mourn", "loss", "funeral",
                "tears", "heartbreak", "farewell", "tragedy", "despair", "weeping"],
    "inspirational": ["inspire", "dream", "courage", "hope", "believe", "persevere",
                      "triumph", "overcome", "destiny", "determination", "strength",
                      "faith", "miracle", "rise", "victory"],
    "documentary": ["history", "ancient", "civilization", "science", "nature", "wildlife",
                    "ocean", "planet", "universe", "research", "evidence", "discovery",
                    "fossil", "expedition", "species"],
    "western": ["cowboy", "saloon", "sheriff", "outlaw", "ranch", "gold rush",
                "frontier", "wild west", "horse", "revolver", "train robbery", "bandit"],
    "noir": ["smoke", "shadow", "alley", "mysterious", "crime", "underworld",
             "corrupt", "confession", "darkness", "gritty", "neon", "dame", "fedora"],
    "fairytale": ["once upon", "fairy", "prince", "princess", "castle", "spell",
                  "witch", "enchanted", "fairy tale", "happily ever", "magic kingdom",
                  "glass slipper", "true love kiss"],
    "children": ["children", "kids", "play", "toy", "animal", "rainbow", "bedtime",
                 "nursery", "cuddle", "giggle", "story time", "little", "cute",
                 "teddy bear", "lullaby"],
}

def detect_genre(text: str) -> str:
    text_lower = text.lower()
    scores = {}
    for genre, keywords in GENRE_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[genre] = score

    story_patterns = ["chapter", "once upon", "the end", "tale of", "legend of",
                      "in a land", "long ago", "story begins"]
    is_story = any(p in text_lower for p in story_patterns)

    if not scores:
        return "narration" if is_story else "general"
    if is_story and max(scores.values()) < 2:
        return "narration"

    best = max(scores, key=scores.get)
    return best


STYLE_VOICES = {
    "en-US-AriaNeural":1, "en-US-JennyNeural":1, "en-US-MichelleNeural":1,
    "en-US-AnaNeural":1, "en-US-GuyNeural":1, "en-US-ChristopherNeural":1,
    "en-US-EricNeural":1, "en-US-BrianNeural":1, "en-US-RogerNeural":1,
    "en-US-SteffanNeural":1, "en-US-AndrewNeural":1,
}

GENRE_STYLE_MAP = {
    "horror": "terrified", "thriller": "excited", "mystery": "sad",
    "romance": "friendly", "comedy": "cheerful", "fantasy": "friendly",
    "drama": "sad", "tragedy": "sad", "adventure": "excited",
    "inspirational": "hopeful", "noir": "whispering", "fairytale": "cheerful",
    "children": "cheerful",
}

def get_edge_tts_voice(voice_id: str, language: str = "en", genre: str = "auto"):
    if genre and genre not in ("auto", "general") and genre in GENRE_VOICE_MAP:
        return (GENRE_VOICE_MAP[genre]["voice"], "", "")
    voices = LANGUAGE_VOICES.get(language, EDGE_TTS_VOICES if language == "en" else ["en-US-JennyNeural"])
    if not voices:
        voices = EDGE_TTS_VOICES
    idx = int(hashlib.md5(voice_id.encode()).hexdigest(), 16) % len(voices)
    return (voices[idx], "", "")

def escape_xml(s: str) -> str:
    return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;").replace("'","&apos;")

def build_natural_ssml(text: str, voice: str, language: str, genre: str) -> str:
    style = GENRE_STYLE_MAP.get(genre) if language == "en" and voice in STYLE_VOICES else None
    genre_info = GENRE_VOICE_MAP.get(genre)
    base_rate = genre_info["rate"] if genre_info and genre_info["rate"] else "+0%"
    escaped = escape_xml(text)

    import re
    sentences = re.split(r'(?<=[.!?])\s+', escaped)
    tags = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        words = s.split()
        wc = max(len(words), 1)
        avg = sum(len(w) for w in words) / wc
        has_exclaim = "!" in s
        has_question = "?" in s
        if has_exclaim:
            sr, sp = "+0%", "+40Hz"
        elif has_question:
            sr, sp = "+5%", "+30Hz"
        elif wc > 20:
            sr, sp = "+8%", "+0Hz"
        elif avg > 6:
            sr, sp = "-5%", "+5Hz"
        else:
            sr, sp = base_rate if base_rate else "+5%", "+0Hz"
        tags.append(f'<prosody rate="{sr}" pitch="{sp}">{s}</prosody>')

    body = '<break time="250ms"/>'.join(tags)

    if style:
        return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="{language}">'
                f'<voice name="{voice}">'
                f'<mstts:express-as style="{style}">'
                f'{body}'
                f'</mstts:express-as></voice></speak>')

    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language}">'
            f'<voice name="{voice}">'
            f'{body}'
            f'</voice></speak>')

REVERB_FILTERS = {
    "horror":  "aecho=0.8:0.6:60:0.3|aecho=0.6:0.4:120:0.2, volume=0.85",
    "thriller":"aecho=0.7:0.5:40:0.25, volume=0.9",
    "mystery": "aecho=0.6:0.4:80:0.35, volume=0.88",
    "fantasy": "aecho=0.7:0.5:100:0.4, volume=0.92",
    "noir":    "aecho=0.8:0.6:50:0.2, volume=0.82",
    "romance": "volume=0.95",
    "comedy":  "volume=1.0",
    "drama":   "volume=0.9",
    "tragedy": "aecho=0.6:0.4:70:0.3, volume=0.85",
    "fairytale":"aecho=0.5:0.3:90:0.35, volume=0.9",
    "children": "volume=1.0",
}

EQ_FILTERS = {
    "horror":   "equalizer=f=200:width_type=h:width=200:g=-4,equalizer=f=3000:width_type=h:width=1000:g=2",
    "thriller": "equalizer=f=150:width_type=h:width=150:g=-2,equalizer=f=4000:width_type=h:width=1500:g=3",
    "mystery":  "equalizer=f=250:width_type=h:width=200:g=-3,equalizer=f=2000:width_type=h:width=800:g=2",
    "fantasy":  "equalizer=f=200:width_type=h:width=200:g=2,equalizer=f=4000:width_type=h:width=1500:g=3",
    "romance":  "equalizer=f=300:width_type=h:width=300:g=3,equalizer=f=5000:width_type=h:width=2000:g=-2",
    "comedy":   "equalizer=f=2000:width_type=h:width=1500:g=2",
    "drama":    "equalizer=f=250:width_type=h:width=200:g=2,equalizer=f=3000:width_type=h:width=1000:g=-2",
    "tragedy":  "equalizer=f=200:width_type=h:width=200:g=3,equalizer=f=4000:width_type=h:width=1500:g=-3",
    "fairytale":"equalizer=f=300:width_type=h:width=300:g=2,equalizer=f=5000:width_type=h:width=2000:g=2",
    "children": "equalizer=f=300:width_type=h:width=300:g=2,equalizer=f=4000:width_type=h:width=1500:g=2",
}

async def postprocess_audio(filepath: str, genre: str = "general"):
    try:
        import shutil, subprocess as sp, os
    except Exception:
        return
    ff = shutil.which("ffmpeg")
    if not ff:
        return
    try:
        rev = REVERB_FILTERS.get(genre, "volume=1.0")
        eq = EQ_FILTERS.get(genre, "")
        base_eq = ("equalizer=f=100:width_type=h:width=100:g=-2,"
                   "equalizer=f=200:width_type=h:width=200:g=-1,"
                   "equalizer=f=3000:width_type=h:width=2000:g=3,"
                   "equalizer=f=8000:width_type=h:width=2000:g=2")
        comp = "acompressor=threshold=-15dB:ratio=3:attack=5:release=50"
        af = f"aresample=44100,loudnorm=I=-16:LRA=11:TP=-1.5,{comp},{base_eq}"
        if eq:
            af += "," + eq
        af += "," + rev
        tmp = filepath + ".tmp.mp3"
        sp.run([ff, "-i", filepath, "-af", af, "-c:a", "libmp3lame", "-q:a", "2", "-y", tmp],
               capture_output=True, timeout=60)
        if os.path.getsize(tmp) > 1000:
            os.replace(tmp, filepath)
        else:
            os.remove(tmp)
    except Exception:
        pass

async def fallback_tts(text: str, voice_id: str, filepath: str, language: str = "en", genre: str = "auto"):
    if genre == "auto":
        detected = detect_genre(text)
        if detected != "general":
            genre = detected
    voice, _, _ = get_edge_tts_voice(voice_id, language, genre)
    ssml = build_natural_ssml(text, voice, language, genre)
    communicate = edge_tts.Communicate(ssml, voice)
    await communicate.save(filepath)
    await postprocess_audio(filepath, genre)


# ──────────────────────────────────────────────
# Endpoint: list supported languages
# ──────────────────────────────────────────────
LANGUAGE_DISPLAY = {
    "hi": "Hindi", "mr": "Marathi", "bn": "Bengali", "gu": "Gujarati",
    "kn": "Kannada", "ml": "Malayalam", "ta": "Tamil", "te": "Telugu",
    "ur": "Urdu", "pa": "Punjabi", "ne": "Nepali",
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ru": "Russian",
    "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
    "ar": "Arabic", "tr": "Turkish", "nl": "Dutch",
    "pl": "Polish", "sv": "Swedish", "da": "Danish",
    "fi": "Finnish", "nb": "Norwegian", "cs": "Czech",
    "hu": "Hungarian", "ro": "Romanian", "th": "Thai",
    "vi": "Vietnamese", "id": "Indonesian", "ms": "Malay",
    "el": "Greek", "he": "Hebrew",
}

@app.get("/api/v1/languages")
async def get_languages():
    return {"languages": [{"code": k, "name": v} for k, v in LANGUAGE_DISPLAY.items()]}


# ──────────────────────────────────────────────
# Endpoint: list supported story genres
# ──────────────────────────────────────────────
GENRE_DISPLAY = {
    "auto": "Auto-detect from story",
    "horror": "Horror — deep grim voice", "thriller": "Thriller — intense gripping voice",
    "mystery": "Mystery — sophisticated enigmatic voice", "romance": "Romance — warm tender voice",
    "drama": "Drama — expressive emotional voice", "comedy": "Comedy — lively cheerful voice",
    "fantasy": "Fantasy — whimsical enchanting voice", "sci_fi": "Sci-Fi — futuristic steady voice",
    "adventure": "Adventure — energetic bold voice", "tragedy": "Tragedy — soft melancholic voice",
    "inspirational": "Inspirational — bright uplifting voice",
    "documentary": "Documentary — authoritative calm narrator",
    "western": "Western — rugged grounded voice", "noir": "Noir — gritty dark voice",
    "fairytale": "Fairytale — magical storybook voice",
    "children": "Children — friendly playful voice",
    "news": "News — neutral professional voice",
    "narration": "Narration — warm engaging storyteller",
}

@app.get("/api/v1/genres")
async def get_genres():
    return {"genres": [{"id": k, "name": v} for k, v in GENRE_DISPLAY.items()]}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. VOICES with collections
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/voices")
async def get_voices(collection: Optional[str] = Query(None)):
    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{API_BASE_URL}/voices",
                    headers={"xi-api-key": ELEVENLABS_API_KEY}
                )
                if response.status_code == 200:
                    data = response.json()
                    data["collections"] = VOICE_COLLECTIONS
                    return data
        except Exception:
            pass
    filtered = MOCK_VOICES
    if collection:
        filtered = [v for v in MOCK_VOICES if v["labels"].get("collection") == collection]
    return {"voices": filtered, "collections": VOICE_COLLECTIONS}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. TEXT-TO-SPEECH with emotion/speed/pitch
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/text-to-speech/{voice_id}")
async def text_to_speech(voice_id: str, req: TTSRequest, session: Session = Depends(get_session)):
    word_count = len(req.text.split())
    if word_count > 5000:
        raise HTTPException(status_code=400, detail=f"Text exceeds 5000 word limit ({word_count} words).")

    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        payload = {
            "text": req.text,
            "model_id": req.model_id,
            "voice_settings": req.voice_settings or {}
        }
        if req.speed:
            payload["speed"] = req.speed
        if req.emotion:
            emotion_params = get_elevenlabs_emotion_params(req.emotion)
            payload["voice_settings"].update(emotion_params)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/text-to-speech/{voice_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                    json=payload
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                else:
                    await fallback_tts(req.text, voice_id, filepath, req.language, req.genre)
        except Exception:
            await fallback_tts(req.text, voice_id, filepath, req.language, req.genre)
    else:
        await fallback_tts(req.text, voice_id, filepath, req.language, req.genre)

    history = GenerationHistory(
        voice_id=voice_id, text=req.text,
        audio_file_path=filename, character_count=len(req.text),
        gen_type="tts"
    )
    session.add(history)
    session.commit()
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. SPEECH-TO-TEXT (Scribe)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/speech-to-text")
async def speech_to_text(
    audio: UploadFile = File(...),
    model_id: str = Form("scribe_v2"),
    language: str = Form("en"),
    session: Session = Depends(get_session)
):
    file_id = str(uuid.uuid4())
    audio_content = await audio.read()
    validate_audio_file(audio.filename, audio_content)
    filename = f"{file_id}_{audio.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/speech-to-text",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    data={"model_id": model_id, "language": language},
                    files={"file": (audio.filename, audio_content, audio.content_type)}
                )
                if response.status_code == 200:
                    result = response.json()
                    job = TranscriptionJob(
                        job_id=f"stt_{file_id}",
                        status="completed",
                        audio_file_path=filename,
                        transcript_text=result.get("text", ""),
                        language=language
                    )
                    session.add(job)
                    session.commit()
                    return result
        except Exception:
            pass

    # Fallback: use speech_recognition (Google Web Speech)
    transcript = ""
    try:
        import speech_recognition as sr
        from pydub import AudioSegment
        recognizer = sr.Recognizer()
        wav_path = filepath.rsplit('.', 1)[0] + '.wav'
        audio_seg = AudioSegment.from_file(filepath)
        audio_seg.export(wav_path, format="wav")
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            transcript = recognizer.recognize_google(audio_data, language=language)
    except Exception as e:
        transcript = f"[Local transcription failed: {str(e)}]"

    job = TranscriptionJob(
        job_id=f"stt_{file_id}",
        status="completed",
        audio_file_path=filename,
        transcript_text=transcript,
        language=language
    )
    session.add(job)
    session.commit()
    return {"text": transcript, "language": language, "model_id": model_id}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. SPEECH-TO-SPEECH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/speech-to-speech/{voice_id}")
async def speech_to_speech(
    voice_id: str,
    audio: UploadFile = File(...),
    model_id: str = Form("eleven_english_sts_v2"),
    session: Session = Depends(get_session)
):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    audio_content = await audio.read()
    validate_audio_file(audio.filename, audio_content)
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/speech-to-speech/{voice_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    data={"model_id": model_id},
                    files={"audio": (audio.filename, audio_content, audio.content_type)}
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    history = GenerationHistory(
                        voice_id=voice_id, text=f"[STS from {audio.filename}]",
                        audio_file_path=filename, gen_type="sts"
                    )
                    session.add(history)
                    session.commit()
                    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
                else:
                    raise HTTPException(status_code=response.status_code, detail=response.text)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        with open(filepath, "wb") as f:
            f.write(audio_content)
        history = GenerationHistory(
            voice_id=voice_id, text=f"[STS from {audio.filename}]",
            audio_file_path=filename, gen_type="sts"
        )
        session.add(history)
        session.commit()
        return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. SOUND EFFECTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/sound-generation")
async def generate_sound_effect(
    text: str = Form(...),
    duration_seconds: float = Form(5.0),
    session: Session = Depends(get_session)
):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/sound-generation",
                    headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                    json={"text": text, "duration_seconds": duration_seconds}
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    history = GenerationHistory(
                        voice_id="sfx", text=text,
                        audio_file_path=filename, gen_type="sfx"
                    )
                    session.add(history)
                    session.commit()
                    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
        except Exception:
            pass

    communicate = edge_tts.Communicate(f"Sound effect: {text}", "en-US-BrianNeural")
    await communicate.save(filepath)
    history = GenerationHistory(
        voice_id="sfx", text=text,
        audio_file_path=filename, gen_type="sfx"
    )
    session.add(history)
    session.commit()
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. MUSIC GENERATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/music-generation")
async def generate_music(req: MusicGenerationRequest, session: Session = Depends(get_session)):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                payload = {"text": req.text, "duration_seconds": req.duration_seconds}
                if req.genre:
                    payload["genre"] = req.genre
                if req.mood:
                    payload["mood"] = req.mood
                response = await client.post(
                    f"{API_BASE_URL}/music-generation",
                    headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                    json=payload
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    history = GenerationHistory(
                        voice_id="music", text=req.text,
                        audio_file_path=filename, gen_type="music"
                    )
                    session.add(history)
                    session.commit()
                    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
        except Exception:
            pass

    # Fallback: generate a tone/melody
    try:
        import numpy as np
        from scipy.io.wavfile import write as wav_write
        sr_rate = 22050
        duration = max(1.0, min(req.duration_seconds, 30.0))
        t = np.linspace(0, duration, int(sr_rate * duration), endpoint=False)
        base_freq = 220 + (hash(req.text) % 400)
        melody = np.sin(2 * np.pi * base_freq * t) * 0.3
        melody += np.sin(2 * np.pi * base_freq * 1.25 * t) * 0.15
        envelope = np.exp(-2 * t / duration)
        melody = melody * envelope
        fade_len = int(sr_rate * 0.1)
        if fade_len > 0:
            fade_in = np.linspace(0, 1, fade_len)
            fade_out = np.linspace(1, 0, fade_len)
            melody[:fade_len] *= fade_in
            melody[-fade_len:] *= fade_out
        melody_int = np.int16(melody * 32767 * 0.6)
        wav_path = filepath.replace('.mp3', '.wav')
        wav_write(wav_path, sr_rate, melody_int)
        from pydub import AudioSegment
        AudioSegment.from_wav(wav_path).export(filepath, format="mp3")
        if os.path.exists(wav_path):
            os.remove(wav_path)
    except Exception:
        communicate = edge_tts.Communicate(f"Music: {req.text}", "en-US-JennyNeural")
        await communicate.save(filepath)

    history = GenerationHistory(
        voice_id="music", text=req.text,
        audio_file_path=filename, gen_type="music"
    )
    session.add(history)
    session.commit()
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. VOICE ISOLATOR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/voice-isolator")
async def voice_isolator(
    audio: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}_vocals.mp3"
    audio_content = await audio.read()
    validate_audio_file(audio.filename, audio_content)
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/voice-isolator",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    files={"audio": (audio.filename, audio_content, audio.content_type)}
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    history = GenerationHistory(
                        voice_id="isolator", text=f"[Isolated from {audio.filename}]",
                        audio_file_path=filename, gen_type="isolator"
                    )
                    session.add(history)
                    session.commit()
                    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
        except Exception:
            pass

    # Fallback: basic high-pass + low-pass filtering using pydub
    try:
        from pydub import AudioSegment
        from pydub.scipy_effects import low_pass_filter, high_pass_filter
        seg = AudioSegment.from_file(io.BytesIO(audio_content))
        # Simple isolation: apply mild filtering to simulate voice isolation
        isolated = low_pass_filter(seg, 4000)
        isolated = high_pass_filter(isolated, 200)
        isolated.export(filepath, format="mp3")
    except Exception:
        # Direct passthrough as fallback
        with open(filepath, "wb") as f:
            f.write(audio_content)

    history = GenerationHistory(
        voice_id="isolator", text=f"[Isolated from {audio.filename}]",
        audio_file_path=filename, gen_type="isolator"
    )
    session.add(history)
    session.commit()
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. VOICE CLONING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/voices/add")
async def add_voice(name: str = Form(...), description: str = Form(""), files: List[UploadFile] = File(...)):
    files_to_upload = []
    for f in files:
        content = await f.read()
        validate_audio_file(f.filename, content)
        files_to_upload.append(("files", (f.filename, content, f.content_type)))
    if has_api_key():
        url = f"{API_BASE_URL}/voices/add"
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        data = {"name": name, "description": description}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, headers=headers, data=data, files=files_to_upload)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)
            return response.json()
    else:
        new_voice_id = f"cloned_{uuid.uuid4().hex[:8]}"
        new_voice = {
            "voice_id": new_voice_id,
            "name": name,
            "category": "cloned",
            "labels": {"accent": "cloned", "gender": "unknown", "age": "unknown", "use_case": "cloned", "collection": "custom"}
        }
        MOCK_VOICES.append(new_voice)
        return {"voice_id": new_voice_id}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. VOICE DESIGN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class VoiceDesignRequest(BaseModel):
    gender: str = "female"
    age: str = "young"
    accent: str = "american"
    accent_strength: float = 1.0
    text: str = "Hello, this is a sample of my designed voice."

@app.post("/api/v1/voice-generation/generate-voice")
async def generate_voice_design(req: VoiceDesignRequest):
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/voice-generation/generate-voice",
                    headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                    json={
                        "gender": req.gender, "age": req.age,
                        "accent": req.accent, "accent_strength": req.accent_strength,
                        "text": req.text
                    }
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)
        except Exception:
            pass

    voice = "en-US-GuyNeural" if req.gender == "male" else "en-US-AriaNeural"
    communicate = edge_tts.Communicate(req.text, voice)
    await communicate.save(filepath)
    return FileResponse(filepath, media_type="audio/mpeg", filename=filename)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 10. DUBBING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/dubbing")
async def create_dubbing(
    source_lang: str = Form("auto"),
    target_lang: str = Form("es"),
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    job_id = str(uuid.uuid4())
    content = await file.read()
    validate_audio_file(file.filename, content)
    source_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    with open(source_path, "wb") as f:
        f.write(content)

    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/dubbing",
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    data={"source_lang": source_lang, "target_lang": target_lang},
                    files={"file": (file.filename, content, file.content_type)}
                )
                if response.status_code == 200:
                    result = response.json()
                    job = DubbingJob(
                        job_id=result.get("dubbing_id", job_id),
                        source_language=source_lang, target_language=target_lang,
                        status="processing", source_file_path=source_path
                    )
                    session.add(job)
                    session.commit()
                    return result
        except Exception:
            pass

    job = DubbingJob(
        job_id=job_id, source_language=source_lang, target_language=target_lang,
        status="completed", source_file_path=source_path
    )
    session.add(job)
    session.commit()
    return {"dubbing_id": job_id, "status": "completed (mock)"}

@app.get("/api/v1/dubbing/{dubbing_id}")
async def get_dubbing_status(dubbing_id: str, session: Session = Depends(get_session)):
    job = session.exec(select(DubbingJob).where(DubbingJob.job_id == dubbing_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Dubbing job not found")
    return {"dubbing_id": job.job_id, "status": job.status, "target_language": job.target_language}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 11. CONVERSATIONAL AI (Agents)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/agents/create")
def create_agent(req: AgentCreateRequest, session: Session = Depends(get_session)):
    agent_id = f"agent_{uuid.uuid4().hex[:12]}"
    widget_id = f"widget_{uuid.uuid4().hex[:8]}"
    agent = Agent(
        agent_id=agent_id, name=req.name,
        system_prompt=req.system_prompt,
        first_message=req.first_message,
        voice_id=req.voice_id,
        widget_id=widget_id
    )
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return {
        "agent_id": agent.agent_id,
        "name": agent.name,
        "widget_id": agent.widget_id,
        "voice_id": agent.voice_id
    }

@app.get("/api/v1/agents")
def list_agents(session: Session = Depends(get_session)):
    agents = session.exec(select(Agent)).all()
    return {"agents": [
        {"agent_id": a.agent_id, "name": a.name, "voice_id": a.voice_id,
         "phone_number": a.phone_number, "widget_id": a.widget_id}
        for a in agents
    ]}

@app.post("/api/v1/agents/{agent_id}/deploy/phone")
def deploy_agent_to_phone(agent_id: str, session: Session = Depends(get_session)):
    agent = session.exec(select(Agent).where(Agent.agent_id == agent_id)).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    phone = f"+1 (555) {uuid.uuid4().int % 10000:04d}"
    agent.phone_number = phone
    session.add(agent)
    session.commit()
    return {"agent_id": agent_id, "phone_number": phone, "status": "active"}

@app.post("/api/v1/agents/{agent_id}/deploy/widget")
def deploy_agent_widget(agent_id: str, session: Session = Depends(get_session)):
    agent = session.exec(select(Agent).where(Agent.agent_id == agent_id)).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    embed_code = f'<elevenlabs-agent agent-id="{agent_id}"></elevenlabs-agent>\n<script src="https://elevenlabs.io/convai-widget/index.js"></script>'
    return {"agent_id": agent_id, "widget_id": agent.widget_id, "embed_code": embed_code}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 12. PROJECTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/projects/create")
def create_project(req: ProjectCreateRequest, session: Session = Depends(get_session)):
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    project = Project(
        project_id=project_id,
        name=req.name,
        paragraphs_json=json.dumps(req.paragraphs)
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return {"project_id": project.project_id, "name": project.name}

@app.get("/api/v1/projects")
def list_projects(session: Session = Depends(get_session)):
    projects = session.exec(select(Project)).all()
    return {"projects": [
        {"project_id": p.project_id, "name": p.name, "created_at": str(p.created_at)}
        for p in projects
    ]}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 13. AUDIO NATIVE / READER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/v1/reader/articles")
async def create_article(req: ArticleCreateRequest, session: Session = Depends(get_session)):
    article_id = f"art_{uuid.uuid4().hex[:12]}"
    file_id = str(uuid.uuid4())
    filename = f"{file_id}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    if has_api_key():
        payload = {"text": req.content, "model_id": req.model_id}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{API_BASE_URL}/text-to-speech/{req.voice_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                    json=payload
                )
                if response.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(response.content)
                else:
                    await fallback_tts(req.content, req.voice_id, filepath, req.language, req.genre)
        except Exception:
            await fallback_tts(req.content, req.voice_id, filepath, req.language, req.genre)
    else:
        await fallback_tts(req.content, req.voice_id, filepath, req.language, req.genre)

    article = Article(
        article_id=article_id,
        title=req.title,
        content=req.content,
        audio_file_path=filename,
        voice_id=req.voice_id
    )
    session.add(article)
    session.commit()
    session.refresh(article)
    return {
        "article_id": article.article_id,
        "title": article.title,
        "created_at": str(article.created_at),
        "audio_url": f"/api/v1/audio/{filename}"
    }

@app.get("/api/v1/reader/articles")
def list_articles(session: Session = Depends(get_session)):
    articles = session.exec(select(Article).order_by(Article.created_at.desc())).all()
    return {"articles": [
        {
            "article_id": a.article_id,
            "title": a.title,
            "created_at": str(a.created_at),
            "audio_url": f"/api/v1/audio/{a.audio_file_path}" if a.audio_file_path else None
        }
        for a in articles
    ]}

@app.get("/api/v1/reader/articles/{article_id}")
def get_article(article_id: str, session: Session = Depends(get_session)):
    article = session.exec(select(Article).where(Article.article_id == article_id)).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return {
        "article_id": article.article_id,
        "title": article.title,
        "content": article.content,
        "voice_id": article.voice_id,
        "created_at": str(article.created_at),
        "audio_url": f"/api/v1/audio/{article.audio_file_path}" if article.audio_file_path else None
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 14. HISTORY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/history")
def get_history(session: Session = Depends(get_session)):
    items = session.exec(select(GenerationHistory).order_by(GenerationHistory.created_at.desc())).all()
    return {"history": [
        {
            "id": h.id,
            "voice_id": h.voice_id,
            "text": h.text,
            "gen_type": h.gen_type,
            "audio_file_path": h.audio_file_path,
            "character_count": h.character_count,
            "created_at": str(h.created_at)
        }
        for h in items
    ]}

@app.delete("/api/v1/history/{item_id}")
def delete_history_item(item_id: int, session: Session = Depends(get_session)):
    item = session.get(GenerationHistory, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="History item not found")
    filepath = os.path.join(AUDIO_DIR, item.audio_file_path)
    if os.path.exists(filepath):
        os.remove(filepath)
    session.delete(item)
    session.commit()
    return {"status": "deleted"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 15. TRANSCRIPTION HISTORY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/speech-to-text/history")
def get_transcription_history(session: Session = Depends(get_session)):
    jobs = session.exec(select(TranscriptionJob).order_by(TranscriptionJob.created_at.desc())).all()
    return {"transcriptions": [
        {
            "job_id": j.job_id,
            "status": j.status,
            "text": j.transcript_text,
            "language": j.language,
            "created_at": str(j.created_at)
        }
        for j in jobs
    ]}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 16. AUDIO FILE SERVING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/audio/{filename}")
def get_audio(filename: str):
    filepath = os.path.join(AUDIO_DIR, filename)
    if os.path.exists(filepath):
        return FileResponse(filepath, media_type="audio/mpeg")
    raise HTTPException(status_code=404, detail="Audio file not found.")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 17. MODELS INFO
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/models")
async def get_models():
    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{API_BASE_URL}/models",
                    headers={"xi-api-key": ELEVENLABS_API_KEY}
                )
                if response.status_code == 200:
                    return response.json()
        except Exception:
            pass

    return [
        {"model_id": "eleven_monolingual_v1", "name": "Eleven Monolingual v1",
         "description": "Standard English TTS model with great quality."},
        {"model_id": "eleven_multilingual_v2", "name": "Eleven Multilingual v2",
         "description": "Multilingual model supporting 29 languages."},
        {"model_id": "eleven_turbo_v2", "name": "Eleven Turbo v2",
         "description": "Low-latency model optimized for real-time use."},
        {"model_id": "eleven_english_sts_v2", "name": "Eleven English STS v2",
         "description": "Speech-to-Speech model for voice conversion."},
        {"model_id": "scribe_v2", "name": "Scribe v2",
         "description": "State-of-the-art speech-to-text with speaker diarization."},
        {"model_id": "eleven_music_v1", "name": "Eleven Music v1",
         "description": "Generate music from text descriptions."},
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 18. USER INFO & SUBSCRIPTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/user")
async def get_user_info():
    if has_api_key():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{API_BASE_URL}/user",
                    headers={"xi-api-key": ELEVENLABS_API_KEY}
                )
                if response.status_code == 200:
                    return response.json()
        except Exception:
            pass

    return {
        "subscription": {
            "tier": "free",
            "character_count": 0,
            "character_limit": 10000,
            "voice_limit": 10,
        },
        "xi_api_key": "****" if has_api_key() else "not_set"
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 19. TEXT-TO-SPEECH HISTORY (DELETE endpoint)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.delete("/api/v1/speech-to-text/history/{job_id}")
def delete_transcription_job(job_id: str, session: Session = Depends(get_session)):
    job = session.exec(select(TranscriptionJob).where(TranscriptionJob.job_id == job_id)).first()
    if not job:
        raise HTTPException(status_code=404, detail="Transcription job not found")
    session.delete(job)
    session.commit()
    return {"status": "deleted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
