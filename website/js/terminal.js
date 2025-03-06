document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.querySelector('.hero-terminal');
  const tabs = document.querySelectorAll('.terminal-tab');
  
  // Terminal content for different tabs
  const terminalContent = {
    'tab1': [
      '$ meld process example.md',
      'Processing file: example.md',
      'Resolving imports...',
      'Expanding variables...',
      'Output written to example.out.md',
      ''
    ],
    'tab2': [
      '$ meld --help',
      'meld - Modular prompt templating tool',
      '',
      'USAGE:',
      '  meld process <file> [options]',
      '  meld convert <file> [options]',
      ''
    ],
    'tab3': [
      '$ cat template.md',
      '---',
      '@define name = "World"',
      '@define greeting = "Hello"',
      '',
      '{{ greeting }}, {{ name }}!',
      ''
    ]
  };

  // Function to animate typing the last line
  function animateTerminal(content, tabId) {
    if (!terminal) return;
    
    // Clear terminal and add all lines except the last one
    const terminalContent = document.querySelector('.terminal-content');
    terminalContent.innerHTML = '';
    
    // Add all lines except the last
    for (let i = 0; i < content.length - 1; i++) {
      const line = document.createElement('div');
      line.textContent = content[i];
      terminalContent.appendChild(line);
    }
    
    // Create last line with cursor
    const lastLine = document.createElement('div');
    lastLine.classList.add('typing-line');
    terminalContent.appendChild(lastLine);
    
    // Start typing animation for last line
    if (content.length > 1) {
      const lastLineText = content[content.length - 2];
      let i = 0;
      
      const typingInterval = setInterval(() => {
        if (i <= lastLineText.length) {
          lastLine.textContent = lastLineText.substring(0, i);
          i++;
        } else {
          clearInterval(typingInterval);
          
          // Add cursor element after typing is done
          const cursor = document.createElement('span');
          cursor.classList.add('terminal-cursor');
          lastLine.appendChild(cursor);
        }
      }, 50);
    }
  }

  // Set active tab functionality
  function setActiveTab(tabId) {
    tabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Animate terminal with content for this tab
    animateTerminal(terminalContent[tabId], tabId);
  }

  // Add click event listeners to tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = tab.getAttribute('data-tab');
      setActiveTab(tabId);
    });
  });

  // Initialize with first tab
  setActiveTab('tab1');
}); 