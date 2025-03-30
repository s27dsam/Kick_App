// Mood detection content script
class KickMoodMeter {
  constructor() {
    // Will be populated from CSV
    this.sentimentLabels = {
      'label_0': 'negative',
      'label_1': 'neutral',
      'label_2': 'positive'
    };

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
        // Reset and restart collection
        this.chatHistory = [];
        this.resetSentimentCounts(); // ADD THIS LINE
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
  
      // Actually parse the CSV data after loading it
      this.parseSentimentCsv(csvText);
      
      this.sentimentDataLoaded = true;
      console.log('Sentiment map size after loading:', this.messageToSentimentMap.size);
      
      // Debug: Log some sample entries from the sentiment map
      let count = 0;
      for (const [message, sentiment] of this.messageToSentimentMap.entries()) {
        console.log(`Sample ${count+1}: "${message}" -> ${sentiment}`);
        count++;
        if (count >= 5) break; // Just show 5 samples
      }
    } catch (error) {
      console.error('Error loading sentiment data:', error);
      // Fall back to the original dictionaries if CSV loading fails
      this.fallbackToOriginalDictionaries();
    }
  }


  fallbackToOriginalDictionaries() {
    console.log('Falling back to original word dictionaries');
    
    // Positive words dictionary
    this.positiveWords = [
      // General positive words
      'good', 'great', 'awesome', 'amazing', 'excellent', 'fantastic', 'incredible', 'brilliant',
      'perfect', 'wonderful', 'outstanding', 'superb', 'magnificent', 'exceptional', 'marvelous',
      'terrific', 'fabulous', 'splendid', 'lovely', 'beautiful', 'impressive', 'remarkable',
      'stunning', 'breathtaking', 'phenomenal', 'epic', 'rad', 'sick', 'insane', 'fire',
      
      // Stream-specific positive words
      'poggers', 'pog', 'pogu', 'pogchamp', 'ez', 'gg', 'win', 'winner', 'victory', 'clutch',
      'cracked', 'goated', 'based', 'w', 'huge', 'godlike', 'legend', 'pro', 'skilled', 'talent',
      'carry', 'king', 'queen', 'beast', 'monster', 'genius', 'mastermind', 'dominating',
      'unstoppable', 'unreal', 'unbelievable', 'underrated', 'godtier', 'clean', 'smooth',
      'flawless', 'precise', 'accurate', 'smart', 'intelligent', 'wise', 'strategic', 'tactical',
      'hype', 'iconic', 'legendary', 'elite', 'superior', 'prayge', 'letsgoo', 'lets go',
      
      // Emotes and emote-like text often used positively
      'lol', 'xd', 'lmao', 'rofl', 'lulw', 'kekw', 'omegalul', 'pepelaugh', 'pepehands',
      'widepeeposad', 'widepeepoHappy', 'peepolove', 'peepoheart', 'catjam', 'peepodance',
      'widepeepohappy', 'pepega', 'pepejam', 'peepoclap', 'hypers', 'poggers', 'pogu',
      'peepogleeful', 'peeposhy', 'pepeheart', '<3', '♥', '❤️',
      
      // Supportive terms
      'support', 'thanks', 'thank you', 'appreciate', 'grateful', 'blessed', 'proud', 'respect',
      'admire', 'honor', 'applaud', 'cherish', 'value', 'adore', 'idol', 'inspiration', 'hero',
      'goat', 'best', 'top', 'favorite', 'fav', 'deserved', 'earned', 'worth', 'helpful',
      'generous', 'kind', 'caring', 'wholesome', 'friendly', 'welcoming', 'positive', 'uplifting',
      
      // Excitement expressions
      'yes', 'po', 'woo', 'woohoo', 'yay', 'omg', 'oh my god', 'holy', 'holy moly', 'unreal',
      'incredible', 'insane', 'crazy', 'wild', 'intense', 'exciting', 'thrilling', 'exhilarating',
      'astonishing', 'impressive', 'mind-blowing', 'mindblowing', 'game-changing', 'revolutionary',
      'innovative', 'creative', 'next-level', 'nextlevel', 'big brain', 'bigbrain'
    ];
    
    // Negative words dictionary
    this.negativeWords = [
      // General negative words
      'bad', 'terrible', 'awful', 'horrible', 'poor', 'disappointing', 'disappointing', 'pathetic',
      'miserable', 'dreadful', 'abysmal', 'atrocious', 'subpar', 'mediocre', 'inferior', 'useless',
      'worthless', 'garbage', 'trash', 'junk', 'rubbish', 'waste', 'joke', 'mess', 'disaster',
      'catastrophe', 'fail', 'failure', 'flop', 'bust', 'letdown', 'disgrace', 'embarrassment',
      
      // Stream-specific negative words
      'l', 'losing', 'loser', 'lose', 'lost', 'choke', 'throw', 'throwing', 'threw', 'bot',
      'boosted', 'carried', 'hardstuck', 'stuck', 'casual', 'noob', 'newb', 'newbie', 'scrub',
      'baddie', 'pleb', 'pepega', 'washed', 'outdated', 'overrated', 'overhyped', 'overpaid',
      'sellout', 'repetitive', 'boring', 'sleeper', 'residentsleeper', 'cringe', 'yikes',
      'awkward', 'weird', 'strange', 'sus', 'suspicious', 'sketch', 'sketchy', 'monkas',
      
      // Toxic expressions
      'idiot', 'stupid', 'dumb', 'moronic', 'braindead', 'brainless', 'clueless', 'hopeless',
      'incompetent', 'inept', 'dense', 'fool', 'clown', 'joke', 'bozo', 'doofus', 'buffoon',
      'clown', 'loser', 'deadbeat', 'degenerate', 'reject', 'fraud', 'phony', 'fake', 'poser',
      'wannabe', 'tryhard', 'try-hard', 'malding', 'tilted', 'toxic', 'salty', 'rage', 'triggered',
      'mad', 'angry', 'furious', 'livid', 'enraged', 'disgusting', 'gross', 'nasty', 'vile',
      'repulsive', 'revolting', 'despicable', 'detestable', 'loathsome', 'abhorrent', 'hateful',
      
      // Critical terms
      'quit', 'stop', 'leave', 'end', 'retire', 'give up', 'surrender', 'concede', 'forfeit',
      'awful', 'terrible', 'horrible', 'garbage', 'trash', 'junk', 'rubbish', 'waste', 'useless',
      'worthless', 'disgraceful', 'disgraceful', 'shameful', 'shameless', 'pathetic', 'pitiful',
      'miserable', 'wretched', 'deplorable', 'disappointing', 'dismal', 'dreadful', 'unbearable',
      'intolerable', 'insufferable', 'unacceptable', 'unsatisfactory', 'unpleasant', 'unenjoyable',
      
      // Complaint expressions
      'lag', 'laggy', 'buggy', 'glitchy', 'broken', 'bugged', 'rigged', 'scuffed', 'scam',
      'scammed', 'cheating', 'cheated', 'hacking', 'hacked', 'unfair', 'biased', 'prejudiced',
      'corrupt', 'corrupted', 'unbalanced', 'op', 'overpowered', 'underpowered', 'nerfed',
      'handicapped', 'disadvantaged', 'unlucky', 'unfortunate', 'cursed', 'doomed', 'stressful',
      'frustrating', 'aggravating', 'annoying', 'irritating', 'infuriating', 'maddening',
      'exasperating', 'vexing', 'grating', 'irksome'
    ];
    
    console.log('Loaded fallback dictionaries with', 
      this.positiveWords.length, 'positive words and', 
      this.negativeWords.length, 'negative words');
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
        
        // Check if we have sentiment data for this message
        if (this.messageToSentimentMap.has(messageText)) {
          const sentiment = this.messageToSentimentMap.get(messageText);
          console.log(`  → Sentiment match found: ${sentiment}`);
        } else {
          console.log(`  → No sentiment match found`);
        }
        
        messages.push({
          username: username,
          message: messageText
        });
      }
    });
    
    console.log(`Total messages extracted: ${messages.length}`);
    return messages;
  }

  analyzeMood(messages) {
    // Reset counts for this analysis
    this.resetSentimentCounts();
    
    let sentimentScore = 0;
    let totalMessages = messages.length;
    
    console.log(`Analyzing mood for ${totalMessages} messages`);
    console.log(`Sentiment data loaded: ${this.sentimentDataLoaded}`);
    console.log(`Message to sentiment map size: ${this.messageToSentimentMap.size}`);

    // Add at the beginning of analyzeMood
      console.log("Dictionaries loaded:", {
      positiveWordsLoaded: Array.isArray(this.positiveWords),
      positiveWordsCount: Array.isArray(this.positiveWords) ? this.positiveWords.length : 0,
      negativeWordsLoaded: Array.isArray(this.negativeWords),
      negativeWordsCount: Array.isArray(this.negativeWords) ? this.negativeWords.length : 0
    });
        
    if (totalMessages === 0) return { mood: 'Waiting for chat...', level: 2 };
    
    // Debug: Log if we have any sentiment matches at all
    if (this.messageToSentimentMap.size > 0) {
      let foundMatches = 0;
      messages.forEach(message => {
        if (this.messageToSentimentMap.has(message.message)) {
          foundMatches++;
        }
      });
      console.log(`Found ${foundMatches} sentiment matches out of ${totalMessages} messages`);
    }
    
    messages.forEach((message, index) => {
      let messageScore = 0;
      
      // Check if we have a pre-labeled sentiment for this exact message
      if (this.sentimentDataLoaded && this.messageToSentimentMap.has(message.message)) {
        const sentimentLabel = this.messageToSentimentMap.get(message.message);
        console.log(`Message ${index}: "${message.message}" has sentiment: ${sentimentLabel}`);
        
        // Convert label to score and increment count
        if (sentimentLabel === 'label_2') {
          messageScore = 1; // positive
          this.sentimentCounts.positive++;
          console.log(`  → Positive sentiment detected`);
        } else if (sentimentLabel === 'label_0') {
          messageScore = -1; // negative
          this.sentimentCounts.negative++;
          console.log(`  → Negative sentiment detected`);
        } else {
          messageScore = 0; // neutral (label_1)
          this.sentimentCounts.neutral++;
          console.log(`  → Neutral sentiment detected`);
        }
      } else {
        console.log(`Message ${index}: "${message.message}" - no sentiment data, using fallback`);
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
        
        // Increment sentiment count based on message score for the fallback case
        if (messageScore > 0) {
          this.sentimentCounts.positive++;
          console.log(`  → Detected as positive through fallback method`);
        } else if (messageScore < 0) {
          this.sentimentCounts.negative++;
          console.log(`  → Detected as negative through fallback method`);
        } else {
          this.sentimentCounts.neutral++;
          console.log(`  → Detected as neutral through fallback method`);
        }
      }
  
      sentimentScore += messageScore;
    });
  
    console.log('Final sentiment counts:', this.sentimentCounts);
    
    // Use new intensity-based interpretation instead of the original normalized approach
    const moodObj = this.interpretMoodWithIntensity();
    console.log('Mood interpretation:', moodObj);
    
    return moodObj;
  }

  interpretMoodWithIntensity() {
    console.log('Sentiment counts:', this.sentimentCounts);
    
    // Use the sentiment counts to determine intensity
    if (this.sentimentCounts.positive >= 3) {
      return { mood: 'HYPE 🔥', level: 0 };
    } else if (this.sentimentCounts.positive === 2) {
      return { mood: 'Positive 😄', level: 1 };
    } else if (this.sentimentCounts.positive === 1) {
      return { mood: 'Slightly Positive 🙂', level: 2 };
    }
    
    // Negative intensity - 1 message makes it slightly negative, 2 makes it negative
    if (this.sentimentCounts.negative >= 3) {
      return { mood: 'TOXIC 🤬', level: 4 };
    } else if (this.sentimentCounts.negative === 2) {
      return { mood: 'Negative 😒', level: 3 };
    } else if (this.sentimentCounts.negative === 1) {
      return { mood: 'Slightly Negative 😕', level: 2 };
    }
    
    // Default to neutral if no clear sentiment emerges
    return { mood: 'Neutral 😐', level: 1 };
    // return { mood: 'Slightly Positive 🙂', level: 1 };
  }

  calculateMoodStats() {
    // Initialize counters
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;
    
    // Reset intensity counts
    this.resetSentimentCounts();
    
    // Analyze each message in chat history
    this.chatHistory.forEach(message => {
      // Check if we have a pre-labeled sentiment for this message
      if (this.sentimentDataLoaded && this.messageToSentimentMap.has(message.message)) {
        const sentimentLabel = this.messageToSentimentMap.get(message.message);
        
        // Count based on sentiment label
        if (sentimentLabel === 'label_2') {
          positiveCount++; // positive
          this.sentimentCounts.positive++;
        } else if (sentimentLabel === 'label_0') {
          negativeCount++; // negative
          this.sentimentCounts.negative++;
        } else {
          neutralCount++; // neutral (label_1)
          this.sentimentCounts.neutral++;
        }
      } else {
        // For messages without labels, use the original word-based analysis
        const words = message.message.split(/\s+/);
        let messageScore = 0;
        
        words.forEach((word, index) => {
          // Check for intensifiers
          if (this.intensifiers[word]) {
            const intensityMultiplier = this.intensifiers[word];
            const nextWord = words[index + 1];
            
            if (!this.sentimentDataLoaded) {
              // Original word-based approach
              if (this.positiveWords && this.positiveWords.includes(nextWord)) {
                messageScore += 1 * intensityMultiplier;
              } else if (this.negativeWords && this.negativeWords.includes(nextWord)) {
                messageScore -= 1 * intensityMultiplier;
              }
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
        
        if (messageScore > 0) {
          positiveCount++;
          this.sentimentCounts.positive++;
        } else if (messageScore < 0) {
          negativeCount++;
          this.sentimentCounts.negative++;
        } else {
          neutralCount++;
          this.sentimentCounts.neutral++;
        }
      }
    });
    
    // Calculate percentages
    const total = positiveCount + neutralCount + negativeCount;
    if (total > 0) {
      this.moodStats.positive = (positiveCount / total) * 100;
      this.moodStats.neutral = (neutralCount / total) * 100;
      this.moodStats.negative = (negativeCount / total) * 100;
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
    return level * 20 + 9; // +10 to center within each segment
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
    
    // Send to popup as well
    chrome.runtime.sendMessage({ 
      mood: moodObj.mood, 
      level: moodObj.level,
      explanation: explanation
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
  
// Replace the toggleWidget method with this improved version
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




// Replace the chrome.runtime.onMessage listener with this improved version
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  
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
      moodStats: kickMoodMeter.moodStats
    });
  }
  // Add this to the bottom of the chrome.runtime.onMessage listener
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
  else if (request.action === 'forceShow') {
    // Add a special debug action to force showing the widget
    console.log('Force showing widget requested');
    
    if (!document.getElementById('kick-mood-widget')) {
      kickMoodMeter.createOrUpdateWidget({mood: 'Debug Mode', level: 2}, 'Forced widget display');
    }
    
    const widget = document.getElementById('kick-mood-widget');
    if (widget) {
      widget.style.display = 'block';
      widget.style.opacity = '1';
      sendResponse({ success: true, message: 'Widget forced to show' });
    } else {
      sendResponse({ success: false, message: 'Could not create widget' });
    }
  }
  
  return true;
});


