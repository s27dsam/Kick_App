#!/usr/bin/env python3
"""
Simplified script to convert the sentiment_model.pkl to a JavaScript-compatible format.
Includes proper handling of NumPy data types.
"""

import pickle
import json
import os
import numpy as np

# Custom JSON encoder to handle NumPy types
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

# Define input and output files
MODEL_PATH = 'sentiment_model.pkl'
OUTPUT_PATH = 'sentiment_model.json'

print(f"Loading model from {MODEL_PATH}...")

try:
    # Load the scikit-learn model
    with open(MODEL_PATH, 'rb') as f:
        model = pickle.load(f)
    
    # Extract components from the pipeline
    vectorizer = model.named_steps['tfidf']
    classifier = model.named_steps['classifier']
    
    # Get the vocabulary from the vectorizer and convert any NumPy types
    vocabulary = {str(k): int(v) for k, v in vectorizer.vocabulary_.items()}
    
    # Get the IDF values (term importance)
    idf = vectorizer.idf_.tolist()
    
    # Get the coefficients from the classifier
    if len(classifier.classes_) == 2:
        # For binary classification, scikit-learn stores one set of coefficients
        coefficients = classifier.coef_[0].tolist()
    else:
        # For multi-class, we have coefficients for each class
        coefficients = classifier.coef_.tolist()
    
    # Get the intercept(s)
    intercept = classifier.intercept_.tolist()
    
    # Get class labels and ensure they're serializable
    classes = [str(c) for c in classifier.classes_.tolist()]
    
    # Create a simplified model structure for JavaScript
    js_model = {
        'vocabulary': vocabulary,
        'idf': idf,
        'coefficients': coefficients,
        'intercept': intercept,
        'classes': classes,
        'ngram_range': list(vectorizer.ngram_range),  # Convert tuple to list
        'model_type': 'logistic_regression',
        'version': '1.0'
    }
    
    # Save the model as JSON using the custom encoder
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(js_model, f, indent=2, cls=NumpyEncoder)
    
    print(f"Model successfully converted and saved to {OUTPUT_PATH}")
    print(f"Model size: {os.path.getsize(OUTPUT_PATH) / 1024:.2f} KB")
    
    # Print model statistics
    print(f"\nModel statistics:")
    print(f"  Vocabulary size: {len(vocabulary)} terms")
    print(f"  Number of classes: {len(classes)} ({', '.join(classes)})")
    
    # Create sample JavaScript code
    SAMPLE_JS_PATH = 'sentiment_model_sample.js'
    
    sample_js = """
// Sample code for using the exported sentiment model in JavaScript

// Load the model (you would typically load this asynchronously)
const model = require('./sentiment_model.json');

// Function to predict sentiment of a message
function predictSentiment(text) {
  // Preprocess the text (lowercase, etc.)
  const processedText = text.toLowerCase().trim();
  
  // Create a feature vector using TF-IDF
  const features = extractFeatures(processedText, model.vocabulary, model.idf);
  
  // Make prediction using logistic regression
  return predict(features, model.coefficients, model.intercept, model.classes);
}

// Extract TF-IDF features from text
function extractFeatures(text, vocabulary, idf) {
  // Count term frequencies
  const termFrequencies = {};
  
  // Split into words and count frequencies
  const words = text.split(/\\s+/);
  for (const word of words) {
    if (word in vocabulary) {
      termFrequencies[vocabulary[word]] = (termFrequencies[vocabulary[word]] || 0) + 1;
    }
  }
  
  // Create and normalize feature vector
  const features = new Array(idf.length).fill(0);
  
  for (const [index, count] of Object.entries(termFrequencies)) {
    // TF-IDF = term frequency * inverse document frequency
    features[index] = count * idf[index];
  }
  
  return features;
}

// Predict using logistic regression
function predict(features, coefficients, intercept, classes) {
  // For binary classification
  if (!Array.isArray(coefficients[0])) {
    // Calculate the decision function
    let decision = intercept[0];
    for (let i = 0; i < features.length; i++) {
      decision += features[i] * coefficients[i];
    }
    
    // Convert to probability with sigmoid function
    const probability = 1 / (1 + Math.exp(-decision));
    
    // Determine class based on probability
    return probability >= 0.5 ? classes[1] : classes[0];
  } 
  // For multi-class classification
  else {
    const scores = [];
    
    // Calculate scores for each class
    for (let c = 0; c < classes.length; c++) {
      let score = intercept[c];
      for (let i = 0; i < features.length; i++) {
        score += features[i] * coefficients[c][i];
      }
      scores.push(score);
    }
    
    // Find class with highest score
    const maxIndex = scores.indexOf(Math.max(...scores));
    return classes[maxIndex];
  }
}

// Example usage
const testMessages = [
  "this stream is amazing, loving it",
  "worst content ever, so boring",
  "just joined, what's going on?",
  "let's goooo, great play!"
];

for (const message of testMessages) {
  const sentiment = predictSentiment(message);
  console.log(`Message: "${message}"`);
  console.log(`Sentiment: ${sentiment}`);
  console.log("---");
}
"""

    with open(SAMPLE_JS_PATH, 'w') as f:
        f.write(sample_js)
    
    print(f"\nSample code created at {SAMPLE_JS_PATH}")
    
    print("\n" + "=" * 60)
    print("NEXT STEPS")
    print("=" * 60)
    print("1. Copy sentiment_model.json to your extension directory")
    print("2. Use the sample code in sentiment_model_sample.js as a reference for your extension")
    print("3. Test the extension with the new model")
    
except Exception as e:
    print(f"Error converting model: {str(e)}")
    import traceback
    traceback.print_exc()  # Print full traceback for debugging