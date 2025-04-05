
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
  const words = text.split(/\s+/);
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
