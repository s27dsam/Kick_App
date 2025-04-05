# Kick Mood Meter

A Chrome extension that analyzes chat sentiment on Kick.com livestreams and displays real-time mood data with an interactive on-screen widget.

![Kick Mood Meter Logo](images/Mood_Meter.png)

## Overview

Kick Mood Meter helps streamers and viewers understand the overall sentiment of chat in real-time. The extension analyzes messages in the chat and categorizes them as positive, neutral, or negative, providing valuable insights into the audience's mood during streams.

## Features

- **Live Sentiment Analysis**: Monitors chat messages and performs sentiment analysis in real-time
- **Movable On-Screen Widget**: Displays current chat mood directly on the stream page
- **Mood Visualization**: Shows mood distribution with an intuitive meter and color-coded indicators
- **Detailed Statistics**: Provides percentage breakdowns of positive, neutral, and negative sentiment
- **Customizable Settings**: Adjust widget transparency and update frequency
- **Easy Positioning**: Double-click to enable drag mode and position the widget anywhere on screen
- **Training Mode**: Label messages to improve the sentiment model

## Project Structure

- **Chrome Extension Files**:
  - `manifest.json`: Extension configuration
  - `popup.html/js`: Extension popup interface
  - `content.js`: Main logic for analyzing chat and displaying the widget
  - `images/`: Extension icons and graphics

- **Model Training**:
  - `model_training/`: Tools for training and exporting the sentiment model
  - `model_training/README.md`: Detailed instructions for model training

## Installation

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. Navigate to any Kick.com channel page to see the widget in action

## Using the Extension

### Viewing Sentiment Data

- The widget automatically appears on any Kick.com channel page
- The mood meter shows the current sentiment level from positive (left) to negative (right)
- Click the extension icon to see detailed statistics

### Widget Controls

- **Show/Hide**: Use the toggle button to show or hide the widget
- **Collect Chat**: Manually trigger collection and analysis of current chat
- **Positioning**: Double-click the widget to enter drag mode, then drag it to your preferred location
- **Exit Drag Mode**: Double-click again or press ESC

### Training the Sentiment Model

1. Click the "Train Sentiment Model" button in the extension popup
2. Label individual messages as Positive, Neutral, or Negative
3. The labeled messages are stored locally
4. Click "Export Labeled Data" to save a CSV file for model training

## Training a Custom Sentiment Model

See the [model training README](model_training/README.md) for detailed instructions on:
- Using labeled data to train a new model
- Converting the model for use in the extension
- Deploying the updated model

## How It Works

The extension analyzes chat messages using machine learning-based sentiment analysis:

1. **Data Collection**: Collects and filters chat messages from the stream
2. **Sentiment Analysis**: Processes messages using a trained model
3. **Mood Calculation**: Determines the overall mood based on the distribution of sentiment
4. **Visualization**: Updates the widget to reflect the current mood state

## Privacy

- All analysis happens locally in your browser
- No chat data is sent to external servers
- No user data is collected or stored outside your browser storage
