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
    loadChatMessages();
  });

  // Back from feedback button
  document.getElementById('backFromFeedbackBtn').addEventListener('click', () => {
    document.getElementById('feedbackPanel').style.display = 'none';
    document.getElementById('mainPanel').style.display = 'block';
  });

  // Submit feedback button
  document.getElementById('submitFeedbackBtn').addEventListener('click', () => {
    const selectedMood = document.querySelector('input[name="chatMood"]:checked');
    
    if (!selectedMood) {
      // Show error if no mood is selected
      alert('Please select a mood for the chat');
      return;
    }
    
    // Get user's selected mood
    const moodValue = selectedMood.value;
    
    // Send feedback to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { 
        action: 'submitChatFeedback',
        overallMood: moodValue
      }, (response) => {
        if (response && response.success) {
          // Show success message
          const chatContainer = document.getElementById('chatMessagesContainer');
          chatContainer.innerHTML = '<div class="success-message">Feedback submitted successfully! Thank you for helping improve the model.</div>';
          
          // Get the batch text from the response
          const batchText = response.batchText || '';
          
          // Store the feedback with the actual messages for training
          storeFeedbackForTraining(moodValue, batchText, response.messages || []);
          
          // Reset the form
          document.querySelectorAll('input[name="chatMood"]').forEach(radio => {
            radio.checked = false;
          });
          
          // Return to main panel after a short delay
          setTimeout(() => {
            document.getElementById('feedbackPanel').style.display = 'none';
            document.getElementById('mainPanel').style.display = 'block';
          }, 2000);
        } else {
          alert('Failed to submit feedback. Please try again.');
        }
      });
    });
  });

  // Export feedback button
  document.getElementById('exportFeedbackBtn').addEventListener('click', () => {
    exportTrainingData();
  });

  // Function to load chat messages
  function loadChatMessages() {
    const chatContainer = document.getElementById('chatMessagesContainer');
    chatContainer.innerHTML = '<div class="loading-message">Loading chat messages...</div>';
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getChatMessages' }, (response) => {
        if (response && response.success && response.messages && response.messages.length > 0) {
          // Display the messages
          displayChatMessages(response.messages);
          
          // Pre-select the current mood if available
          if (response.currentMood) {
            const moodRadio = document.querySelector(`input[value="${response.currentMood}"]`);
            if (moodRadio) {
              moodRadio.checked = true;
            }
          }
        } else {
          chatContainer.innerHTML = '<div class="error-message">No chat messages available. Try collecting chat first.</div>';
        }
      });
    });
  }

  // Function to display chat messages
  function displayChatMessages(messages) {
    const chatContainer = document.getElementById('chatMessagesContainer');
    chatContainer.innerHTML = '';
    
    // Only display up to 20 messages to avoid UI overload
    const displayMessages = messages.slice(0, 20);
    
    displayMessages.forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message';
      
      messageElement.innerHTML = `
        <div class="chat-username">${escapeHtml(message.username)}</div>
        <div class="chat-text">${escapeHtml(message.message)}</div>
      `;
      
      chatContainer.appendChild(messageElement);
    });
    
    // Update message count
    const messageCount = document.createElement('div');
    messageCount.className = 'message-count';
    messageCount.textContent = `Showing ${displayMessages.length} of ${messages.length} total messages`;
    chatContainer.appendChild(messageCount);
  }

  // Helper function to escape HTML (security)
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Function to clean text for model training
  function cleanTextForTraining(text) {
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
  