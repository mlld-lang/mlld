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
  
  // Set height after a brief delay to ensure all content is rendered
  setTimeout(setTerminalHeight, 100);

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
  
  // Re-calculate on window resize
  window.addEventListener('resize', setTerminalHeight);
}); 