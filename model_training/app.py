from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
import uvicorn
from pydantic import BaseModel
import pandas as pd
import os
import pickle
from datetime import datetime
from typing import List, Dict, Optional, Any
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LinearRegression
import numpy as np
import logging
import traceback
import json

# Initialize FastAPI app
app = FastAPI(title="Kick Chat Sentiment Labeler")

# Setup logging
os.makedirs("model_training/data", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("model_training/data/app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("KickSentimentApp")

# Setup templates and static files
templates = Jinja2Templates(directory="model_training/templates")
app.mount("/static", StaticFiles(directory="model_training/static"), name="static")

# Classes for data models
class Message(BaseModel):
    username: str
    message: str
    sentiment: Optional[float] = None
    batch_id: Optional[str] = None

class MessageBatch(BaseModel):
    batch_id: str
    channel_name: str
    timestamp: datetime
    messages: List[Message] = []
    sentiment_score: Optional[float] = None

class Channel(BaseModel):
    url: str
    name: str
    messages: List[Message] = []
    batches: List[MessageBatch] = []
    
# Global data store
channels_data = {}
current_messages = []

# Utility function to save data
def save_data():
    try:
        os.makedirs("model_training/data", exist_ok=True)
        with open("model_training/data/channels_data.pkl", "wb") as f:
            pickle.dump(channels_data, f)
        logger.info("Data saved successfully")
    except Exception as e:
        logger.error(f"Error saving data: {e}")
        logger.error(traceback.format_exc())

# Utility function to load data
def load_data():
    global channels_data
    try:
        if os.path.exists("model_training/data/channels_data.pkl"):
            with open("model_training/data/channels_data.pkl", "rb") as f:
                channels_data = pickle.load(f)
            logger.info(f"Loaded data with {len(channels_data)} channels")
        else:
            channels_data = {}
            logger.info("No existing data found, starting with empty data")
    except Exception as e:
        logger.error(f"Error loading data: {e}")
        logger.error(traceback.format_exc())
        channels_data = {}

# Load data at startup
@app.on_event("startup")
def startup_event():
    # Make sure directories exist
    os.makedirs("model_training/data", exist_ok=True)
    os.makedirs("model_training/models", exist_ok=True)
    load_data()

# Helper function to count labeled messages
def count_labeled_messages():
    count = 0
    batch_count = 0
    
    for channel_data in channels_data.values():
        # Count labeled batches
        for batch in channel_data.batches:
            if batch.sentiment_score is not None:
                batch_count += 1
                count += len(batch.messages)  # All messages in a rated batch are considered labeled
    
    return count, batch_count

# Helper function to check if model is trained
def is_model_trained():
    return os.path.exists("model_training/models/sentiment_model.joblib") and os.path.exists("model_training/models/vectorizer.joblib")

# Helper function to get model accuracy
def get_model_accuracy():
    if is_model_trained():
        return 85.5  # Placeholder - in a real app you'd calculate this
    return 0

# Routes
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    total_labeled, batch_count = count_labeled_messages()
    
    return templates.TemplateResponse("index.html", {
        "request": request,
        "channels": channels_data,
        "total_labeled": total_labeled,
        "batch_count": batch_count,
        "model_trained": is_model_trained(),
        "model_accuracy": get_model_accuracy()
    })

@app.post("/manual_scrape")
async def manual_scrape(request: Request):
    """
    Handle manually pasted chat data
    """
    data = await request.json()
    
    try:
        channel_name = data.get("channel_name", "Unknown Channel")
        url = data.get("url", "https://kick.com/" + channel_name)
        
        # Get the messages from the request
        messages_data = data.get("messages", [])
        
        # Convert to Message objects
        messages = [
            Message(username=msg.get("username", "Unknown"), message=msg.get("message", ""))
            for msg in messages_data if "message" in msg and msg.get("message").strip()
        ]
        
        if not messages:
            raise HTTPException(status_code=400, detail="No valid messages provided")
            
        # Create a new batch ID
        batch_id = f"{channel_name}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Store in our global channels data
        global current_messages
        current_messages = messages
        
        # Create or update channel
        if channel_name not in channels_data:
            channels_data[channel_name] = Channel(url=url, name=channel_name, messages=[], batches=[])
        
        # Add any new messages that don't exist yet
        existing_messages = {msg.message for msg in channels_data[channel_name].messages}
        
        # Add batch ID to messages
        for msg in messages:
            msg.batch_id = batch_id
            if msg.message not in existing_messages:
                channels_data[channel_name].messages.append(msg)
        
        # Create a new batch
        new_batch = MessageBatch(
            batch_id=batch_id,
            channel_name=channel_name,
            timestamp=datetime.now(),
            messages=messages
        )
        
        # Add the batch to the channel
        channels_data[channel_name].batches.append(new_batch)
        
        # Save data
        save_data()
        
        logger.info(f"Successfully created batch with {len(messages)} messages for channel {channel_name}")
        
        # Return success with batch_id
        return {
            "success": True,
            "batch_id": batch_id,
            "channel_name": channel_name,
            "message_count": len(messages)
        }
        
    except Exception as e:
        logger.error(f"Error in manual_scrape: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error processing chat data: {str(e)}")

@app.get("/channel/{channel_name}", response_class=HTMLResponse)
async def view_channel(request: Request, channel_name: str, batch_id: str = None):
    if channel_name not in channels_data:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    global current_messages
    
    # If no batch_id was provided, create a new batch if we have current messages
    if not batch_id and current_messages:
        batch_id = f"{channel_name}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Add batch ID to messages
        for msg in current_messages:
            msg.batch_id = batch_id
            
        # Create a new batch
        new_batch = MessageBatch(
            batch_id=batch_id,
            channel_name=channel_name,
            timestamp=datetime.now(),
            messages=current_messages
        )
        
        # Add batch to channel
        if not any(b.batch_id == batch_id for b in channels_data[channel_name].batches):
            channels_data[channel_name].batches.append(new_batch)
        
        # Add messages to channel messages list
        existing_messages = {msg.message for msg in channels_data[channel_name].messages}
        for msg in current_messages:
            if msg.message not in existing_messages:
                channels_data[channel_name].messages.append(msg)
        
        # Save data
        save_data()
    
    # If batch_id was provided or created, use that batch's messages
    if batch_id:
        batch = next((b for b in channels_data[channel_name].batches if b.batch_id == batch_id), None)
        messages_to_show = batch.messages if batch else []
    # Otherwise, show the most recent batch's messages or all messages
    else:
        batches = channels_data[channel_name].batches
        if batches:
            latest_batch = max(batches, key=lambda b: b.timestamp)
            messages_to_show = latest_batch.messages
            batch_id = latest_batch.batch_id
        else:
            messages_to_show = channels_data[channel_name].messages
            
    # Sort batches by timestamp (newest first)
    sorted_batches = sorted(
        channels_data[channel_name].batches, 
        key=lambda b: b.timestamp,
        reverse=True
    )
    
    # Reset current messages
    current_messages = []
    
    return templates.TemplateResponse("channel.html", {
        "request": request,
        "channel_name": channel_name,
        "batch_id": batch_id,
        "messages": messages_to_show,
        "batches": sorted_batches,
        "model_trained": is_model_trained()
    })

@app.post("/label_batch")
async def label_batch(
    request: Request,
    channel_name: str = Form(...),
    batch_id: str = Form(...),
    batch_sentiment: float = Form(...)
):
    if channel_name not in channels_data:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    # Find the batch
    batch = next((b for b in channels_data[channel_name].batches if b.batch_id == batch_id), None)
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Update the batch sentiment score
    batch.sentiment_score = batch_sentiment
    
    # Update sentiment for all messages in this batch
    for msg in batch.messages:
        # Also update in the main messages list
        for channel_msg in channels_data[channel_name].messages:
            if channel_msg.message == msg.message and channel_msg.username == msg.username:
                channel_msg.sentiment = batch_sentiment
        
        # Update in the batch
        msg.sentiment = batch_sentiment
    
    # Save updated data
    save_data()
    
    return RedirectResponse(url=f"/channel/{channel_name}?batch_id={batch_id}", status_code=303)

@app.post("/get_latest_messages")
async def get_latest_messages(request: Request):
    """
    Get the latest messages for a channel
    """
    data = await request.json()
    channel_name = data.get("channel_name")
    
    if not channel_name:
        raise HTTPException(status_code=400, detail="Channel name is required")
        
    if channel_name not in channels_data:
        return {"messages": []}
    
    # Get the most recent batch
    channel = channels_data[channel_name]
    if not channel.batches:
        return {"messages": []}
        
    # Sort batches by timestamp (newest first)
    sorted_batches = sorted(channel.batches, key=lambda b: b.timestamp, reverse=True)
    latest_batch = sorted_batches[0]
    
    # Convert messages to dict for JSON response
    messages = [
        {
            "username": msg.username,
            "message": msg.message,
            "sentiment": msg.sentiment
        }
        for msg in latest_batch.messages
    ]
    
    return {
        "batch_id": latest_batch.batch_id,
        "timestamp": latest_batch.timestamp.isoformat(),
        "sentiment_score": latest_batch.sentiment_score,
        "messages": messages
    }

@app.post("/train_model")
async def train_model():
    # Check if we have enough labeled data
    labeled_count, batch_count = count_labeled_messages()
    if labeled_count < 5:  # Reduced minimum for testing
        raise HTTPException(status_code=400, detail="Not enough labeled data (need at least 5 messages)")
    
    try:
        # Prepare training data
        texts = []
        sentiments = []
        
        for channel_data in channels_data.values():
            # Get messages from rated batches
            for batch in channel_data.batches:
                if batch.sentiment_score is not None:
                    for msg in batch.messages:
                        texts.append(msg.message)
                        sentiments.append(batch.sentiment_score)  # Use the batch sentiment for all messages
        
        # Create a DataFrame for easier handling
        df = pd.DataFrame({"text": texts, "sentiment": sentiments})
        
        # Save training data to CSV for future reference
        df.to_csv("model_training/data/labeled_chat_messages.csv", index=False)
        
        # Feature extraction
        vectorizer = TfidfVectorizer(max_features=1000)
        X = vectorizer.fit_transform(df["text"])
        y = df["sentiment"]
        
        # Train model (simple linear regression)
        model = LinearRegression()
        model.fit(X, y)
        
        # Save model and vectorizer
        os.makedirs("model_training/models", exist_ok=True)
        joblib.dump(model, "model_training/models/sentiment_model.joblib")
        joblib.dump(vectorizer, "model_training/models/vectorizer.joblib")
        
        logger.info(f"Model trained successfully with {len(texts)} messages")
        
        return RedirectResponse(url="/", status_code=303)
    
    except Exception as e:
        logger.error(f"Error training model: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error training model: {str(e)}")

@app.post("/predict_batch")
async def predict_batch(request: Request):
    data = await request.json()
    channel_name = data.get("channel_name")
    batch_id = data.get("batch_id")
    
    if channel_name not in channels_data:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if not is_model_trained():
        raise HTTPException(status_code=400, detail="Model not trained yet")
    
    # Load model and vectorizer
    model = joblib.load("model_training/models/sentiment_model.joblib")
    vectorizer = joblib.load("model_training/models/vectorizer.joblib")
    
    # Find the batch
    batch = next((b for b in channels_data[channel_name].batches if b.batch_id == batch_id), None)
    
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Get messages from the batch
    messages = batch.messages
    
    # Make predictions
    texts = [msg.message for msg in messages]
    X = vectorizer.transform(texts)
    predictions = model.predict(X)
    
    # Ensure predictions are in range [0, 1]
    predictions = np.clip(predictions, 0, 1)
    
    # Calculate average sentiment for the batch
    average_sentiment = float(np.mean(predictions))
    
    # Create response data for messages
    result_messages = []
    for i, msg in enumerate(messages):
        result_messages.append({
            "username": msg.username,
            "message": msg.message,
            "predicted_sentiment": float(predictions[i]),
            "actual_sentiment": msg.sentiment
        })
    
    # Return batch and message predictions
    return {
        "batch_id": batch_id,
        "average_sentiment": average_sentiment,
        "messages": result_messages
    }

# Entry point
if __name__ == "__main__":
    # Make sure required directories exist
    os.makedirs("model_training/data", exist_ok=True)
    os.makedirs("model_training/models", exist_ok=True)
    
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)