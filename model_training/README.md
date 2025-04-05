# Sentiment Model Training

This directory contains tools for training and deploying sentiment analysis models for the Kick Chat Mood Meter extension.

## Requirements

Install the required Python packages with:

```bash
pip install -r requirements.txt
```

## Training a Sentiment Model

### Step 1: Export Labeled Data

1. Use the Kick Chat Mood Meter extension to label messages
2. Click the "Export Labeled Data" button to generate a CSV file

### Step 2: Train the Model

Use the `train_sentiment_model.py` script to train a model:

```bash
python train_sentiment_model.py path/to/labeled_messages.csv
```

Optional parameters:
- `--output, -o`: Specify an output path for the model (default: sentiment_model.pkl)
- `--include-neutral, -n`: Include neutral messages in training (default: only positive/negative)

Example:
```bash
python train_sentiment_model.py kick_sentiment_training_1620145678.csv --output my_model.pkl
```

### Step 3: Prepare the Model for the Extension

Convert the trained model to a format usable by JavaScript:

```bash
python prepare_model_for_extension.py sentiment_model.pkl
```

Optional parameters:
- `--output, -o`: Specify the output JSON file (default: sentiment_model.json)
- `--create-sample, -s`: Create a sample JavaScript file showing how to use the model

Example:
```bash
python prepare_model_for_extension.py my_model.pkl --output my_model.json --create-sample
```

### Step 4: Deploy the Model

1. Copy the generated JSON model file to your extension directory
2. The extension will automatically use the new model for sentiment analysis

## File Descriptions

- `train_sentiment_model.py`: Trains a sentiment analysis model from labeled data
- `prepare_model_for_extension.py`: Converts scikit-learn models to JavaScript-compatible format
- `requirements.txt`: Required Python packages
- `models/`: Directory for storing trained models

## Advanced Usage

### Custom Training Data

If you have custom training data from other sources, ensure it's in the format:
```
message,sentiment_label
"This is a positive message","Positive"
"This is a negative comment","Negative"
"Just a neutral statement","Neutral"
```

### Model Performance Tuning

You can modify the `train_sentiment_model.py` script to tune hyperparameters:
- Adjust `max_features` in TfidfVectorizer to control vocabulary size
- Modify `C` in LogisticRegression to adjust regularization strength
- Change `ngram_range` to capture different word patterns

### JavaScript Implementation

The extension uses a simplified version of the scikit-learn model. The core functionality is:
1. Text preprocessing
2. Feature extraction using TF-IDF
3. Classification using logistic regression

See the sample JavaScript file for implementation details.