document.addEventListener('DOMContentLoaded', () => {
  // Get terminal elements
  const terminalModules = document.getElementById('terminal-modules');
  const terminalScripts = document.getElementById('terminal-scripts');
  
  // Get toggle buttons
  const toggleModules = document.getElementById('toggle-modules');
  const toggleScripts = document.getElementById('toggle-scripts');
  
  // Track if initial animation has run
  let hasAnimationRun = false;
  
  // Function to remove animated line from a terminal
  function removeAnimatedLine(terminal) {
    const animatedLine = terminal.querySelector('.animated-line');
    if (animatedLine) {
      animatedLine.remove();
    }
  }
  
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
        const delay = Math.random() * 60 + 20; // 20-80ms random delay (even faster)
        
        // Sometimes pause a bit longer to make it more realistic
        const shouldPauseLonger = Math.random() < 0.1; // 10% chance (reduced from 15%)
        const actualDelay = shouldPauseLonger ? delay * 1.5 : delay; // 1.5x pause (reduced from 2x)
        
        setTimeout(addNextToken, actualDelay);
      } else {
        // Animation complete, remove cursor
        cursor.remove();
      }
    }
    
    // Start the token-by-token animation
    addNextToken();
  }
  
  // Remove animated line from scripts tab completely
  removeAnimatedLine(terminalScripts);
  
  // Start with the modules animation after a short delay
  setTimeout(() => {
    animateLastLine(terminalModules);
  }, 300);

  // Toggle between modules and scripts
  toggleModules.addEventListener('click', () => {
    terminalModules.style.display = 'block';
    terminalScripts.style.display = 'none';
    toggleModules.classList.add('active');
    toggleScripts.classList.remove('active');
  });

  toggleScripts.addEventListener('click', () => {
    terminalModules.style.display = 'none';
    terminalScripts.style.display = 'block';
    toggleModules.classList.remove('active');
    toggleScripts.classList.add('active');
  });
}); 