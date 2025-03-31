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
      }
    });
    
    // Set up URL change listener
    this.setupUrlChangeListener();
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
    
    Array.from(messageElements).forEach((messageEl, index) => {
      // Get the username
      const usernameElement = messageEl.querySelector('.chat-entry-username');
      const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
      
      // Get the message text
      const messageTextElement = messageEl.querySelector('div[class*="break-words"]');
      const messageText = messageTextElement ? messageTextElement.textContent.trim().toLowerCase() : '';
      
      if (messageText.length > 0) {
        console.log(`Message ${index}: "${username}": "${messageText}"`);
        
        messages.push({
          username: username,
          message: messageText
        });
      }
    });
    
    console.log(`Total messages extracted: ${messages.length}`);
    return messages;
  }

  // Methods for training model feedback
  // Get chat messages for feedback panel
  getChatMessages() {
    return this.chatHistory.slice(0, 100); // Limit to first 100 messages
  }

  // Handle chat feedback submission
  submitChatFeedback(overallMood) {
    // Create feedback entry
    const feedbackEntry = {
      timestamp: Date.now(),
      channelName: this.getChannelName(),
      originalMood: this.lastAnalyzedMood,
      correctedMood: overallMood,
      messageCount: this.chatHistory.length,
      // Store word frequencies rather than actual messages (for privacy)
      wordFrequencies: this.calculateWordFrequencies()
    };
    
    // Add to feedback data
    this.feedbackData.push(feedbackEntry);
    
    // Trim to keep size manageable (keep last 100 entries)
    if (this.feedbackData.length > 100) {
      this.feedbackData = this.feedbackData.slice(-100);
    }
    
    // Save to storage
    chrome.storage.local.set({ feedbackData: this.feedbackData });
    
    console.log('Feedback saved:', feedbackEntry);
    
    // Return success
    return { success: true };
  }

  // Helper to calculate word frequencies from chat messages
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

  // In content.js, update the analyzeMood method to use batch analysis
  analyzeMood(messages) {
    // Reset counts for this analysis
    this.resetSentimentCounts();
    
    let totalMessages = messages.length;
    console.log(`Analyzing mood for ${totalMessages} messages`);
    
    if (totalMessages === 0) return { mood: 'Waiting for chat...', level: 2 };
    
    // Combine all messages into a single batch of text
    const batchText = messages.map(msg => msg.message).join(' ');
    
    // Analyze the entire batch as one unit using the sentiment model
    const batchSentiment = this.analyzeBatchSentiment(batchText);
    
    // Based on the batch sentiment, determine mood
    let moodObj;
    if (batchSentiment === 'Positive') {
      this.sentimentCounts.positive += 3; // Strongly positive
      moodObj = { mood: 'HYPE 🔥', level: 0 };
    } else if (batchSentiment === 'Slightly Positive') {
      this.sentimentCounts.positive += 1;
      moodObj = { mood: 'Slightly Positive 🙂', level: 2 };
    } else if (batchSentiment === 'Negative') {
      this.sentimentCounts.negative += 3; // Strongly negative
      moodObj = { mood: 'TOXIC 🤬', level: 4 };
    } else if (batchSentiment === 'Slightly Negative') {
      this.sentimentCounts.negative += 1;
      moodObj = { mood: 'Slightly Negative 😕', level: 2 };
    } else {
      this.sentimentCounts.neutral += 1;
      moodObj = { mood: 'Neutral 😐', level: 1 };
    }
    
    console.log('Batch sentiment:', batchSentiment);
    console.log('Mood interpretation:', moodObj);
    
    // Store the last analyzed mood for feedback
    this.lastAnalyzedMood = moodObj.mood;
    
    return moodObj;
  }

  // New method to analyze sentiment of the entire batch
  analyzeBatchSentiment(batchText) {
    // This is where your sentiment_model.pkl integration will happen
    // For now, using a simple placeholder that will be replaced by your model
    
    // If we have a model loaded
    if (this.sentimentModel) {
      try {
        // This is where your actual model prediction would happen
        // The model would analyze the entire batch of text at once
        
        // Placeholder logic - to be replaced with your model implementation
        const positiveCount = (batchText.match(/good|great|awesome|amazing|pog|love|heart|win|gg/gi) || []).length;
        const negativeCount = (batchText.match(/bad|terrible|awful|horrible|sad|lose|toxic|trash|lag/gi) || []).length;
        
        const ratio = positiveCount / (positiveCount + negativeCount + 0.1); // Avoid division by zero
        
        if (ratio > 0.7) return 'Positive'; 
        else if (ratio > 0.5) return 'Slightly Positive';
        else if (ratio < 0.3) return 'Negative';
        else if (ratio < 0.5) return 'Slightly Negative';
        else return 'Neutral';
      } catch (error) {
        console.error('Error using sentiment model:', error);
        return 'Neutral'; // Fallback to neutral on error
      }
    }
    
    // If no model is loaded yet, use random assignment (temporary)
    const randomValue = Math.random();
    if (randomValue > 0.7) return 'Positive';
    else if (randomValue > 0.5) return 'Slightly Positive';
    else if (randomValue < 0.3) return 'Negative';
    else if (randomValue < 0.5) return 'Slightly Negative';
    else return 'Neutral';
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

  calculateMoodStats() {
    // Calculate percentages
    const total = this.sentimentCounts.positive + this.sentimentCounts.neutral + this.sentimentCounts.negative;
    if (total > 0) {
      this.moodStats.positive = (this.sentimentCounts.positive / total) * 100;
      this.moodStats.neutral = (this.sentimentCounts.neutral / total) * 100;
      this.moodStats.negative = (this.sentimentCounts.negative / total) * 100;
    } else {
      // Default values if no messages
      this.moodStats.positive = 0;
      this.moodStats.neutral = 100;
      this.moodStats.negative = 0;
    }
    
    // Send the updated stats to the popup if it's open
    chrome.runtime.sendMessage({
      action: "updateMoodStats",
      moodStats: this.moodStats
    });
    
    return this.moodStats;
  }

  getMoodLevelPercentage(level) {
    // Convert mood level (0-4) to a percentage position (0-100%) for the arrow
    // 0 = leftmost (most positive), 4 = rightmost (most negative)
    // Each level is 20% of the width (5 levels total)
    return level * 20 + 9; // +9 to center within each segment
  }

  getExplanation(moodObj) {
    const explanations = {
      'HYPE': 'Chat is extremely excited and engaged!',
      'Positive': 'Viewers are feeling good and supportive.',
      'Slightly Positive': 'Overall pleasant atmosphere.',
      'Neutral': 'Chat is calm and balanced.',
      'Slightly Negative': 'Some tension or mild frustration.',
      'Negative': 'Chat is getting upset or critical.',
      'TOXIC': 'High negativity and potential conflict!',
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
    // Calculate and update mood statistics for popup
    this.calculateMoodStats();
    const explanation = this.getExplanation(moodObj);
    
    // Update the widget with results
    this.createOrUpdateWidget(moodObj, explanation);
    
    // Send to popup as well - INCLUDE MESSAGE COUNT HERE
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
    // New handler for feedback panel to get chat messages
    sendResponse({
      success: true,
      messages: kickMoodMeter.getChatMessages(),
      currentMood: kickMoodMeter.lastAnalyzedMood
    });
  }
  else if (request.action === 'submitChatFeedback') {
    // New handler for submitting feedback on chat mood
    const result = kickMoodMeter.submitChatFeedback(request.overallMood);
    sendResponse(result);
  }
  
  return true;
});