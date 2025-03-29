// Mood detection content script
class KickMoodMeter {
  constructor() {
    // Will be populated from CSV
    this.sentimentLabels = {
      'label_0': 'negative',
      'label_1': 'neutral',
      'label_2': 'positive'
    };
    
    // Message history keyed by message text for quick lookup
    this.messageToSentimentMap = new Map();
    
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
    this.userSentiments = {}; // Track user sentiments
    this.isCollecting = false;
    this.collectionStartTime = null;
    this.widgetCreated = false;
    this.sentimentDataLoaded = false;
    this.settings = {
      transparency: 85,
      updateFrequency: 5  // Default is now 5 minutes
    };
    
    // Load settings if available
    chrome.storage.local.get(['moodMeterSettings', 'widgetPosition'], (data) => {
      if (data.moodMeterSettings) {
        this.settings = data.moodMeterSettings;
      }
      
      // Store the saved position
      this.savedPosition = data.widgetPosition || null;
    });
    
    // Load sentiment data from CSV
    this.loadSentimentData();
  }
  
  async loadSentimentData() {
    try {
      console.log('Attempting to load sentiment data...');
      const csvUrl = chrome.runtime.getURL('labeled_chat_messages.csv');
      console.log('CSV URL:', csvUrl);
      
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log('CSV data received, length:', csvText.length);

      this.sentimentDataLoaded = true;
    } catch (error) {
      console.error('Error loading sentiment data:', error);
      // Fall back to the original dictionaries if CSV loading fails
      // this.fallbackToOriginalDictionaries();
    }
  }
  
  parseSentimentCsv(csvText) {
    try {
      // More robust CSV parsing
      // First check if we have data
      if (!csvText || typeof csvText !== 'string') {
        console.error('Invalid CSV text:', csvText);
        return;
      }
      
      // Split by lines and handle different line endings
      const lines = csvText.split(/\r?\n/);
      console.log(`CSV has ${lines.length} lines`);
      
      if (lines.length <= 1) {
        console.error('CSV has too few lines');
        return;
      }
      
      // Validate header row
      const header = lines[0].split(',');
      const expectedColumns = ['time', 'user_name', 'user_color', 'message', 'sentiment'];
      
      // Check if header matches expected format
      const isValidHeader = expectedColumns.every((col, index) => 
        header[index] && header[index].trim().toLowerCase() === col.toLowerCase()
      );
      
      if (!isValidHeader) {
        console.warn('CSV header does not match expected format:', header);
        console.warn('Expected:', expectedColumns);
        // Continue anyway but log the issue
      }
      
      // Track stats for debugging
      let validLines = 0;
      let invalidLines = 0;
      
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Handle potential quotes in the CSV more carefully
        let columns = [];
        let inQuotes = false;
        let currentCol = '';
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          
          if (char === '"' && (j === 0 || line[j-1] !== '\\')) {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            columns.push(currentCol);
            currentCol = '';
          } else {
            currentCol += char;
          }
        }
        
        // Add the last column
        columns.push(currentCol);
        
        // Verify we have enough columns
        if (columns.length >= 5) {
          // Extract message and sentiment label
          const message = columns[3].toLowerCase().trim().replace(/^"|"$/g, '');
          const sentiment = columns[4].trim().replace(/^"|"$/g, '');
          
          if (message && sentiment) {
            // Store in our map for quick lookups
            this.messageToSentimentMap.set(message, sentiment);
            validLines++;
          } else {
            invalidLines++;
          }
        } else {
          invalidLines++;
          console.warn(`Invalid line ${i}: Insufficient columns`, line);
        }
      }
      
      console.log(`Loaded ${this.messageToSentimentMap.size} sentiment entries from CSV`);
      console.log(`Valid lines: ${validLines}, Invalid lines: ${invalidLines}`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
    }
  }
  
  // fallbackToOriginalDictionaries() {
  //   console.log('Falling back to original dictionaries');
  //   // Predefined sentiment dictionaries from original code
  //   this.positiveWords = [
  //     'pog', 'poggers', 'pogchamp', 'based', 'W', 'fire', 'sick', 
  //     'amazing', 'awesome', 'epic', 'great', 'love', 'hype', 
  //     'legendary', 'insane', 'incredible', 'nice', 'awesome', 
  //     'fantastic', 'woohoo', 'yes', 'good', 'best', 'perfect'
  //   ];

  //   this.negativeWords = [
  //     'L', 'trash', 'bad', 'worst', 'cringe', 'fail', 'terrible', 
  //     'awful', 'stupid', 'dumb', 'sad', 'mad', 'angry', 'hate', 
  //     'boring', 'meh', 'garbage', 'terrible', 'wtf', 'bruh', 'no'
  //   ];
  // }

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

  extractChatMessages() {
    const messagesContainer = document.querySelector('#chatroom-messages');
    
    if (!messagesContainer) return [];

    const messageElements = messagesContainer.querySelectorAll('[data-index]');
    
    const messages = [];
    
    Array.from(messageElements).forEach(messageEl => {
      // Get the username
      const usernameElement = messageEl.querySelector('.chat-entry-username');
      const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
      
      // Get the message text
      const messageTextElement = messageEl.querySelector('div[class*="break-words"]');
      const messageText = messageTextElement ? messageTextElement.textContent.trim().toLowerCase() : '';
      
      if (messageText.length > 0) {
        messages.push({
          username: username,
          message: messageText
        });
      }
    });
    
    return messages;
  }

  analyzeMood(messages) {
    let sentimentScore = 0;
    let totalMessages = messages.length;
    
    if (totalMessages === 0) return { mood: 'Waiting for chat...', level: 2 };

    // Reset user sentiments for this analysis session
    this.userSentiments = {};
    
    messages.forEach(message => {
      let messageScore = 0;
      
      // Check if we have a pre-labeled sentiment for this exact message
      if (this.sentimentDataLoaded && this.messageToSentimentMap.has(message.message)) {
        const sentimentLabel = this.messageToSentimentMap.get(message.message);
        
        // Convert label to score
        if (sentimentLabel === 'label_2') {
          messageScore = 1; // positive
        } else if (sentimentLabel === 'label_0') {
          messageScore = -1; // negative
        } else {
          messageScore = 0; // neutral (label_1)
        }
      } else {
        // Fall back to the original word-based analysis if no exact match
        const words = message.message.split(/\s+/);

        words.forEach((word, index) => {
          // Check for intensifiers
          if (this.intensifiers[word]) {
            // Look ahead to the next word and multiply its impact
            const intensityMultiplier = this.intensifiers[word];
            const nextWord = words[index + 1];
            
            if (this.sentimentDataLoaded) {
              // We don't have word-level data in our CSV, so skip this with new approach
            } else if (this.positiveWords && this.positiveWords.includes(nextWord)) {
              messageScore += 1 * intensityMultiplier;
            } else if (this.negativeWords && this.negativeWords.includes(nextWord)) {
              messageScore -= 1 * intensityMultiplier;
            }
          }

          // Direct word matching for fallback mode
          if (!this.sentimentDataLoaded) {
            if (this.positiveWords && this.positiveWords.includes(word)) {
              messageScore += 1;
            }
            if (this.negativeWords && this.negativeWords.includes(word)) {
              messageScore -= 1;
            }
          }
        });
      }

      sentimentScore += messageScore;
      
      // Update user's sentiment tracking
      if (!this.userSentiments[message.username]) {
        this.userSentiments[message.username] = {
          totalScore: 0,
          messageCount: 0,
          averageScore: 0
        };
      }
      
      this.userSentiments[message.username].totalScore += messageScore;
      this.userSentiments[message.username].messageCount += 1;
      this.userSentiments[message.username].averageScore = 
        this.userSentiments[message.username].totalScore / this.userSentiments[message.username].messageCount;
    });

    // Find most positive and most toxic users
    let mostPositiveUser = { username: 'None', score: -Infinity };
    let mostToxicUser = { username: 'None', score: Infinity };
    
    Object.entries(this.userSentiments).forEach(([username, data]) => {
      // Only consider users who sent at least 2 messages
      if (data.messageCount >= 2) {
        if (data.averageScore > mostPositiveUser.score) {
          mostPositiveUser = { username, score: data.averageScore };
        }
        
        if (data.averageScore < mostToxicUser.score) {
          mostToxicUser = { username, score: data.averageScore };
        }
      }
    });

    // Normalize sentiment score
    const normalizedScore = sentimentScore / totalMessages;
    const moodObj = this.interpretMood(normalizedScore);
    
    // Add user data to the mood object
    moodObj.mostPositiveUser = mostPositiveUser.username;
    moodObj.mostToxicUser = mostToxicUser.username;
    moodObj.positiveScore = mostPositiveUser.score.toFixed(1);
    moodObj.toxicScore = mostToxicUser.score.toFixed(1);

    return moodObj;
  }

  interpretMood(score) {
    // We need to flip the level calculation since the meter image has negative on the right
    if (score > 1) return { mood: 'HYPE 🔥', level: 0 };  // Highest positive is now at level 0
    if (score > 0.5) return { mood: 'Positive 😄', level: 1 };
    if (score > 0) return { mood: 'Slightly Positive 🙂', level: 2 };
    if (score === 0) return { mood: 'Neutral 😐', level: 2 };
    if (score > -0.5) return { mood: 'Slightly Negative 😕', level: 3 };
    if (score > -1) return { mood: 'Negative 😒', level: 4 };
    return { mood: 'TOXIC 🤬', level: 4 };  // Highest negative is now at level 4
  }

  getMoodLevelPercentage(level) {
    // Convert mood level (0-4) to a percentage position (0-100%) for the arrow
    // 0 = leftmost (most positive), 4 = rightmost (most negative)
    // Each level is 20% of the width (5 levels total)
    return level * 20 + 10; // +10 to center within each segment
  }

  getExplanation(moodObj) {
    const explanations = {
      'HYPE 🔥': 'Chat is extremely excited and engaged!',
      'Positive 😄': 'Viewers are feeling good and supportive.',
      'Slightly Positive 🙂': 'Overall pleasant atmosphere.',
      'Neutral 😐': 'Chat is calm and balanced.',
      'Slightly Negative 😕': 'Some tension or mild frustration.',
      'Negative 😒': 'Chat is getting upset or critical.',
      'TOXIC 🤬': 'High negativity and potential conflict!',
      'Waiting for chat...': 'Collecting messages...'
    };

    return explanations[moodObj.mood] || 'Analyzing chat mood...';
  }

  startCollection() {
    if (this.isCollecting) return;
    
    this.isCollecting = true;
    this.collectionStartTime = Date.now();
    this.chatHistory = [];
    
    // Create calculating overlay
    this.showCalculatingOverlay();
    
    // Start periodically checking for new messages
    this.collectionInterval = setInterval(() => {
      const newMessages = this.extractChatMessages();
      
      // Add only new messages to our history
      const existingMessagesMap = new Map(this.chatHistory.map(msg => [msg.username + msg.message, true]));
      const uniqueNewMessages = newMessages.filter(msg => !existingMessagesMap.has(msg.username + msg.message));
      
      this.chatHistory = [...this.chatHistory, ...uniqueNewMessages];
      
      // Update collecting status on overlay
      const timeRemaining = Math.max(0, 10 - Math.floor((Date.now() - this.collectionStartTime) / 1000));
      this.updateCalculatingOverlay(`Analyzing chat in ${timeRemaining} seconds (${this.chatHistory.length} messages)`);
      
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
    const explanation = this.getExplanation(moodObj);
    
    // Update the widget with results
    this.createOrUpdateWidget(moodObj, explanation);
    
    // Send to popup as well
    chrome.runtime.sendMessage({ 
      mood: moodObj.mood, 
      level: moodObj.level,
      explanation: explanation,
      mostPositiveUser: moodObj.mostPositiveUser,
      mostToxicUser: moodObj.mostToxicUser,
      positiveScore: moodObj.positiveScore,
      toxicScore: moodObj.toxicScore
    });
    
    // Schedule next collection after specified interval
    // Convert minutes to milliseconds
    const updateFrequencyMs = parseInt(this.settings.updateFrequency) * 60 * 1000 || 300000; // Default to 5 minutes
    setTimeout(() => this.startCollection(), updateFrequencyMs);
  }

  createOrUpdateWidget(moodObj, explanation) {
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
      moodMeterImg.src = chrome.runtime.getURL('Mood_Meter.png');
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
        bottom: 0;
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
      
      // Add user sentiment section
      const userSentimentContainer = document.createElement('div');
      userSentimentContainer.id = 'user-sentiment-container';
      userSentimentContainer.style.cssText = `
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
      `;
      
      // User sentiment title
      const userSentimentTitle = document.createElement('div');
      userSentimentTitle.style.cssText = `
        font-size: 12px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.7);
      `;
      userSentimentTitle.textContent = 'Top Users';
      userSentimentContainer.appendChild(userSentimentTitle);
      
      // Positive user
      const positiveUserContainer = document.createElement('div');
      positiveUserContainer.className = 'user-sentiment-item';
      positiveUserContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
        padding: 5px 8px;
        background-color: rgba(75, 181, 67, 0.15);
        border-radius: 4px;
      `;
      
      const positiveUserLabel = document.createElement('div');
      positiveUserLabel.className = 'user-sentiment-label';
      positiveUserLabel.style.cssText = `
        font-size: 11px;
        color: rgba(255, 255, 255, 0.9);
      `;
      positiveUserLabel.innerHTML = '😄 <span id="most-positive-user">N/A</span>';
      
      const positiveScoreLabel = document.createElement('div');
      positiveScoreLabel.className = 'user-sentiment-score';
      positiveScoreLabel.style.cssText = `
        font-size: 11px;
        color: rgb(75, 181, 67);
        font-weight: bold;
      `;
      positiveScoreLabel.id = 'positive-user-score';
      positiveScoreLabel.textContent = 'N/A';
      
      positiveUserContainer.appendChild(positiveUserLabel);
      positiveUserContainer.appendChild(positiveScoreLabel);
      userSentimentContainer.appendChild(positiveUserContainer);
      
      // Toxic user
      const toxicUserContainer = document.createElement('div');
      toxicUserContainer.className = 'user-sentiment-item';
      toxicUserContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 8px;
        background-color: rgba(231, 76, 60, 0.15);
        border-radius: 4px;
      `;
      
      const toxicUserLabel = document.createElement('div');
      toxicUserLabel.className = 'user-sentiment-label';
      toxicUserLabel.style.cssText = `
        font-size: 11px;
        color: rgba(255, 255, 255, 0.9);
      `;
      toxicUserLabel.innerHTML = '😡 <span id="most-toxic-user">N/A</span>';
      
      const toxicScoreLabel = document.createElement('div');
      toxicScoreLabel.className = 'user-sentiment-score';
      toxicScoreLabel.style.cssText = `
        font-size: 11px;
        color: rgb(231, 76, 60);
        font-weight: bold;
      `;
      toxicScoreLabel.id = 'toxic-user-score';
      toxicScoreLabel.textContent = 'N/A';
      
      toxicUserContainer.appendChild(toxicUserLabel);
      toxicUserContainer.appendChild(toxicScoreLabel);
      userSentimentContainer.appendChild(toxicUserContainer);
      
      widget.appendChild(userSentimentContainer);
      
      // Add drag functionality with double-click activation
      let isDragging = false;
      let offsetX, offsetY;
      
      widget.addEventListener('dblclick', (e) => {
        // Highlight the widget border to indicate it can be moved
        widget.style.boxShadow = '0 0 0 3pxrgb(23, 214, 29)';
        
        // Allow for dragging immediately after double-click
        isDragging = true;
        offsetX = e.clientX - widget.getBoundingClientRect().left;
        offsetY = e.clientY - widget.getBoundingClientRect().top;
        
        // Auto-disable dragging mode after 5 seconds
        setTimeout(() => {
          widget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
          isDragging = false;
        }, 5000);
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        widget.style.left = (e.clientX - offsetX) + 'px';
        widget.style.top = (e.clientY - offsetY) + 'px';
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
      });
      
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
      
      // End dragging if user clicks anywhere else
      document.addEventListener('click', (e) => {
        if (isDragging && !widget.contains(e.target)) {
          isDragging = false;
          widget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        }
      });
      
      document.body.appendChild(widget);
      this.widgetCreated = true;
    }
    
    // Update user sentiment information
    if (moodObj.mostPositiveUser) {
      const positiveUserElement = document.getElementById('most-positive-user');
      const positiveScoreElement = document.getElementById('positive-user-score');
      
      if (positiveUserElement) {
        positiveUserElement.textContent = moodObj.mostPositiveUser;
      }
      
      if (positiveScoreElement) {
        const scoreDisplay = parseFloat(moodObj.positiveScore) > 0 ? `+${moodObj.positiveScore}` : moodObj.positiveScore;
        positiveScoreElement.textContent = scoreDisplay;
      }
    }
    
    if (moodObj.mostToxicUser) {
      const toxicUserElement = document.getElementById('most-toxic-user');
      const toxicScoreElement = document.getElementById('toxic-user-score');
      
      if (toxicUserElement) {
        toxicUserElement.textContent = moodObj.mostToxicUser;
      }
      
      if (toxicScoreElement) {
        toxicScoreElement.textContent = moodObj.toxicScore;
      }
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
      widget.style.backgroundColor = `rgba(30, 30, 30, ${(100 - transparency) / 100})`;
    }
  }
}

// Initialize and start the mood meter
const kickMoodMeter = new KickMoodMeter();

// Wait for page to fully load
window.addEventListener('load', () => {
  // Start initial collection after 2 seconds to ensure chat elements are loaded
  setTimeout(() => {
    kickMoodMeter.startCollection();
  }, 2000);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMood') {
    const moodObj = kickMoodMeter.analyzeMood(kickMoodMeter.chatHistory);
    const explanation = kickMoodMeter.getExplanation(moodObj);
    sendResponse({ 
      mood: moodObj.mood, 
      level: moodObj.level, 
      explanation: explanation,
      isVisible: !!document.getElementById('kick-mood-widget')?.style.display !== 'none',
      mostPositiveUser: moodObj.mostPositiveUser,
      mostToxicUser: moodObj.mostToxicUser,
      positiveScore: moodObj.positiveScore,
      toxicScore: moodObj.toxicScore
    });
  } 
  else if (request.action === 'toggleWidget') {
    const isVisible = kickMoodMeter.toggleWidget();
    sendResponse({ isVisible: isVisible });
  }
  else if (request.action === 'updateSettings') {
    kickMoodMeter.updateSettings(request.settings);
    sendResponse({ success: true });
  }
  return true;
});