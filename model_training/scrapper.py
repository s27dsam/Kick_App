from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager
import time
import json
import logging
import os
import traceback

# Set up logging
os.makedirs("model_training/data", exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("model_training/data/scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("KickChatScraper")

class KickChatScraper:
    def __init__(self):
        # Set up Chrome options
        self.options = Options()
        self.options.add_argument("--headless")  # Run in headless mode
        self.options.add_argument("--no-sandbox")
        self.options.add_argument("--disable-dev-shm-usage")
        self.options.add_argument("--disable-gpu")
        self.options.add_argument("--window-size=1920,1080")
        
        # Add user agent to look like a real browser
        self.options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        
        # Initialize driver
        self.driver = None
    
    def start_driver(self):
        """Initialize the Chrome driver if not already running"""
        if self.driver is None:
            try:
                logger.info("Starting Chrome driver")
                self.driver = webdriver.Chrome(
                    service=Service(ChromeDriverManager().install()),
                    options=self.options
                )
                logger.info("Chrome driver started successfully")
            except Exception as e:
                logger.error(f"Failed to start Chrome driver: {e}")
                logger.error(traceback.format_exc())
                raise
        return self.driver
    
    def close_driver(self):
        """Close the driver if it's running"""
        if self.driver:
            logger.info("Closing Chrome driver")
            self.driver.quit()
            self.driver = None
    
    def save_page_source(self, filename="page_source.html"):
        """Save the current page source for debugging"""
        if self.driver:
            with open(f"model_training/data/{filename}", "w", encoding="utf-8") as f:
                f.write(self.driver.page_source)
            logger.info(f"Page source saved to model_training/data/{filename}")
    
    def scrape_chat_messages(self, url, wait_time=15, max_messages=20):
        """
        Scrape chat messages from a Kick.com channel URL using the same approach
        as the Chrome extension's content.js
        
        Args:
            url (str): The URL of the Kick.com channel
            wait_time (int): Time to wait for chat to load in seconds
            max_messages (int): Maximum number of messages to return
            
        Returns:
            list: List of dictionaries containing username and message
        """
        logger.info(f"Scraping chat messages from {url}")
        try:
            driver = self.start_driver()
            driver.get(url)
            
            # Wait for the page to load
            logger.info(f"Waiting {wait_time} seconds for chat to load...")
            time.sleep(wait_time)
            
            # Take a screenshot for debugging
            driver.save_screenshot("model_training/data/page_screenshot.png")
            logger.info("Screenshot saved to model_training/data/page_screenshot.png")
            
            # Save page source for debugging
            self.save_page_source()
            
            # Check if it's a valid channel page (using logic from content.js)
            is_valid = driver.execute_script("""
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
                
                // Look for a chat element with various possible selectors
                const chatElement = document.querySelector('#chatroom-messages, #chat-room, .chat-messages, .chatroom, [id*="chat-messages"], [class*="chat-container"]');
                
                if (!chatElement) {
                    console.log('Not a channel page: no chat element found with any selector');
                    return false;
                }
                
                console.log('Found chat element:', chatElement);
                return true;
            """)
            
            if not is_valid:
                logger.warning("Not a valid Kick.com channel page")
                return []
            
            # Use the same chat extraction logic from the Chrome extension
            messages = driver.execute_script("""
                const messagesContainer = document.querySelector('#chatroom-messages');
                
                if (!messagesContainer) {
                    console.log('No chat messages container found');
                    return [];
                }
                
                console.log('Chat container:', messagesContainer);
                
                const messageElements = messagesContainer.querySelectorAll('[data-index]');
                console.log(`Found ${messageElements.length} message elements`);
                
                const messages = [];
                const maxMessages = arguments[0]; // Pass the max_messages parameter
                
                // Use slice to get the most recent messages only
                Array.from(messageElements).slice(-maxMessages).forEach((messageEl, index) => {
                    // Get the username using the same selector as content.js
                    const usernameElement = messageEl.querySelector('.chat-entry-username');
                    const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
                    
                    // Get the message text using the same selector as content.js
                    const messageTextElement = messageEl.querySelector('div[class*="break-words"]');
                    const messageText = messageTextElement ? messageTextElement.textContent.trim() : '';
                    
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
            """, max_messages)
            
            logger.info(f"Extracted {len(messages)} chat messages")
            
            # Save messages to file for debugging
            with open("model_training/data/scraped_messages.json", "w", encoding="utf-8") as f:
                json.dump(messages, f, indent=2)
            logger.info("Scraped messages saved to model_training/data/scraped_messages.json")
            
            return messages
            
        except Exception as e:
            logger.error(f"Error scraping chat messages: {e}")
            logger.error(traceback.format_exc())
            if self.driver:
                self.save_page_source("error_page.html")
                self.driver.save_screenshot("model_training/data/error_screenshot.png")
            return []
        
    def get_channel_name(self, url):
        """Extract channel name from URL"""
        logger.info(f"Extracting channel name from {url}")
        # Split the URL by '/'
        parts = url.split('/')
        
        # Find the part after kick.com/
        for i in range(len(parts)):
            if 'kick.com' in parts[i] and i + 1 < len(parts):
                # Get the next part after kick.com
                channel_name = parts[i + 1]
                
                # Remove any query parameters or hash
                channel_name = channel_name.split('?')[0]
                channel_name = channel_name.split('#')[0]
                
                logger.info(f"Extracted channel name: {channel_name}")
                return channel_name
        
        logger.warning("Could not extract channel name, using default")
        return 'Channel'  # Default fallback

# Example usage
if __name__ == "__main__":
    scraper = KickChatScraper()
    messages = scraper.scrape_chat_messages("https://kick.com/your-channel-here")
    print(json.dumps(messages, indent=2))
    scraper.close_driver()