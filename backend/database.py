from sqlmodel import SQLModel, Field, create_engine, Session
from typing import Optional
from datetime import datetime

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str

class Voice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    voice_id: str = Field(unique=True, index=True) # The ID from elevenlabs
    name: str
    category: str = Field(default="premade") # premade, cloned, professional, designed
    description: Optional[str] = None
    preview_url: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")

class GenerationHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(default=1)
    voice_id: str
    text: str
    gen_type: str = Field(default="tts")  # tts, sts, sfx, dubbing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    audio_file_path: str # Path to the saved mp3 file
    character_count: int = Field(default=0)

class Agent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    agent_id: str = Field(unique=True, index=True)
    name: str = Field(default="My Agent")
    system_prompt: str = Field(default="You are a helpful assistant.")
    first_message: str = Field(default="Hello! How can I help you today?")
    voice_id: str = Field(default="21m00Tcm4TlvDq8ikWAM")  # Rachel
    phone_number: Optional[str] = None
    widget_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(default=1)

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: str = Field(unique=True, index=True)
    name: str = Field(default="Untitled Project")
    paragraphs_json: str = Field(default="[]")  # JSON string of paragraphs
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(default=1)

class DubbingJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(unique=True, index=True)
    source_language: str = Field(default="auto")
    target_language: str = Field(default="es")
    status: str = Field(default="pending")  # pending, processing, completed, failed
    source_file_path: Optional[str] = None
    output_file_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(default=1)

class TranscriptionJob(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(unique=True, index=True)
    status: str = Field(default="completed")
    audio_file_path: Optional[str] = None
    transcript_text: Optional[str] = None
    language: str = Field(default="en")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(default=1)

class Article(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    article_id: str = Field(unique=True, index=True)
    title: str
    content: str
    audio_file_path: Optional[str] = None
    voice_id: str = Field(default="21m00Tcm4TlvDq8ikWAM")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    owner_id: int = Field(default=1)

sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
