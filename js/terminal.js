document.addEventListener('DOMContentLoaded', () => {
  // Get terminal element
  const terminalContent = document.querySelector('.terminal-content');
  
  // Track if initial animation has run
  let hasAnimationRun = false;
  
  // Function to display static content without animation
  function showStaticContent(terminal) {
    const animatedLine = terminal.querySelector('.animated-line');
    if (!animatedLine) return;
    
    // Get the text content from data attribute
    const fullText = animatedLine.getAttribute('data-text');
    
    // Set the content directly without animation
    animatedLine.innerHTML = `<span class="token string">${fullText}</span>`;
  }
  
  // Function to animate the last line with an LLM-like typing effect
  function animateLastLine(terminal) {
    // If animation has already run, just show content statically
    if (hasAnimationRun) {
      showStaticContent(terminal);
      return;
    }
    
    // Mark that animation has run
    hasAnimationRun = true;
    
    // Get the last line content from data attribute
    const lastLine = terminal.querySelector('.animated-line');
    if (!lastLine) return;
    
    const fullText = lastLine.getAttribute('data-text');
    
    // Prepare animation elements without clearing existing content yet
    const animationContainer = document.createElement('span');
    animationContainer.classList.add('token', 'string');
    
    const cursor = document.createElement('span');
    cursor.classList.add('terminal-cursor');
    
    // Clear and set up the elements
    lastLine.innerHTML = '';
    lastLine.appendChild(animationContainer);
    lastLine.appendChild(cursor);
    
    // Split text into tokens (words or parts of words)
    // This creates a more realistic LLM-like effect
    const tokens = fullText.split(/\b/);
    let currentText = '';
    let tokenIndex = 0;
    
    // Function to add the next token with a variable delay
    function addNextToken() {
      if (tokenIndex < tokens.length) {
        // Add the next token
        currentText += tokens[tokenIndex];
        animationContainer.textContent = currentText;
        tokenIndex++;
        
        // Random delay between tokens to simulate LLM thinking/generating
        const delay = Math.random() * 60 + 20; // 20-80ms random delay
        
        // Sometimes pause a bit longer to make it more realistic
        const shouldPauseLonger = Math.random() < 0.1; // 10% chance
        const actualDelay = shouldPauseLonger ? delay * 1.5 : delay;
        
        setTimeout(addNextToken, actualDelay);
      } else {
        // Animation complete, remove cursor
        cursor.remove();
      }
    }
    
    // Start the token-by-token animation
    addNextToken();
  }
  
  // Start the animation after a short delay
  setTimeout(() => {
    animateLastLine(terminalContent);
  }, 300);
}); 