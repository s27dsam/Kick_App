document.addEventListener('DOMContentLoaded', () => {
  // Get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Check if we're on a Kick.com page
    if (tabs[0].url.includes('kick.com')) {
      // Request current widget status and mood stats from content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getMood' }, (response) => {
        if (response) {
          // Update toggle button text based on widget visibility
          updateToggleButton(response.isVisible);
          // Update status text
          document.getElementById('statusText').textContent = response.isVisible 
            ? 'Widget is active on current page' 
            : 'Widget is hidden on current page';
          
          // Update mood statistics if available
          if (response.moodStats) {
            updateMoodStats(response.moodStats);
          }
          
          // Update the message count
          if (response.messageCount !== undefined) {
            document.getElementById('messageCount').textContent = `Messages analyzed: ${response.messageCount}`;
          }
        } else {
          // Content script might not be loaded yet
          document.getElementById('statusText').textContent = 'Waiting for page to load...';
        }
      });
    } else {
      // Not on Kick.com
      document.getElementById('statusText').textContent = 'This extension only works on kick.com';
      disableButtons();
    }
  });

  // Toggle Widget button functionality
  document.getElementById('toggleWidgetBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleWidget' }, (response) => {
        if (response) {
          updateToggleButton(response.isVisible);
          document.getElementById('statusText').textContent = response.isVisible 
            ? 'Widget is active on current page' 
            : 'Widget is hidden on current page';
        }
      });
    });
  });

  // Settings button functionality
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('customizationPanel').style.display = 'block';
    document.getElementById('mainPanel').style.display = 'none';
    document.getElementById('feedbackPanel').style.display = 'none';
  });

  // Back button functionality
  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('customizationPanel').style.display = 'none';
    document.getElementById('mainPanel').style.display = 'block';
  });

  // Update frequency display when slider moves
  const updateFrequencyRange = document.getElementById('updateFrequencyRange');
  const updateFrequencyValue = document.getElementById('updateFrequencyValue');
  
  updateFrequencyRange.addEventListener('input', () => {
    const value = updateFrequencyRange.value;
    updateFrequencyValue.textContent = value === '1' ? '1 minute' : `${value} minutes`;
  });

  // Save settings functionality
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const settings = {
      transparency: document.getElementById('transparencyRange').value,
      updateFrequency: document.getElementById('updateFrequencyRange').value
    };
    
    // Save to storage
    chrome.storage.local.set({ moodMeterSettings: settings }, () => {
      // Send to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'updateSettings', 
          settings: settings 
        });
      });
      
      // Return to main panel
      document.getElementById('customizationPanel').style.display = 'none';
      document.getElementById('mainPanel').style.display = 'block';
    });
  });

  // Load existing settings
  chrome.storage.local.get('moodMeterSettings', (data) => {
    if (data.moodMeterSettings) {
      document.getElementById('transparencyRange').value = data.moodMeterSettings.transparency || 85;
      const updateFrequency = data.moodMeterSettings.updateFrequency || 5;
      document.getElementById('updateFrequencyRange').value = updateFrequency;
      updateFrequencyValue.textContent = updateFrequency === 1 ? '1 minute' : `${updateFrequency} minutes`;
    }
  });
  
  // Helper functions
  function updateToggleButton(isVisible) {
    const toggleBtn = document.getElementById('toggleWidgetBtn');
    if (isVisible) {
      toggleBtn.textContent = 'Hide Widget';
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
          <line x1="2" x2="22" y1="2" y2="22"></line>
        </svg>
        Hide Widget
      `;
      toggleBtn.classList.add('hide');
    } else {
      toggleBtn.textContent = 'Show Widget';
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        Show Widget
      `;
      toggleBtn.classList.remove('hide');
    }
  }
  
  function disableButtons() {
    document.getElementById('toggleWidgetBtn').disabled = true;
    document.getElementById('settingsBtn').disabled = true;
    document.getElementById('trainModelBtn').disabled = true;
    
    document.getElementById('toggleWidgetBtn').style.opacity = 0.5;
    document.getElementById('settingsBtn').style.opacity = 0.5;
    document.getElementById('trainModelBtn').style.opacity = 0.5;
  }
  
  // Function to update the mood statistics display
  function updateMoodStats(moodStats) {
    // Format percentages
    const positive = Math.round(moodStats.positive);
    const neutral = Math.round(moodStats.neutral);
    const negative = Math.round(moodStats.negative);
    
    // Update progress bars
    document.getElementById('positiveBar').style.width = `${positive}%`;
    document.getElementById('neutralBar').style.width = `${neutral}%`;
    document.getElementById('negativeBar').style.width = `${negative}%`;
    
    // Update percentage text
    document.getElementById('positiveValue').textContent = `${positive}%`;
    document.getElementById('neutralValue').textContent = `${neutral}%`;
    document.getElementById('negativeValue').textContent = `${negative}%`;
    
    // Determine overall mood
    let overallMood = "Neutral";
    if (positive > neutral && positive > negative) {
      overallMood = "Positive";
    } else if (negative > neutral && negative > positive) {
      overallMood = "Negative";
    }
    
    // Update overall mood text with color coding
    const overallMoodElement = document.getElementById('overallMoodValue');
    overallMoodElement.textContent = overallMood;
    
    // Apply color coding to overall mood
    if (overallMood === "Positive") {
      overallMoodElement.style.color = "#4caf50";
    } else if (overallMood === "Negative") {
      overallMoodElement.style.color = "#f44336";
    } else {
      overallMoodElement.style.color = "#2196f3";
    }
  }
  
  // Set up message listener to receive updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateMoodStats" && message.moodStats) {
      updateMoodStats(message.moodStats);
    }
    
    if (message.action === "updateMood") {
      // Update mood stats if available
      if (message.moodStats) {
        updateMoodStats(message.moodStats);
      }
      
      // Update message count
      if (message.messageCount !== undefined) {
        document.getElementById('messageCount').textContent = `Messages analyzed: ${message.messageCount}`;
      }
      
      // Update overall mood display if available
      if (message.mood) {
        const overallMoodElement = document.getElementById('overallMoodValue');
        if (overallMoodElement) {
          overallMoodElement.textContent = message.mood;
          
          // Apply color coding
          if (message.mood.includes('Positive') || message.mood.includes('HYPE')) {
            overallMoodElement.style.color = "#4caf50";
          } else if (message.mood.includes('Negative') || message.mood.includes('TOXIC')) {
            overallMoodElement.style.color = "#f44336";
          } else {
            overallMoodElement.style.color = "#2196f3";
          }
        }
      }
    }
  });

  // Collect Now button functionality
  document.getElementById('collectNowBtn').addEventListener('click', function() {
    // Update button state
    const button = document.getElementById('collectNowBtn');
    button.textContent = 'Collecting...';
    button.disabled = true;
    
    // Send manual collection request
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'manualCollection'}, function(response) {
        // Reset button
        button.textContent = 'Collect Chat Now';
        button.disabled = false;
        
        if (response && response.success) {
          // Update UI with new results
          // Update the message count
          document.getElementById('messageCount').textContent = `Messages analyzed: ${response.messageCount}`;
          
          // If you have mood stats from the response, update them
          if (response.moodStats) {
            updateMoodStats(response.moodStats);
          }
          
          // Update overall mood display based on the response
          const overallMoodElement = document.getElementById('overallMoodValue');
          if (overallMoodElement) {
            overallMoodElement.textContent = response.mood || 'Neutral';
            
            // Apply color coding
            if (response.mood && (response.mood.includes('Positive') || response.mood.includes('HYPE'))) {
              overallMoodElement.style.color = "#4caf50";
            } else if (response.mood && (response.mood.includes('Negative') || response.mood.includes('TOXIC'))) {
              overallMoodElement.style.color = "#f44336";
            } else {
              overallMoodElement.style.color = "#2196f3";
            }
          }
        } else {
          // Show error
          document.getElementById('statusText').textContent = response && response.message ? 
            response.message : 'Could not analyze chat on this page';
        }
      });
    });
  });

  // Train Model button functionality
  document.getElementById('trainModelBtn').addEventListener('click', () => {
    document.getElementById('mainPanel').style.display = 'none';
    document.getElementById('feedbackPanel').style.display = 'block';
    startMessageLabeling();
  });

  // Back from feedback button
  document.getElementById('backFromFeedbackBtn').addEventListener('click', () => {
    document.getElementById('feedbackPanel').style.display = 'none';
    document.getElementById('mainPanel').style.display = 'block';
  });

  // Global variables for message labeling
  let messagesToLabel = [];
  let currentMessageIndex = 0;
  let labeledMessages = [];
  let totalLabeledCount = 0;

  // Function to start message labeling process
  function startMessageLabeling() {
    // Reset session state but keep labeled messages
    messagesToLabel = [];
    currentMessageIndex = 0;
    
    // Load previously labeled messages from storage
    chrome.storage.local.get(['labeledMessages'], (data) => {
      // Initialize or use existing labeled messages
      labeledMessages = data.labeledMessages || [];
      totalLabeledCount = labeledMessages.length;
      
      // Load new messages from content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getChatMessages' }, (response) => {
          if (response && response.success && response.messages && response.messages.length > 0) {
            // Filter out messages that have already been labeled
            const labeledMessageIds = new Set(labeledMessages.map(m => m.username + '|' + m.message));
            messagesToLabel = response.messages.filter(msg => 
              !labeledMessageIds.has(msg.username + '|' + msg.message)
            );
            
            console.log(`Loaded ${messagesToLabel.length} new messages to label (filtered from ${response.messages.length} total)`);
            
            // Update the progress display with total previously labeled messages
            updateProgressDisplay();
            
            if (messagesToLabel.length > 0) {
              showNextMessage();
            } else {
              if (totalLabeledCount > 0) {
                showEmptyState(`You have already labeled all available messages! (${totalLabeledCount} total)`);
              } else {
                showEmptyState('No unlabeled messages found. Try collecting chat first.');
              }
            }
          } else {
            showEmptyState();
          }
        });
      });
    });
  }

  // Show empty state when no messages are available
  function showEmptyState(customMessage) {
    const messageCard = document.getElementById('messageCard');
    
    // Default message if no custom message provided
    const message = customMessage || 'No chat messages available';
    const subMessage = customMessage 
      ? (totalLabeledCount > 0 ? `You've labeled ${totalLabeledCount} messages so far` : '') 
      : 'Try collecting chat first using the \'Collect Chat Now\' button';
    
    messageCard.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
        </svg>
        <p>${message}</p>
        <p>${subMessage}</p>
      </div>
    `;
    
    // Hide the sentiment buttons and progress display
    document.querySelector('.sentiment-buttons').style.display = 'none';
    document.getElementById('labelingProgress').style.display = 'none';
  }

  // Display the next message to be labeled
  function showNextMessage() {
    const messageCard = document.getElementById('messageCard');
    
    // Check if we've reached the end
    if (currentMessageIndex >= messagesToLabel.length) {
      messageCard.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <p>You've labeled all available messages in this batch!</p>
          <p>${totalLabeledCount > 0 ? `Total labeled messages: ${totalLabeledCount + (labeledMessages.length - totalLabeledCount)}` : ''}</p>
          <p>Collect more chat or export your labeled data</p>
        </div>
      `;
      
      // Hide the sentiment buttons (no more messages to label)
      document.querySelector('.sentiment-buttons').style.display = 'none';
      
      // Save the most recent batch of labels to storage
      saveLabeledMessages();
      
      return;
    }
    
    // Get the current message
    const message = messagesToLabel[currentMessageIndex];
    
    // Final check for empty messages - if this message is empty, skip to the next one
    if (!message.message || message.message.trim().length < 3) {
      console.log('Skipping empty message in showNextMessage function');
      currentMessageIndex++;
      showNextMessage(); // Recursively call to get the next valid message
      return;
    }
    
    // Update the message card
    messageCard.innerHTML = `
      <div class="message-card-inner">
        <div class="message-card-username">${escapeHtml(message.username)}</div>
        <div class="message-card-text">${escapeHtml(message.message)}</div>
      </div>
    `;
    
    // Make sure the sentiment buttons are visible
    document.querySelector('.sentiment-buttons').style.display = 'flex';
  }

  // Update progress display
  function updateProgressDisplay() {
    const progressBar = document.getElementById('progressBar');
    const labeledCount = document.getElementById('labeledCount');
    const totalCount = document.getElementById('totalCount');
    
    // For this session: current labeled messages out of total messages to label
    const sessionLabeled = labeledMessages.length - totalLabeledCount;
    
    // Calculate progress percentage for current batch
    const progress = messagesToLabel.length > 0 
      ? (sessionLabeled / messagesToLabel.length) * 100
      : 0;
    
    // Update progress bar
    progressBar.style.width = `${progress}%`;
    
    // Update text display with both current session and total counts
    labeledCount.textContent = sessionLabeled;
    totalCount.textContent = messagesToLabel.length;
    
    // Add a small badge showing the total labeled messages
    const labelingProgress = document.getElementById('labelingProgress');
    
    // Check if we already have a total counter and update it
    let totalCounter = document.getElementById('totalLabeledCounter');
    if (totalLabeledCount > 0 || sessionLabeled > 0) {
      if (!totalCounter) {
        totalCounter = document.createElement('div');
        totalCounter.id = 'totalLabeledCounter';
        totalCounter.className = 'total-labeled';
        totalCounter.style.cssText = 'font-size: 12px; color: #aaa; text-align: center; margin-top: 5px;';
        labelingProgress.appendChild(totalCounter);
      }
      
      totalCounter.textContent = `Total labeled messages: ${totalLabeledCount + sessionLabeled}`;
    }
  }
  
  // Save labeled messages to storage
  function saveLabeledMessages() {
    if (labeledMessages.length <= totalLabeledCount) {
      return; // Nothing new to save
    }
    
    // Get only the newly labeled messages in this session
    const newlyLabeledMessages = labeledMessages.slice(totalLabeledCount);
    
    // Save to content script storage
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'storeLabeledMessages',
        labeledMessages: newlyLabeledMessages
      }, (response) => {
        if (response && response.success) {
          console.log(`Saved ${newlyLabeledMessages.length} newly labeled messages`);
          totalLabeledCount += newlyLabeledMessages.length;
        } else {
          console.error('Failed to save labeled messages');
        }
      });
    });
  }

  // Sentiment button clicks
  document.getElementById('btnPositive').addEventListener('click', () => {
    labelCurrentMessage('Positive');
  });
  
  document.getElementById('btnNeutral').addEventListener('click', () => {
    labelCurrentMessage('Neutral');
  });
  
  document.getElementById('btnNegative').addEventListener('click', () => {
    labelCurrentMessage('Negative');
  });
  
  // Skip button
  document.getElementById('skipMessageBtn').addEventListener('click', () => {
    skipCurrentMessage();
  });

  // Label the current message and move to the next
  function labelCurrentMessage(sentiment) {
    // Make sure we have a message to label
    if (currentMessageIndex >= messagesToLabel.length) return;
    
    // Get the current message
    const message = messagesToLabel[currentMessageIndex];
    
    // Last check to make sure this is actually a valid message with content
    // If somehow an empty one got through all the filtering, we'll skip it
    if (!message.message || message.message.trim().length < 3) {
      console.log('Skipping empty message that passed through filters');
      currentMessageIndex++;
      showNextMessage();
      return;
    }
    
    // Add the labeled message to our collection
    labeledMessages.push({
      message: message.message,
      username: message.username,
      sentiment: sentiment,
      timestamp: Date.now()
    });
    
    // Animate card based on sentiment
    const messageCard = document.getElementById('messageCard');
    
    let animationClass = '';
    if (sentiment === 'Positive') {
      animationClass = 'swipe-right';
    } else if (sentiment === 'Negative') {
      animationClass = 'swipe-left';
    } else {
      animationClass = 'swipe-down';
    }
    
    // Add animation class
    messageCard.classList.add(animationClass);
    
    // After animation completes, show next message
    setTimeout(() => {
      messageCard.classList.remove(animationClass);
      currentMessageIndex++;
      updateProgressDisplay();
      
      // Periodically save every 10 messages
      if ((labeledMessages.length - totalLabeledCount) % 10 === 0) {
        saveLabeledMessages();
      }
      
      showNextMessage();
    }, 300);
  }

  // Skip current message and move to the next
  function skipCurrentMessage() {
    // Make sure we have a message to skip
    if (currentMessageIndex >= messagesToLabel.length) return;
    
    // Animation for skipping
    const messageCard = document.getElementById('messageCard');
    messageCard.classList.add('swipe-down');
    
    // After animation completes, show next message
    setTimeout(() => {
      messageCard.classList.remove('swipe-down');
      currentMessageIndex++;
      updateProgressDisplay();
      showNextMessage();
    }, 300);
  }

  // Export feedback button
  document.getElementById('exportFeedbackBtn').addEventListener('click', () => {
    exportLabeledMessages();
  });

  // Export labeled messages to CSV
  function exportLabeledMessages() {
    // Make sure any recent labels are saved first
    saveLabeledMessages();
    
    // Get all labeled messages from storage to ensure we export everything
    chrome.storage.local.get(['labeledMessages'], (data) => {
      const allLabeledMessages = data.labeledMessages || [];
      
      // Check if we have labeled messages
      if (allLabeledMessages.length === 0) {
        alert('No labeled messages to export. Please label some messages first.');
        return;
      }
      
      // Create CSV content
      let csvContent = 'data:text/csv;charset=utf-8,';
      
      // Header
      csvContent += 'message,sentiment_label\n';
      
      // Filter out and count empty messages before adding to CSV
      let emptyMessageCount = 0;
      let validMessages = 0;
      
      // Add each labeled message, skipping empty ones
      allLabeledMessages.forEach(item => {
        // Clean the message text for CSV
        const cleanedMessage = cleanTextForTraining(item.message);
        
        // Skip empty messages
        if (!cleanedMessage || cleanedMessage.trim() === '') {
          emptyMessageCount++;
          return;
        }
        
        // Skip very short messages
        if (cleanedMessage.trim().length < 2) {
          emptyMessageCount++;
          return;
        }
        
        // Escape quotes in the message text
        const escapedMessage = cleanedMessage.replace(/"/g, '""');
        
        // Add the row to CSV
        csvContent += `"${escapedMessage}","${item.sentiment}"\n`;
        validMessages++;
      });
      
      console.log(`Skipped ${emptyMessageCount} empty messages during export`);
      
      // Create download link
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `kick_sentiment_training_${Date.now()}.csv`);
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      
      // Show confirmation of export with filter info
      alert(`Successfully exported ${validMessages} labeled messages.\n\n${emptyMessageCount > 0 ? `(${emptyMessageCount} empty or too short messages were filtered out)` : ''}`);
    });
  }

  // Helper function to escape HTML (security)
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Function to clean text for model training
  function cleanTextForTraining(text) {
    // If empty text, return empty string for easy filtering
    if (!text) return "";
    
    // Remove timestamps (patterns like "HH:MM")
    let cleaned = text.replace(/\d\d:\d\d\s*/g, "");
    
    // Remove username prefixes (patterns like "username:")
    cleaned = cleaned.replace(/\w+:\s*/g, "");
    
    // Remove URLs
    cleaned = cleaned.replace(/https?:\/\/\S+/g, "");
    
    // Remove special characters and excessive whitespace
    cleaned = cleaned.replace(/[^\w\s]/g, " ");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    
    // Check if there's any actual text content left after cleaning
    if (!cleaned || cleaned.trim().length < 2) {
      return ""; // Return empty string for filtering
    }
    
    // Check if message only contains numbers (like "123456")
    if (/^\d+$/.test(cleaned)) {
      return ""; // Return empty string for filtering
    }
    
    return cleaned;
  }

  // Function to store feedback for model training
  function storeFeedbackForTraining(moodValue, batchText, messages) {
    chrome.storage.local.get(['trainingData'], (data) => {
      let trainingData = data.trainingData || [];
      
      // Create a new entry with detailed information
      const newEntry = {
        timestamp: Date.now(),
        mood: moodValue,
        batchText: batchText,
        url: window.location.href,
        streamTitle: document.title,
        // Store a cleaned version of the batch text for easier model training
        cleanedBatchText: cleanTextForTraining(batchText),
        // Store the first 5 messages as a sample (for review purposes)
        messageSamples: messages.slice(0, 5).map(msg => ({
          username: msg.username,
          message: msg.message
        })),
        // Store the message count
        messageCount: messages.length
      };
      
      // Add new feedback entry
      trainingData.push(newEntry);
      
      // Save back to storage
      chrome.storage.local.set({ trainingData }, () => {
        console.log('Training data saved:', newEntry);
      });
    });
  }

  // Function to export data in format suitable for model training
  function exportTrainingData() {
    chrome.storage.local.get(['trainingData'], (data) => {
      if (!data.trainingData || data.trainingData.length === 0) {
        alert('No training data available to export.');
        return;
      }
      
      // Create CSV content
      let csvContent = 'data:text/csv;charset=utf-8,';
      
      // Header: format needed for batch training
      csvContent += 'batch_text,sentiment_label\n';
      
      data.trainingData.forEach(item => {
        // Map mood to expected labels for the model
        let sentimentLabel;
        if (item.mood && (item.mood.includes('Positive') || item.mood.includes('HYPE'))) {
          sentimentLabel = 'Positive';
        } else if (item.mood && (item.mood.includes('Negative') || item.mood.includes('TOXIC'))) {
          sentimentLabel = 'Negative';
        } else {
          // Skip neutral entries as they're not useful for binary classification
          return;
        }
        
        // Use the cleaned batch text for training
        let batchText = item.cleanedBatchText || '';
        if (!batchText && item.batchText) {
          batchText = cleanTextForTraining(item.batchText);
        }
        
        // Skip empty entries
        if (!batchText.trim()) return;
        
        // Escape quotes in the batch text
        batchText = batchText.replace(/"/g, '""');
        
        // Add the row to CSV
        csvContent += `"${batchText}","${sentimentLabel}"\n`;
      });
      
      // Create download link
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `kick_sentiment_training_${Date.now()}.csv`);
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // Clean up
      document.body.removeChild(link);
    });
  }

  // Add data management buttons
  document.getElementById('dataManagementBtn')?.addEventListener('click', () => {
    // Show data management panel if it exists
    const dataPanel = document.getElementById('dataManagementPanel');
    if (dataPanel) {
      document.getElementById('mainPanel').style.display = 'none';
      dataPanel.style.display = 'block';
      
      // Load and display training data stats
      loadTrainingDataStats();
    }
  });
  
  // Back from data management button
  document.getElementById('backFromDataBtn')?.addEventListener('click', () => {
    document.getElementById('dataManagementPanel').style.display = 'none';
    document.getElementById('mainPanel').style.display = 'block';
  });
  
  // Clear training data button
  document.getElementById('clearDataBtn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all training data? This cannot be undone.')) {
      chrome.storage.local.remove(['trainingData'], () => {
        alert('All training data has been cleared.');
        
        // Update the stats display
        loadTrainingDataStats();
      });
    }
  });
  
  // Function to load and display training data stats
  function loadTrainingDataStats() {
    const statsContainer = document.getElementById('trainingDataStats');
    if (!statsContainer) return;
    
    chrome.storage.local.get(['trainingData'], (data) => {
      if (!data.trainingData || data.trainingData.length === 0) {
        statsContainer.innerHTML = '<div class="empty-data">No training data available.</div>';
        return;
      }
      
      // Count entries by sentiment 
      const counts = {
        Positive: 0,
        Negative: 0,
        Neutral: 0
      };
      
      data.trainingData.forEach(item => {
        if (item.mood && (item.mood.includes('Positive') || item.mood.includes('HYPE'))) {
          counts.Positive++;
        } else if (item.mood && (item.mood.includes('Negative') || item.mood.includes('TOXIC'))) {
          counts.Negative++;
        } else {
          counts.Neutral++;
        }
      });
      
      // Display stats
      statsContainer.innerHTML = `
        <div class="data-stat">Total training entries: <strong>${data.trainingData.length}</strong></div>
        <div class="data-stat">Positive entries: <strong>${counts.Positive}</strong></div>
        <div class="data-stat">Negative entries: <strong>${counts.Negative}</strong></div>
        <div class="data-stat">Neutral entries: <strong>${counts.Neutral}</strong></div>
        <div class="data-stat">Last entry: <strong>${new Date(data.trainingData[data.trainingData.length-1].timestamp).toLocaleString()}</strong></div>
      `;
    });
  }
});
  