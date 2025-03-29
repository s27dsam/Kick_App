import pandas as pd
from transformers import pipeline
from tqdm import tqdm

# Load CSV
df = pd.read_csv('twitch-chat-2417786167.csv')

# Load Sentiment Model
sentiment_pipeline = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment",
    device=-1, # Change to 0 if you have a GPU
    padding=True,
    truncation=True,
    max_length=512
)

# Batch processing for speed
BATCH_SIZE = 32
sentiments = []

for i in tqdm(range(0, len(df), BATCH_SIZE)):
    batch = df['message'].iloc[i:i+BATCH_SIZE].astype(str).tolist()
    results = sentiment_pipeline(batch)
    labels = [r['label'].lower() for r in results]
    sentiments.extend(labels)

# Add sentiment column
df['sentiment'] = sentiments

# Save labeled CSV
df.to_csv('labeled_chat_messages.csv', index=False)

print(df.head())
print(f"Labeled {len(df)} messages and saved to 'labeled_chat_messages.csv'")

