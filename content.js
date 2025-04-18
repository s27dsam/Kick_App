// Mood detection content script
class KickMoodMeter {
  constructor() {
    this.sentimentCounts = {
      positive: 0,
      neutral: 0, 
      negative: 0
    };

    this.moodStats = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
    
    // Keep the intensifiers from original implementation
    this.intensifiers = {
      'very': 2,
      'super': 2,
      'extremely': 2.5,
      'totally': 2,
      'absolutely': 2.5,
      'really': 1.5
    };
    
    this.chatHistory = [];
    this.isCollecting = false;
    this.collectionStartTime = null;
    this.widgetCreated = false;
    this.settings = {
      transparency: 85,
      updateFrequency: 5  // Default is now 5 minutes
    };
    
    // Add feedback data storage for model training
    this.feedbackData = [];
    
    // Save the most recent mood analysis for feedback purposes
    this.lastAnalyzedMood = null;
    
    // Load settings if available
    chrome.storage.local.get(['moodMeterSettings', 'widgetPosition', 'feedbackData', 'sentimentModel'], (data) => {
      if (data.moodMeterSettings) {
        this.settings = data.moodMeterSettings;
      }
      
      // Store the saved position
      this.savedPosition = data.widgetPosition || null;
      
      // Load feedback data
      if (data.feedbackData) {
        this.feedbackData = data.feedbackData;
        console.log(`Loaded ${this.feedbackData.length} feedback entries`);
      }
      
      // Load sentiment model if available
      if (data.sentimentModel) {
        this.sentimentModel = data.sentimentModel;
        console.log('Loaded sentiment model from storage');
      } else {
        // Load the default model from the extension files
        this.loadSentimentModel();
      }
    });
    
    // Set up URL change listener
    this.setupUrlChangeListener();
  }
  
  // Method to load the sentiment model
  loadSentimentModel() {
    try {
      // Fetch the sentiment model JSON file
      fetch(chrome.runtime.getURL('sentiment_model.json'))
        .then(response => response.json())
        .then(modelData => {
          console.log('Loaded sentiment model from extension files');
          this.sentimentModel = modelData;
          
          // Save to storage for future use
          chrome.storage.local.set({ sentimentModel: modelData });
        })
        .catch(error => {
          console.error('Error loading sentiment model:', error);
          // Fall back to the basic placeholder logic
          this.sentimentModel = null;
        });
    } catch (error) {
      console.error('Error in loadSentimentModel:', error);
      this.sentimentModel = null;
    }
  }
  
  setupUrlChangeListener() {
    // Track the current URL
    this.currentUrl = window.location.href;
    
    // Watch for URL changes
    setInterval(() => {
      if (this.currentUrl !== window.location.href) {
        // URL has changed
        const previousUrl = this.currentUrl;
        this.currentUrl = window.location.href;
        console.log(`URL changed from ${previousUrl} to ${this.currentUrl}`);
        
        // Check if we're on a valid channel page
        const isChannelPage = this.isValidChannelPage();
        
        if (!isChannelPage) {
          console.log('Navigated to non-channel page, stopping analysis and hiding widget');
          
          // If we're collecting, stop immediately
          if (this.isCollecting) {
            clearInterval(this.collectionInterval);
            this.isCollecting = false;
            this.collectionStartTime = null;
          }
          
          // Hide the widget
          const widget = document.getElementById('kick-mood-widget');
          if (widget) {
            widget.style.opacity = '0';
            setTimeout(() => {
              widget.style.display = 'none';
            }, 300);
          }
          
          // Clear chat history since it's no longer relevant
          this.chatHistory = [];
          
          return;
        }
        
        // If we're here, we're on a valid channel page
        console.log('Navigated to a channel page');
        
        // Update channel name in widget
        this.updateChannelInfo();
        
        // Reset and restart collection
        this.chatHistory = [];
        this.resetSentimentCounts();
        if (this.isCollecting) {
          clearInterval(this.collectionInterval);
          this.isCollecting = false;
        }
        
        // Start new collection for new channel
        setTimeout(() => {
          this.startCollection();
        }, 1000);
      }
    }, 500); // Check more frequently (500ms instead of 1000ms)
  }

  resetSentimentCounts() {
    // Reset the counts for count-based intensity scaling
    this.sentimentCounts = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
  }

  getChannelName() {
    // Extract channel name from URL
    const url = window.location.href;
    const urlParts = url.split('/');
    
    // Find the part after kick.com/
    for (let i = 0; i < urlParts.length; i++) {
      if (urlParts[i].includes('kick.com') && i + 1 < urlParts.length) {
        // Get the next part after kick.com
        let channelName = urlParts[i + 1];
        
        // Remove any query parameters or hash
        channelName = channelName.split('?')[0];
        channelName = channelName.split('#')[0];
        
        return channelName;
      }
    }
    
    return 'Channel'; // Default fallback
  }
 
  // Update the isValidChannelPage method to be less restrictive
  isValidChannelPage() {
    // Get the current URL
    const url = window.location.href;
    console.log("Checking if valid channel page:", url);
    
    // Quick check if we're not even on kick.com
    if (!url.includes('kick.com')) {
      console.log('Not a channel page: not on kick.com');
      return false;
    }
    
    // Check for specific non-channel URL patterns first
    const nonChannelPatterns = [
      'kick.com/browse',
      'kick.com/following',
      'kick.com/categories',
      'kick.com/category',
      'kick.com/search',
      'kick.com/messages',
      'kick.com/subscriptions',
      'kick.com/clips',
      'kick.com/help',
      'kick.com/terms',
      'kick.com/privacy',
      'kick.com/about',
      'kick.com/support',
      'kick.com/account',
      'kick.com/wallet',
      'kick.com/settings',
      'kick.com/home',
      'kick.com/login',
      'kick.com/signup'
    ];
    
    // Check if URL matches any non-channel pattern
    for (const pattern of nonChannelPatterns) {
      if (url.includes(pattern)) {
        console.log(`Not a channel page: matched pattern ${pattern}`);
        return false;
      }
    }
    
    // Also check for the homepage
    if (url === 'https://kick.com/' || 
        url === 'https://kick.com' || 
        url.match(/^https:\/\/kick\.com\/?(?:\?.*)?$/)) {
      console.log('Not a channel page: homepage detected');
      return false;
    }
    
    // Most importantly - check if the chat element exists
    // First, log the DOM structure to help with debugging
    console.log('Current DOM structure:', {
      hasChat: !!document.querySelector('#chatroom-messages'),
      hasChatroom: !!document.querySelector('#chat-room'),
      possibleChatElements: document.querySelectorAll('[id*="chat"], [class*="chat"]'),
      bodyClasses: document.body.className,
      channelElements: document.querySelectorAll('[class*="channel"], [id*="channel"]'),
      playerElements: document.querySelectorAll('[class*="player"], [id*="player"]')
    });
    
    // Look for a chat element with various possible selectors
    const chatElement = document.querySelector('#chatroom-messages, #chat-room, .chat-messages, .chatroom, [id*="chat-messages"], [class*="chat-container"]');
    
    if (!chatElement) {
      console.log('Not a channel page: no chat element found with any selector');
      return false;
    }
    
    console.log('Found chat element:', chatElement);
    
    // Only do a basic check for a player/video element
    const videoElement = document.querySelector('video, [class*="player"], [id*="player"], [class*="stream"], [id*="stream"]');
    
    if (!videoElement) {
      console.log('No video player found - might not be a channel page');
    }
    
    // If we made it here, we likely have a chat element, so it's probably a channel page
    console.log('Valid channel page detected');
    return true;
  }

  extractChatMessages() {
    const messagesContainer = document.querySelector('#chatroom-messages');
    
    if (!messagesContainer) {
      console.log('No chat messages container found');
      return [];
    }
  
    // Log the structure of the chat container to help with debugging
    console.log('Chat container:', messagesContainer);
    
    const messageElements = messagesContainer.querySelectorAll('[data-index]');
    console.log(`Found ${messageElements.length} message elements`);
    
    const messages = [];
    const seenMessages = new Set(); // Track unique messages to avoid duplicates
    let skippedCount = 0;
    
    Array.from(messageElements).forEach((messageEl, index) => {
      // Get the username
      const usernameElement = messageEl.querySelector('.chat-entry-username');
      const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
      
      // Get the message text
      const messageTextElement = messageEl.querySelector('div[class*="break-words"]');
      let messageText = messageTextElement ? messageTextElement.textContent.trim().toLowerCase() : '';
      
      // Skip empty messages early
      if (!messageText || messageText.length === 0) {
        skippedCount++;
        return;
      }
      
      // Skip very short messages (1-2 characters)
      if (messageText.length < 3) {
        skippedCount++;
        return;
      }
      
      // Skip messages that are just URLs
      if (messageText.match(/^https?:\/\/\S+$/i)) {
        skippedCount++;
        return;
      }
      
      // Skip messages that are just numbers
      if (messageText.match(/^\d+$/)) {
        skippedCount++;
        return;
      }
      
      // Try to detect emoji-only messages (common in chat)
      // This is an approximate check - Unicode emoji detection can be complex
      const emojiPattern = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      const nonEmojiPattern = /[a-zA-Z0-9]/; // Check if there are actual alphanumeric characters
      
      // If message contains emojis but no alphanumeric characters, skip it
      if (emojiPattern.test(messageText) && !nonEmojiPattern.test(messageText)) {
        skippedCount++;
        return;
      }
      
      // Skip if message is too short after removing common emotes
      const cleanedForLength = messageText
        .replace(/kappa|pogchamp|lul|pepe|pog|omegalul|sadge|monkas|pepega|kekw|pepelaugh/g, '')
        .trim();
      
      if (cleanedForLength.length < 3) {
        skippedCount++;
        return;
      }
      
      // Create a unique identifier for this message to avoid duplicates
      const messageKey = `${username}:${messageText}`;
      
      // Skip if we've already seen this exact message
      if (seenMessages.has(messageKey)) {
        skippedCount++;
        return;
      }
      
      // Mark this message as seen
      seenMessages.add(messageKey);
      
      console.log(`Message ${index}: "${username}": "${messageText}"`);
      
      messages.push({
        username: username,
        message: messageText
      });
    });
    
    console.log(`Total messages extracted: ${messages.length} (after filtering out ${skippedCount} empty/invalid messages)`);
    return messages;
  }

  // Methods for training model feedback
  // Get chat messages for individual labeling
  getChatMessages() {
    // The messages should already be filtered at the extraction stage,
    // but we'll do a second filtering here just to be absolutely certain
    // no empty messages are shown to the user for labeling
    const filteredMessages = this.chatHistory.filter(msg => {
      // Skip empty messages
      if (!msg.message || msg.message.trim() === '') return false;
      
      // Skip very short messages (require at least 3 characters)
      if (msg.message.trim().length < 3) return false;
      
      // Skip messages that are just URLs
      if (msg.message.trim().match(/^https?:\/\/\S+$/i)) return false;
      
      // Skip pure number messages
      if (msg.message.trim().match(/^\d+$/)) return false;
      
      // Check if message only contains emoji (common in chat)
      // This regex matches common emoji patterns
      const emojiOnlyRegex = /^(\p{Emoji}|\s)+$/u;
      if (emojiOnlyRegex.test(msg.message.trim())) return false;
      
      // Skip messages with just punctuation/symbols and no actual text
      if (msg.message.trim().match(/^[^\w\s]*$/)) return false;
      
      // Skip messages that are mostly emotes after removing common chat emotes
      const cleanedForEmotes = msg.message.trim()
        .toLowerCase()
        .replace(/kappa|pogchamp|lul|pepe|pog|omegalul|sadge|monkas|pepega|kekw|pepelaugh/g, '')
        .trim();
        
      if (cleanedForEmotes.length < 3) return false;
      
      return true;
    });
    
    console.log(`Second-stage filtering: ${this.chatHistory.length - filteredMessages.length} more messages filtered out`);
    
    // Return filtered messages for individual labeling
    return filteredMessages; 
  }

  // Store labeled messages from popup
  storeLabeledMessages(labeledMessages) {
    // Combine with existing labeled messages
    chrome.storage.local.get(['labeledMessages'], (data) => {
      let allLabeledMessages = data.labeledMessages || [];
      allLabeledMessages = [...allLabeledMessages, ...labeledMessages];
      
      // Limit to last 1000 to prevent storage issues
      if (allLabeledMessages.length > 1000) {
        allLabeledMessages = allLabeledMessages.slice(-1000);
      }
      
      // Save back to storage
      chrome.storage.local.set({ labeledMessages: allLabeledMessages });
      
      console.log(`Stored ${labeledMessages.length} newly labeled messages, total: ${allLabeledMessages.length}`);
    });
    
    return { success: true };
  }

  // Helper to calculate word frequencies from chat messages (kept for reference)
  calculateWordFrequencies() {
    const wordCounts = {};
    
    this.chatHistory.forEach(message => {
      const words = message.message.toLowerCase().split(/\s+/);
      
      words.forEach(word => {
        // Skip very short words
        if (word.length < 3) return;
        
        // Count word occurrences
        if (!wordCounts[word]) {
          wordCounts[word] = 0;
        }
        wordCounts[word]++;
      });
    });
    
    // Convert to array of {word, count} sorted by frequency
    return Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100); // Keep top 100 words
  }

  analyzeMood(messages) {
    // Reset counts for this analysis
    this.resetSentimentCounts();
    
    let totalMessages = messages.length;
    console.log(`Analyzing mood for ${totalMessages} messages`);
    
    if (totalMessages === 0) return { mood: 'Waiting for chat...', level: 2 };
    
    // Combine all messages into a single batch of text
    const batchText = messages.map(msg => msg.message).join(' ');
    
    // Analyze the entire batch using the sentiment model
    const batchSentiment = this.analyzeBatchSentiment(batchText);
    
    // Updated sentiment counting logic for more balanced results
    let moodObj;
    
    if (batchSentiment === 'Positive') {
      this.sentimentCounts.positive += Math.ceil(totalMessages * 0.7);
      this.sentimentCounts.neutral += Math.ceil(totalMessages * 0.2);
      this.sentimentCounts.negative += Math.ceil(totalMessages * 0.1);
      moodObj = { mood: 'HYPE 🔥', level: 0 };
    } 
    else if (batchSentiment === 'Slightly Positive') {
      this.sentimentCounts.positive += Math.ceil(totalMessages * 0.55);
      this.sentimentCounts.neutral += Math.ceil(totalMessages * 0.35);
      this.sentimentCounts.negative += Math.ceil(totalMessages * 0.1);
      moodObj = { mood: 'Positive 🙂', level: 1 };
    }
    else if (batchSentiment === 'Negative') {
      this.sentimentCounts.negative += Math.ceil(totalMessages * 0.7);
      this.sentimentCounts.neutral += Math.ceil(totalMessages * 0.2);
      this.sentimentCounts.positive += Math.ceil(totalMessages * 0.1);
      moodObj = { mood: 'TOXIC 🤬', level: 4 };
    } 
    else if (batchSentiment === 'Slightly Negative') {
      this.sentimentCounts.negative += Math.ceil(totalMessages * 0.55);
      this.sentimentCounts.neutral += Math.ceil(totalMessages * 0.35);
      this.sentimentCounts.positive += Math.ceil(totalMessages * 0.1);
      moodObj = { mood: 'Negative 😕', level: 3 };
    } 
    else {
      this.sentimentCounts.neutral += Math.ceil(totalMessages * 0.6);
      this.sentimentCounts.positive += Math.ceil(totalMessages * 0.2);
      this.sentimentCounts.negative += Math.ceil(totalMessages * 0.2);
      moodObj = { mood: 'Neutral 😐', level: 2 };
    }
    
    console.log('Batch sentiment:', batchSentiment);
    console.log('Updated sentiment counts:', this.sentimentCounts);
    console.log('Mood interpretation:', moodObj);
    
    // Calculate mood stats for consistency
    this.calculateMoodStats();
    
    // Store the last analyzed mood for feedback
    this.lastAnalyzedMood = moodObj.mood;
    
    return moodObj;
  }

  analyzeBatchSentiment(batchText) {
    // Clean and prepare the text
    const cleanedText = this.cleanTextForPrediction(batchText);
    
    // If we have a model loaded
    if (this.sentimentModel) {
      try {
        // Use the machine learning model to predict sentiment
        const sentiment = this.predictWithModel(cleanedText);
        console.log(`Model prediction for batch text: ${sentiment}`);
        return sentiment;
      } catch (error) {
        console.error('Error using sentiment model:', error);
        return 'Neutral'; // Fallback to neutral on error
      }
    }
    
    // Updated fallback heuristic with more balanced detection
    console.log('No model loaded, using improved fallback sentiment detection');
    
    // Count various sentiment indicators
    const positiveCount = (cleanedText.match(/good|great|awesome|amazing|pog|love|heart|win|gg|lol|haha|nice|thanks|ty|cool|wow/gi) || []).length;
    const negativeCount = (cleanedText.match(/bad|terrible|awful|horrible|sad|lose|toxic|trash|lag|wtf|hate|fail|damn|shit|fuck|sucks/gi) || []).length;
    
    // Count neutral/ambiguous words to better detect neutral sentiment
    const neutralCount = (cleanedText.match(/ok|okay|fine|maybe|hmm|idk|what|who|when|where|why|how|if|then/gi) || []).length;
    
    // Calculate word count estimate for scaling (simple approximation)
    const wordCount = cleanedText.split(/\s+/).length;
    
    // Calculate ratios
    const positiveRatio = positiveCount / (wordCount || 1);
    const negativeRatio = negativeCount / (wordCount || 1);
    const neutralRatio = neutralCount / (wordCount || 1);
    
    console.log('Sentiment ratios:', {
      positive: positiveRatio,
      negative: negativeRatio,
      neutral: neutralRatio,
      wordCount
    });
    
    // More nuanced sentiment classification
    if (positiveRatio > 0.1 && positiveRatio > negativeRatio * 2) {
      return 'Positive';
    } else if (positiveRatio > 0.05 && positiveRatio > negativeRatio) {
      return 'Slightly Positive';
    } else if (negativeRatio > 0.1 && negativeRatio > positiveRatio * 2) {
      return 'Negative';
    } else if (negativeRatio > 0.05 && negativeRatio > positiveRatio) {
      return 'Slightly Negative';
    } else {
      return 'Neutral';
    }
  }
  
  // Clean and normalize text for model prediction
  cleanTextForPrediction(text) {
    if (!text) return "";
    
    // Convert to lowercase
    let cleaned = text.toLowerCase();
    
    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
    
    // Remove timestamps (patterns like "HH:MM")
    cleaned = cleaned.replace(/\d\d:\d\d\s*/g, '');
    
    // Remove username prefixes (patterns like "username:")
    cleaned = cleaned.replace(/\w+:\s*/g, '');
    
    // Replace multiple spaces with a single space
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }
  
  // Predict sentiment using the loaded model
  predictWithModel(text) {
    // Make sure we have a valid model
    if (!this.sentimentModel || !this.sentimentModel.vocabulary) {
      console.error('Invalid or missing sentiment model');
      return 'Neutral';
    }
    
    try {
      // Extract features using TF-IDF
      const features = this.extractFeatures(text);
      
      // Make prediction using the model
      const prediction = this.predict(features);
      
      return prediction;
    } catch (e) {
      console.error('Error during prediction:', e);
      return 'Neutral';
    }
  }
  
  // Extract TF-IDF features from text using model vocabulary
  extractFeatures(text) {
    const model = this.sentimentModel;
    const vocabulary = model.vocabulary;
    const idf = model.idf;
    
    // Count term frequencies
    const termFrequencies = {};
    
    // Split into words
    const words = text.split(/\s+/);
    
    // Count word occurrences that exist in our vocabulary
    for (const word of words) {
      if (word in vocabulary) {
        const index = vocabulary[word];
        termFrequencies[index] = (termFrequencies[index] || 0) + 1;
      }
    }
    
    // Create feature vector (all zeros initially)
    const features = new Array(idf.length).fill(0);
    
    // Fill in the TF-IDF values
    for (const [index, count] of Object.entries(termFrequencies)) {
      // TF-IDF = term frequency * inverse document frequency
      features[index] = count * idf[index];
    }
    
    return features;
  }
  
  // Perform prediction using the logistic regression model
  predict(features) {
    const model = this.sentimentModel;
    const coefficients = model.coefficients;
    const intercept = model.intercept;
    const classes = model.classes;
    
    // Binary classification case
    if (!Array.isArray(coefficients[0])) {
      // Calculate decision value
      let decision = intercept[0];
      for (let i = 0; i < features.length; i++) {
        if (i < coefficients.length) {  // Avoid index errors
          decision += features[i] * coefficients[i];
        }
      }
      
      // Convert to probability with sigmoid function
      const probability = 1 / (1 + Math.exp(-decision));
      
      // Map to class labels
      // For binary classification, typically classes are ordered alphabetically
      // and positive sentiment would be the second class
      return probability >= 0.5 ? classes[1] : classes[0];
    } 
    // Multi-class classification
    else {
      const scores = [];
      
      // Calculate scores for each class
      for (let c = 0; c < classes.length; c++) {
        let score = intercept[c];
        const classCoef = coefficients[c];
        
        for (let i = 0; i < features.length && i < classCoef.length; i++) {
          score += features[i] * classCoef[i];
        }
        scores.push(score);
      }
      
      // Find the class with the highest score
      const maxIndex = scores.indexOf(Math.max(...scores));
      return classes[maxIndex];
    }
  }
  
  // Basic placeholder for sentiment analysis
  // This will be replaced by your sentiment_model.pkl implementation
  analyzeSentiment(message) {
    // Default to a balanced approach until the model is loaded
    // This is just a placeholder - your model will do the real work
    return Math.random() > 0.5 ? 1 : -1;
  }

  interpretMoodWithIntensity() {
    console.log('Sentiment counts:', this.sentimentCounts);
    
    // Use the sentiment counts to determine intensity
    if (this.sentimentCounts.positive >= 3) {
      return { mood: 'HYPE', level: 0 };
    } else if (this.sentimentCounts.positive === 2) {
      return { mood: 'Positive', level: 1 };
    } else if (this.sentimentCounts.positive === 1) {
      return { mood: 'Slightly Positive', level: 2 };
    }
    
    // Negative intensity - 1 message makes it slightly negative, 2 makes it negative
    if (this.sentimentCounts.negative >= 3) {
      return { mood: 'TOXIC', level: 4 };
    } else if (this.sentimentCounts.negative === 2) {
      return { mood: 'Negative', level: 3 };
    } else if (this.sentimentCounts.negative === 1) {
      return { mood: 'Slightly Negative', level: 2 };
    }
    
    // Default to neutral if no clear sentiment emerges
    return { mood: 'Neutral', level: 2 };
  }

// 5. Modified calculateMoodStats to ensure percentages are properly normalized
  calculateMoodStats() {
    // Calculate percentages
    const total = this.sentimentCounts.positive + this.sentimentCounts.neutral + this.sentimentCounts.negative;
    
    if (total > 0) {
      // Round to whole numbers
      this.moodStats.positive = Math.round((this.sentimentCounts.positive / total) * 100);
      this.moodStats.neutral = Math.round((this.sentimentCounts.neutral / total) * 100);
      this.moodStats.negative = Math.round((this.sentimentCounts.negative / total) * 100);
      
      // Ensure the total is exactly 100%
      const sumPercent = this.moodStats.positive + this.moodStats.neutral + this.moodStats.negative;
      
      if (sumPercent !== 100) {
        // Adjust the largest value to make sum exactly 100
        if (this.moodStats.positive >= this.moodStats.neutral && this.moodStats.positive >= this.moodStats.negative) {
          this.moodStats.positive += (100 - sumPercent);
        } else if (this.moodStats.neutral >= this.moodStats.positive && this.moodStats.neutral >= this.moodStats.negative) {
          this.moodStats.neutral += (100 - sumPercent);
        } else {
          this.moodStats.negative += (100 - sumPercent);
        }
      }
    } else {
      // Default values if no messages
      this.moodStats.positive = 0;
      this.moodStats.neutral = 100;
      this.moodStats.negative = 0;
    }
    
    console.log('Updated mood stats:', this.moodStats);
    
    // Send the updated stats to the popup if it's open
    chrome.runtime.sendMessage({
      action: "updateMoodStats",
      moodStats: this.moodStats
    });
    
    return this.moodStats;
  }

  getMoodLevelPercentage(level) {
    // Convert mood level (0-4) to a percentage position (0-100%) for the arrow
    // This is the old approach that makes it too extreme:
    // 0 = leftmost (most positive), 4 = rightmost (most negative)
    // Each level is 20% of the width (5 levels total)
    // return level * 20 + 9; // +9 to center within each segment
    
    // New more nuanced approach using actual percentages:
    // First, get the mood stats
    const positivePercent = this.moodStats.positive || 0;
    const negativePercent = this.moodStats.negative || 0;
    const neutralPercent = this.moodStats.neutral || 0;
    
    console.log('Percentages for arrow positioning:', {
      positivePercent, 
      neutralPercent, 
      negativePercent,
      level
    });
    
    // Calculate arrow position based on sentiment percentages, not just the level
    // We'll use a weighted calculation that considers the distribution of sentiments
    // This will make the arrow position more proportional to the actual sentiment
    
    // Start from the middle (50%)
    let position = 50;
    
    // Adjust based on positive/negative distributions
    // If there's more positive than negative, move left (towards positive)
    // If there's more negative than positive, move right (towards negative)
    const sentimentDifference = positivePercent - negativePercent;
    
    // Scale the difference to a maximum movement of 40 percentage points
    // This keeps the arrow within reasonable bounds and prevents extremes
    const maxDisplacement = 40;
    const scaledDifference = (sentimentDifference / 100) * maxDisplacement;
    
    // Move position (negative number moves left toward positive, positive moves right toward negative)
    position -= scaledDifference;
    
    // Ensure position stays within bounds (10-90%)
    position = Math.max(10, Math.min(90, position));
    
    console.log('Calculated arrow position:', position);
    
    return position;
  }

  getExplanation(moodObj) {
    const explanations = {
      'HYPE 🔥': 'Chat is extremely excited and positive!',
      'Positive 🙂': 'Chat has a positive and supportive atmosphere.',
      'Slightly Positive 🙂': 'Chat shows more positive than negative sentiment.',
      'Neutral 😐': 'Chat is balanced with mixed or neutral messages.',
      'Slightly Negative 😕': 'Chat shows some negativity or criticism.',
      'Negative 😕': 'Chat has a negative tone with criticism.',
      'TOXIC 🤬': 'Chat has high negativity and potential conflict!',
      'Waiting for chat...': 'Collecting messages...'
    };
  
    return explanations[moodObj.mood] || 'Analyzing chat mood...';
  }

  startCollection() {
    // Immediate check if we're on a valid channel page
    if (!this.isValidChannelPage()) {
      console.log('Not on a valid channel page, mood meter disabled');
      
      // If we're already collecting, stop
      if (this.isCollecting) {
        clearInterval(this.collectionInterval);
        this.isCollecting = false;
      }
      
      // Hide the widget if it exists
      const widget = document.getElementById('kick-mood-widget');
      if (widget) {
        widget.style.opacity = '0';
        setTimeout(() => {
          widget.style.display = 'none';
        }, 300);
      }
      return;
    }
    
    if (this.isCollecting) return;
    
    this.isCollecting = true;
    this.collectionStartTime = Date.now();
    this.chatHistory = [];
    
    // Create calculating overlay
    this.showCalculatingOverlay();
    
    // Start periodically checking for new messages
    this.collectionInterval = setInterval(() => {
      // Add an additional check here to catch navigation during collection
      if (!this.isValidChannelPage()) {
        console.log('No longer on a channel page, stopping collection');
        clearInterval(this.collectionInterval);
        this.isCollecting = false;
        
        // Hide the widget
        const widget = document.getElementById('kick-mood-widget');
        if (widget) {
          widget.style.opacity = '0';
          setTimeout(() => {
            widget.style.display = 'none';
          }, 300);
        }
        return;
      }
      
      const newMessages = this.extractChatMessages();
      
      // Add only new messages to our history
      const existingMessagesMap = new Map(this.chatHistory.map(msg => [msg.username + msg.message, true]));
      const uniqueNewMessages = newMessages.filter(msg => !existingMessagesMap.has(msg.username + msg.message));
      
      this.chatHistory = [...this.chatHistory, ...uniqueNewMessages];
      
      // Update calculating status on overlay (just show it's calculating, not message count)
      const timeRemaining = Math.max(0, 10 - Math.floor((Date.now() - this.collectionStartTime) / 1000));
      this.updateCalculatingOverlay(`Analyzing chat in ${timeRemaining} seconds...`);
      
      // If 10 seconds have passed, analyze and stop collection
      if (Date.now() - this.collectionStartTime >= 10000) {
        this.finishCollection();
      }
    }, 1000);
  }
  
  showCalculatingOverlay() {
    // Create or update widget to show it's calculating
    this.createOrUpdateWidget(
      {mood: 'Calculating...', level: 2}, 
      'Analyzing chat sentiment...'
    );
    
    // Add overlay effect to the widget
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      // Add a pulsing animation
      widget.style.animation = 'pulse 1.5s infinite';
      
      // Add the CSS animation if not already added
      if (!document.getElementById('mood-meter-animations')) {
        const style = document.createElement('style');
        style.id = 'mood-meter-animations';
        style.textContent = `
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(74, 144, 226, 0); }
            100% { box-shadow: 0 0 0 0 rgba(74, 144, 226, 0); }
          }
        `;
        document.head.appendChild(style);
      }
      
      // Add a loading indicator
      let loadingIndicator = document.getElementById('kick-mood-loading');
      if (!loadingIndicator) {
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'kick-mood-loading';
        loadingIndicator.style.cssText = `
          width: 100%;
          height: 4px;
          background-color: #333;
          margin-top: 10px;
          border-radius: 2px;
          overflow: hidden;
        `;
        
        const loadingBar = document.createElement('div');
        loadingBar.style.cssText = `
          height: 100%;
          width: 30%;
          background-color: #4A90E2;
          border-radius: 2px;
          animation: loading 2s infinite linear;
        `;
        loadingIndicator.appendChild(loadingBar);
        
        // Add the loading animation
        if (!document.getElementById('mood-meter-loading-animation')) {
          const loadingStyle = document.createElement('style');
          loadingStyle.id = 'mood-meter-loading-animation';
          loadingStyle.textContent = `
            @keyframes loading {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(400%); }
            }
          `;
          document.head.appendChild(loadingStyle);
        }
        
        widget.appendChild(loadingIndicator);
      }
    }
  }
  
  updateCalculatingOverlay(statusText) {
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      const statusElement = widget.querySelector('.status-text');
      if (statusElement) {
        statusElement.textContent = statusText;
      } else {
        // If status element doesn't exist, create it
        const statusElement = document.createElement('div');
        statusElement.className = 'status-text';
        statusElement.style.cssText = `
          margin-top: 10px;
          font-size: 12px;
          color: #ddd;
          text-align: center;
        `;
        statusElement.textContent = statusText;
        widget.appendChild(statusElement);
      }
    }
  }
  
  hideCalculatingOverlay() {
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      // Remove the pulse animation
      widget.style.animation = 'none';
      
      // Remove the loading indicator
      const loadingIndicator = document.getElementById('kick-mood-loading');
      if (loadingIndicator) {
        loadingIndicator.remove();
      }
      
      // Remove the status text
      const statusElement = widget.querySelector('.status-text');
      if (statusElement) {
        statusElement.remove();
      }
    }
  }
  
  finishCollection() {
    clearInterval(this.collectionInterval);
    this.isCollecting = false;
    
    // Hide the calculating overlay
    this.hideCalculatingOverlay();
    
    // Analyze the collected messages
    const moodObj = this.analyzeMood(this.chatHistory);
    
    // Calculate mood statistics for popup (already called in analyzeMood)
    const explanation = this.getExplanation(moodObj);
    
    // Update the widget with results
    this.createOrUpdateWidget(moodObj, explanation);
    
    // Send to popup with consistent mood information
    chrome.runtime.sendMessage({ 
      action: "updateMood",
      mood: moodObj.mood, 
      level: moodObj.level,
      explanation: explanation,
      messageCount: this.chatHistory.length,
      moodStats: this.moodStats
    });
    
    // Schedule next collection after specified interval
    // Convert minutes to milliseconds
    const updateFrequencyMs = parseInt(this.settings.updateFrequency) * 60 * 1000 || 300000; // Default to 5 minutes
    setTimeout(() => this.startCollection(), updateFrequencyMs);
  }
  
  
  updateChannelInfo() {
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      const channelHeader = widget.querySelector('.channel-header');
      if (channelHeader) {
        channelHeader.textContent = this.getChannelName();
      }
    }
  }

  createOrUpdateWidget(moodObj, explanation) {
    console.log("Attempting to create/update widget with mood:", moodObj, "explanation:", explanation);
    let widget = document.getElementById('kick-mood-widget');
    
    if (!widget) {
      widget = document.createElement('div');
      widget.id = 'kick-mood-widget';
      
      // Apply transparency from settings
      const transparency = this.settings.transparency || 85;
      const backgroundColor = `rgba(0, 0, 0, ${(100 - transparency) / 100})`;
      
      // Initial position - default to top right unless we have a saved position
      let positionStyles = 'top: 60px; right: 20px;';
      
      if (this.savedPosition) {
        positionStyles = `top: ${this.savedPosition.top}px; left: ${this.savedPosition.left}px; right: auto; bottom: auto;`;
      }
      
      widget.style.cssText = `
        position: fixed;
        ${positionStyles}
        width: 200px;
        background-color: ${backgroundColor};
        color: white;
        border-radius: 8px;
        padding: 12px;
        z-index: 9999;
        font-family: Arial, sans-serif;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        transition: opacity 0.3s;
        backdrop-filter: blur(4px);
        cursor: move;
      `;
      
      // Create channel name header
      const channelHeader = document.createElement('div');
      channelHeader.className = 'channel-header';
      const channelName = this.getChannelName();
      channelHeader.textContent = channelName;
      channelHeader.style.cssText = `
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        text-transform: uppercase;
        letter-spacing: 1px;
      `;
      widget.appendChild(channelHeader);
      
      // Create mood container
      const moodWrapper = document.createElement('div');
      moodWrapper.style.cssText = `
        position: relative;
        width: 100%;
        height: auto;
        overflow: visible;
        margin: 0;
        padding: 0;
      `;
      
      // Create mood meter image
      const moodMeterImg = document.createElement('img');
      moodMeterImg.id = 'kick-mood-meter-img';
      moodMeterImg.src = chrome.runtime.getURL('images/Mood_Meter.png');
      moodMeterImg.style.cssText = `
        width: 100%;
        height: auto;
        display: block;
        margin: 0;
        padding: 0;
      `;
      
      // Create triangle arrow indicator
      const moodIndicator = document.createElement('div');
      moodIndicator.id = 'kick-mood-indicator';
      moodIndicator.style.cssText = `
        position: absolute;
        left: 50%;
        bottom: 10%;
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-bottom: 14px solid white;
        transform: translateX(-50%);
        transition: left 0.5s ease-in-out;
      `;
      
      moodWrapper.appendChild(moodMeterImg);
      moodWrapper.appendChild(moodIndicator);
      widget.appendChild(moodWrapper);
      
      // Add drag functionality with double-click activation
      let isDragging = false;
      let offsetX, offsetY;
      
      // Double-click to enable drag mode
      widget.addEventListener('dblclick', (e) => {
        e.preventDefault(); // Prevent text selection
        
        // Toggle dragging mode
        isDragging = !isDragging;
        
        if (isDragging) {
          // Set green border to indicate draggable state
          widget.style.boxShadow = '0 0 0 3px rgb(23, 214, 29)';
          widget.style.cursor = 'move';
          
          // Get initial mouse position relative to widget
          const rect = widget.getBoundingClientRect();
          offsetX = e.clientX - rect.left;
          offsetY = e.clientY - rect.top;
          
          // Auto-disable dragging mode after 10 seconds if not used
          setTimeout(() => {
            if (isDragging) {
              isDragging = false;
              widget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
              widget.style.cursor = 'default';
            }
          }, 10000);
        } else {
          // Disable dragging mode
          widget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
          widget.style.cursor = 'default';
        }
      });
      
      // Move the widget when dragging
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        // Update widget position
        widget.style.left = (e.clientX - offsetX) + 'px';
        widget.style.top = (e.clientY - offsetY) + 'px';
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
      });
      
      // Stop dragging when mouse button is released
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          // Save the current position for persistence
          const rect = widget.getBoundingClientRect();
          chrome.storage.local.set({
            widgetPosition: {
              left: rect.left,
              top: rect.top
            }
          });
        }
      });
      
      // End dragging if escape key is pressed
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDragging) {
          isDragging = false;
          widget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
          widget.style.cursor = 'default';
        }
      });
      
      document.body.appendChild(widget);
      this.widgetCreated = true;
    }
    
    // Update mood indicator position
    const indicator = document.getElementById('kick-mood-indicator');
    if (indicator) {
      // Set the position based on mood level (0-4)
      const percentage = this.getMoodLevelPercentage(moodObj.level);
      indicator.style.left = `${percentage}%`;
    }
    
    // Make sure it's visible
    widget.style.display = 'block';
    widget.style.opacity = '1';
  }
  
  toggleWidget() {
    // First check if we're on a valid channel page
    if (!this.isValidChannelPage()) {
      console.log("Can't toggle widget on non-channel page");
      return false;
    }
    
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      if (widget.style.display === 'none') {
        widget.style.display = 'block';
        setTimeout(() => widget.style.opacity = '1', 10);
      } else {
        widget.style.opacity = '0';
        setTimeout(() => widget.style.display = 'none', 300);
      }
    } else {
      // Only create widget if we're on a valid channel page
      this.createOrUpdateWidget({mood: 'Starting...', level: 2}, 'Collecting data...');
      this.startCollection();
    }
    return !!widget && widget.style.display !== 'none';
  }
  
  updateSettings(newSettings) {
    this.settings = {...this.settings, ...newSettings};
    
    // Apply new settings to the widget
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      // Apply transparency
      const transparency = this.settings.transparency;
      widget.style.backgroundColor = `rgba(0, 0, 0, ${(100 - transparency) / 100})`;
    }
  }
}

// Initialize and start the mood meter
const kickMoodMeter = new KickMoodMeter();

// Add visibility change listener to detect tab/window switching
document.addEventListener('visibilitychange', () => {
  // When the tab becomes visible again, check if we're still on a valid page
  if (document.visibilityState === 'visible') {
    console.log('Tab became visible, checking if still on channel page');
    
    if (kickMoodMeter) {
      const isChannelPage = kickMoodMeter.isValidChannelPage();
      
      if (!isChannelPage && kickMoodMeter.isCollecting) {
        console.log('No longer on channel page, stopping analysis');
        clearInterval(kickMoodMeter.collectionInterval);
        kickMoodMeter.isCollecting = false;
        
        // Hide the widget
        const widget = document.getElementById('kick-mood-widget');
        if (widget) {
          widget.style.opacity = '0';
          setTimeout(() => {
            widget.style.display = 'none';
          }, 300);
        }
      }
    }
  }
});

// Wait for page to fully load
window.addEventListener('load', () => {
  // Check if we're on a valid channel page initially
  const initialCheck = kickMoodMeter.isValidChannelPage();
  console.log('Initial channel page check:', initialCheck);
  
  if (initialCheck) {
    // Start initial collection after 2 seconds to ensure chat elements are loaded
    setTimeout(() => {
      kickMoodMeter.startCollection();
    }, 2000);
  }
  
  // Set up a periodic check for channel page status in case the DOM loads slowly
  let checkCount = 0;
  const pageCheckInterval = setInterval(() => {
    const isChannelPage = kickMoodMeter.isValidChannelPage();
    checkCount++;
    
    if (isChannelPage && !kickMoodMeter.isCollecting) {
      console.log('Channel page detected on check', checkCount);
      kickMoodMeter.startCollection();
      clearInterval(pageCheckInterval);
    } else if (!isChannelPage && kickMoodMeter.isCollecting) {
      console.log('No longer on channel page');
      clearInterval(kickMoodMeter.collectionInterval);
      kickMoodMeter.isCollecting = false;
      
      // Hide the widget
      const widget = document.getElementById('kick-mood-widget');
      if (widget) {
        widget.style.display = 'none';
      }
      clearInterval(pageCheckInterval);
    }
    
    // Only check for a limited time to avoid infinite checking
    if (checkCount > 10) {
      clearInterval(pageCheckInterval);
    }
  }, 1000);
});

// Chrome message listener for communication with popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
  // In content.js, update the getMood message handler
  if (request.action === 'getMood') {
    // Check if we're on a valid channel page
    const isChannel = kickMoodMeter.isValidChannelPage();
    console.log('Is this a channel page?', isChannel);
    
    if (!isChannel) {
      sendResponse({  
        mood: 'Not on a channel', 
        level: -1, 
        explanation: 'Widget is only available on channel pages',
        isVisible: false,
        isChannelPage: false
      });
      return true;
    }
    
    const moodObj = kickMoodMeter.analyzeMood(kickMoodMeter.chatHistory);
    const explanation = kickMoodMeter.getExplanation(moodObj);
    sendResponse({ 
      mood: moodObj.mood, 
      level: moodObj.level, 
      explanation: explanation,
      isVisible: !!document.getElementById('kick-mood-widget')?.style.display !== 'none',
      isChannelPage: true,
      moodStats: kickMoodMeter.moodStats,
      messageCount: kickMoodMeter.chatHistory.length  // Add this line
    });
  }
  else if (request.action === 'manualCollection') {
    console.log('Manual chat collection requested');
    
    // Check if we're on a valid channel page
    if (!kickMoodMeter.isValidChannelPage()) {
      sendResponse({
        success: false,
        message: 'Not on a channel page, cannot collect chat data'
      });
      return true;
    }
    
    // Stop any existing collection
    if (kickMoodMeter.isCollecting) {
      clearInterval(kickMoodMeter.collectionInterval);
      kickMoodMeter.isCollecting = false;
    }
    
    // Start fresh collection with a shorter timer
    kickMoodMeter.chatHistory = [];
    kickMoodMeter.resetSentimentCounts();
    kickMoodMeter.isCollecting = true;
    kickMoodMeter.collectionStartTime = Date.now();
    
    // Show calculating overlay with manual mode indicator
    kickMoodMeter.showCalculatingOverlay();
    kickMoodMeter.updateCalculatingOverlay('Manual analysis in progress...');
    
    // Set up shortened interval for quick feedback
    kickMoodMeter.collectionInterval = setInterval(() => {
      // Extract new messages
      const newMessages = kickMoodMeter.extractChatMessages();
      
      // Add only new messages to our history
      const existingMessagesMap = new Map(kickMoodMeter.chatHistory.map(msg => [msg.username + msg.message, true]));
      const uniqueNewMessages = newMessages.filter(msg => !existingMessagesMap.has(msg.username + msg.message));
      
      kickMoodMeter.chatHistory = [...kickMoodMeter.chatHistory, ...uniqueNewMessages];
      
      // Just collect for 5 seconds with manual trigger
      const timeRemaining = Math.max(0, 5 - Math.floor((Date.now() - kickMoodMeter.collectionStartTime) / 1000));
      kickMoodMeter.updateCalculatingOverlay(`Manual analysis: ${timeRemaining} seconds left...`);
      
      if (Date.now() - kickMoodMeter.collectionStartTime >= 5000) {
        // Finish collection early
        clearInterval(kickMoodMeter.collectionInterval);
        kickMoodMeter.isCollecting = false;
        
        // Hide calculating overlay
        kickMoodMeter.hideCalculatingOverlay();
        
        // Analyze and display results
        const moodObj = kickMoodMeter.analyzeMood(kickMoodMeter.chatHistory);
        kickMoodMeter.calculateMoodStats();
        const explanation = kickMoodMeter.getExplanation(moodObj);
        
        // Update widget
        kickMoodMeter.createOrUpdateWidget(moodObj, explanation);
        
        // Send results
        sendResponse({
          success: true,
          mood: moodObj.mood,
          level: moodObj.level,
          explanation: explanation,
          messageCount: kickMoodMeter.chatHistory.length
        });
      }
    }, 1000);
    
    // In case sendResponse isn't called by the time the interval finishes
    // (needed for Chrome's messaging system)
    return true;
  }
  else if (request.action === 'toggleWidget') {
    console.log('Toggle widget requested');
    // Only allow toggle if we're on a channel page
    const isChannel = kickMoodMeter.isValidChannelPage();
    console.log('Is this a channel page for toggle?', isChannel);
    
    if (!isChannel) {
      console.log('Not on a channel page, cannot toggle widget');
      sendResponse({ 
        isVisible: false,
        isChannelPage: false,
        message: 'Widget is only available on channel pages'
      });
      return true;
    }
    
    console.log('On a channel page, toggling widget');
    const isVisible = kickMoodMeter.toggleWidget();
    console.log('Widget toggled, now visible:', isVisible);
    sendResponse({ 
      isVisible: isVisible,
      isChannelPage: true
    });
  }
  else if (request.action === 'updateSettings') {
    kickMoodMeter.updateSettings(request.settings);
    sendResponse({ success: true });
  }
  else if (request.action === 'getChatMessages') {
    // Handler for getting chat messages for individual labeling
    sendResponse({
      success: true,
      messages: kickMoodMeter.getChatMessages()
    });
  }
  else if (request.action === 'storeLabeledMessages') {
    // Handler for storing labeled messages from popup
    const result = kickMoodMeter.storeLabeledMessages(request.labeledMessages);
    sendResponse(result);
  }
  
  return true;
});