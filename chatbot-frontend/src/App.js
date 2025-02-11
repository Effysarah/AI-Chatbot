from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import openai
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Integer
from sqlalchemy.orm import sessionmaker, declarative_base
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta

# Initialize FastAPI app
app = FastAPI()

# CORS Middleware to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load OpenAI API Key
openai.api_key = "your_openai_api_key"

# Database Configuration
DATABASE_URL = "sqlite:///./chatbot.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Secret Key
SECRET_KEY = "your_secret_key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# User Model
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)

Base.metadata.create_all(bind=engine)

# Define request model
class ChatRequest(BaseModel):
    user_message: str
    language: str = "en"

# FAQ Data (Can be replaced with a database in production)
FAQS = {
    "en": {
        "What are your working hours?": "Our support team is available 24/7.",
        "How can I reset my password?": "You can reset your password by clicking on 'Forgot Password' on the login page.",
        "Do you offer refunds?": "Yes, we offer refunds within 30 days of purchase."
    },
    "es": {
        "What are your working hours?": "Nuestro equipo de soporte está disponible 24/7.",
        "How can I reset my password?": "Puede restablecer su contraseña haciendo clic en 'Olvidé mi contraseña' en la página de inicio de sesión.",
        "Do you offer refunds?": "Sí, ofrecemos reembolsos dentro de los 30 días posteriores a la compra."
    }
}

# Authentication
class AuthRequest(BaseModel):
    username: str
    password: str

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/register/")
def register_user(request: AuthRequest):
    db = SessionLocal()
    hashed_password = get_password_hash(request.password)
    new_user = User(username=request.username, password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    db.close()
    return {"message": "User registered successfully"}

@app.post("/login/")
def login_user(request: AuthRequest):
    db = SessionLocal()
    user = db.query(User).filter(User.username == request.username).first()
    db.close()
    if user and verify_password(request.password, user.password):
        token = create_access_token({"sub": user.username})
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

# Chatbot Endpoint
@app.post("/chat/")
async def chatbot(request: ChatRequest):
    user_message = request.user_message
    language = request.language if request.language in FAQS else "en"
    
    # Check if query matches an FAQ
    if user_message in FAQS[language]:
        return {"bot_response": FAQS[language][user_message]}
    
    # Generate AI response
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful customer support assistant."},
                {"role": "user", "content": user_message}
            ]
        )
        bot_message = response["choices"][0]["message"]["content"]
        return {"bot_response": bot_message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

