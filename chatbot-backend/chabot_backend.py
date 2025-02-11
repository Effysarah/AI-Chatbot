from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import openai
from fastapi.middleware.cors import CORSMiddleware
import logging
import smtplib
from email.mime.text import MIMEText

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

# Setup Logging
logging.basicConfig(level=logging.INFO, filename="chatbot.log", format="%(asctime)s - %(levelname)s - %(message)s")

def send_email_notification(user_message, bot_response):
    sender_email = "your_email@example.com"
    recipient_email = "support@example.com"
    subject = "New Chatbot Interaction"
    body = f"User Message: {user_message}\nBot Response: {bot_response}"

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = recipient_email

    try:
        with smtplib.SMTP("smtp.example.com", 587) as server:
            server.starttls()
            server.login("your_email@example.com", "your_email_password")
            server.sendmail(sender_email, recipient_email, msg.as_string())
    except Exception as e:
        logging.error(f"Failed to send email: {e}")

# Define request model
class ChatRequest(BaseModel):
    user_message: str

# FAQ Data (Can be replaced with a database in production)
FAQS = {
    "What are your working hours?": "Our support team is available 24/7.",
    "How can I reset my password?": "You can reset your password by clicking on 'Forgot Password' on the login page.",
    "Do you offer refunds?": "Yes, we offer refunds within 30 days of purchase."
}

# Chatbot Endpoint
@app.post("/chat/")
async def chatbot(request: ChatRequest, background_tasks: BackgroundTasks):
    user_message = request.user_message
    logging.info(f"Received message: {user_message}")
    
    # Check if query matches an FAQ
    if user_message in FAQS:
        bot_response = FAQS[user_message]
        logging.info(f"Responded with FAQ: {bot_response}")
        background_tasks.add_task(send_email_notification, user_message, bot_response)
        return {"bot_response": bot_response}
    
    # Generate AI response
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a helpful customer support assistant."},
                {"role": "user", "content": user_message}
            ]
        )
        bot_response = response["choices"][0]["message"]["content"]
        logging.info(f"Generated AI response: {bot_response}")
        background_tasks.add_task(send_email_notification, user_message, bot_response)
        return {"bot_response": bot_response}
    except Exception as e:
        logging.error(f"Error generating response: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
