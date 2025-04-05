# Using Custom Sentiment Models with Kick Mood Meter

The Kick Mood Meter extension can now use a trained machine learning model for sentiment analysis. This document explains how to set up and use your trained model.

## How to Add Your Trained Model

1. After training a model using the tools in the `model_training` folder, you'll get a JSON file (typically `sentiment_model.json`)

2. Place this JSON file in the root directory of the extension (same level as `manifest.json`)

3. When the extension loads, it will automatically detect and use this model for sentiment analysis

## How It Works

The extension uses a TF-IDF + Logistic Regression model to analyze the sentiment of chat messages:

1. **Text Preprocessing**: Removes URLs, timestamps, usernames, and normalizes spacing
2. **Feature Extraction**: Converts text to TF-IDF numerical features based on the vocabulary
3. **Prediction**: Uses the trained model coefficients to classify sentiments

## Troubleshooting

If the model doesn't seem to be working:

1. Check the browser console for error messages (Right-click → Inspect → Console)
2. Verify the model file is placed in the root directory and named `sentiment_model.json`
3. Make sure the model file is properly formatted (as exported by `prepare_model_for_extension.py`)
4. Try reloading the extension from the Chrome extensions page

## Technical Details

The sentiment model is integrated in these key steps:

1. The model loads automatically when the extension starts
2. Messages are cleaned and preprocessed before analysis
3. The model predicts sentiment categories: Positive, Neutral, Negative
4. The widget displays overall sentiment based on these predictions

For detailed implementation, see the `analyzeBatchSentiment()` and related methods in `content.js`.