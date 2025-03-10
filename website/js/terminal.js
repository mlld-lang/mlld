document.addEventListener('DOMContentLoaded', () => {
  // Get terminal elements
  const terminalModules = document.getElementById('terminal-modules');
  const terminalScripts = document.getElementById('terminal-scripts');
  
  // Get toggle buttons
  const toggleModules = document.getElementById('toggle-modules');
  const toggleScripts = document.getElementById('toggle-scripts');
  
  // Set terminal height based on the taller content
  function setTerminalHeight() {
    const terminalContainer = document.querySelector('.hero-terminal');
    
    // Make both terminals visible for height calculation
    const originalModulesDisplay = terminalModules.style.display;
    const originalScriptsDisplay = terminalScripts.style.display;
    
    // Temporarily position both terminals absolute so they don't affect page flow
    // but can still be measured
    const originalModulesPosition = terminalModules.style.position;
    const originalScriptsPosition = terminalScripts.style.position;
    
    terminalModules.style.display = 'block';
    terminalScripts.style.display = 'block';
    terminalModules.style.position = 'static';
    terminalScripts.style.position = 'static';
    
    // Force layout recalculation to get proper heights
    const modulesHeight = terminalModules.scrollHeight;
    const scriptsHeight = terminalScripts.scrollHeight;
    
    // Find the taller one and add substantial extra padding
    const maxHeight = Math.max(modulesHeight, scriptsHeight) + 100;
    
    // Set the fixed height on the container
    terminalContainer.style.height = maxHeight + 'px';
    
    // Reset terminals to their original display state
    terminalModules.style.display = originalModulesDisplay;
    terminalScripts.style.display = originalScriptsDisplay;
    terminalModules.style.position = originalModulesPosition;
    terminalScripts.style.position = originalScriptsPosition;
  }
  
  // Function to animate the last line with a typing effect
  function animateLastLine(terminal) {
    // Get the last line content from data attribute
    const lastLine = terminal.querySelector('.animated-line');
    if (!lastLine) return;
    
    const fullText = lastLine.getAttribute('data-text');
    
    // Clear the existing content but keep the span structure
    lastLine.innerHTML = '<span class="token string"></span><span class="terminal-cursor"></span>';
    const textSpan = lastLine.querySelector('.token.string');
    
    // Type one character at a time
    let i = 0;
    const typingInterval = setInterval(() => {
      if (i < fullText.length) {
        textSpan.textContent = fullText.substring(0, i + 1);
        i++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);
  }
  
  // Set height after a brief delay to ensure all content is rendered
  setTimeout(() => {
    setTerminalHeight();
    
    // Start with the modules animation since it's visible by default
    animateLastLine(terminalModules);
  }, 100);

  // Toggle between modules and scripts
  toggleModules.addEventListener('click', () => {
    terminalModules.style.display = 'block';
    terminalScripts.style.display = 'none';
    toggleModules.classList.add('active');
    toggleScripts.classList.remove('active');
    
    // Trigger animation when switching to modules tab
    animateLastLine(terminalModules);
  });

  toggleScripts.addEventListener('click', () => {
    terminalModules.style.display = 'none';
    terminalScripts.style.display = 'block';
    toggleModules.classList.remove('active');
    toggleScripts.classList.add('active');
    
    // Trigger animation when switching to scripts tab
    animateLastLine(terminalScripts);
  });
  
  // Re-calculate on window resize
  window.addEventListener('resize', setTerminalHeight);
}); 