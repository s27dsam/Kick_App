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
      updateFrequencyValue.textContent = `${updateFrequency} minutes`;
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
    
    document.getElementById('toggleWidgetBtn').style.opacity = 0.5;
    document.getElementById('settingsBtn').style.opacity = 0.5;
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
  });
});

// Add this to your popup.js
// Replace the incorrect event listener at the bottom of your file with this:
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
          if (response.mood && response.mood.includes('Positive') || response.mood.includes('HYPE')) {
            overallMoodElement.style.color = "#4caf50";
          } else if (response.mood && response.mood.includes('Negative') || response.mood.includes('TOXIC')) {
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