#!/usr/bin/env python3
import pandas as pd
import pickle
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, accuracy_score

# Load the data
print("Loading and processing data...")
df = pd.read_csv('kick_sentiment_training_1743826271698.csv')

# Remove any empty messages
df = df[~(df['message'].isna() | (df['message'] == ''))]

# Print data statistics
print(f"Loaded {len(df)} messages")
print("\nSentiment distribution:")
sentiment_counts = df['sentiment_label'].value_counts()
for sentiment, count in sentiment_counts.items():
    print(f"  {sentiment}: {count} messages ({count/len(df)*100:.1f}%)")

# Split into train and test sets
X_train, X_test, y_train, y_test = train_test_split(
    df['message'], 
    df['sentiment_label'], 
    test_size=0.2, 
    random_state=42,
    stratify=df['sentiment_label']
)

print(f"\nTraining set: {len(X_train)} messages")
print(f"Testing set: {len(X_test)} messages")

# Create and train the model
print("\nTraining the model...")
model = Pipeline([
    ('tfidf', TfidfVectorizer(max_features=10000, min_df=2, ngram_range=(1, 2))),
    ('classifier', LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42))
])

model.fit(X_train, y_train)

# Evaluate the model
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"\nModel accuracy: {accuracy:.2f}")
print("\nClassification report:")
print(classification_report(y_test, y_pred))

# Save the model
print("\nSaving model...")
with open('sentiment_model.pkl', 'wb') as f:
    pickle.dump(model, f)
print("Model saved to sentiment_model.pkl")

# Test the model on some sample messages
test_samples = [
    "hahahaha this is so funny",
    "skip this game its shit",
    "love the stream keep it up",
    "fuck you suck",
    "LOL"
]

print("\nTesting model on samples:")
for text in test_samples:
    prediction = model.predict([text])[0]
    proba = model.predict_proba([text])[0]
    class_labels = model.classes_
    
    print(f"\nText: {text}")
    print(f"Prediction: {prediction}")
    print("Confidence scores:")
    for cls, prob in zip(class_labels, proba):
        print(f"  {cls}: {prob:.2f}")

print("\nDone! The model is ready to use.")