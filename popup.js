document.addEventListener('DOMContentLoaded', () => {
  // Get current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Check if we're on a Kick.com page
    if (tabs[0].url.includes('kick.com')) {
      // Request current widget status from content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getMood' }, (response) => {
        if (response) {
          // Update toggle button text based on widget visibility
          updateToggleButton(response.isVisible);
          // Update status text
          document.getElementById('statusText').textContent = response.isVisible 
            ? 'Widget is active on current page' 
            : 'Widget is hidden on current page';
            
          // Update user sentiment information
          updateUserSentiment(response);
        } else {
          // Content script might not be loaded yet
          document.getElementById('statusText').textContent = 'Waiting for page to load...';
        }
      });
    } else {
      // Not on Kick.com
      document.getElementById('statusText').textContent = 'This extension only works on kick.com';
      disableButtons();
      hideUserSentiment();
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
  
  function updateUserSentiment(response) {
    // Update most positive user
    const mostPositiveUser = document.getElementById('mostPositiveUser');
    const positiveUserScore = document.getElementById('positiveUserScore');
    
    if (response.mostPositiveUser && response.mostPositiveUser !== 'None') {
      mostPositiveUser.textContent = response.mostPositiveUser;
      
      // Format positive score with a + sign if positive
      const scoreValue = parseFloat(response.positiveScore);
      const formattedScore = scoreValue > 0 ? `+${response.positiveScore}` : response.positiveScore;
      positiveUserScore.textContent = formattedScore;
    } else {
      mostPositiveUser.textContent = 'No data yet';
      positiveUserScore.textContent = '-';
    }
    
    // Update most toxic user
    const mostToxicUser = document.getElementById('mostToxicUser');
    const toxicUserScore = document.getElementById('toxicUserScore');
    
    if (response.mostToxicUser && response.mostToxicUser !== 'None') {
      mostToxicUser.textContent = response.mostToxicUser;
      toxicUserScore.textContent = response.toxicScore;
    } else {
      mostToxicUser.textContent = 'No data yet';
      toxicUserScore.textContent = '-';
    }
  }
  
  function hideUserSentiment() {
    const userSentimentContainer = document.querySelector('.user-sentiment-container');
    if (userSentimentContainer) {
      userSentimentContainer.style.display = 'none';
    }
  }
  
  function disableButtons() {
    document.getElementById('toggleWidgetBtn').disabled = true;
    document.getElementById('settingsBtn').disabled = true;
    
    document.getElementById('toggleWidgetBtn').style.opacity = 0.5;
    document.getElementById('settingsBtn').style.opacity = 0.5;
  }
  
  // Set up message listener to receive updates from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.mood) {
      // Update user sentiment information if available
      updateUserSentiment(message);
    }
  });
});