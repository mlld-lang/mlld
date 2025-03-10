document.addEventListener('DOMContentLoaded', () => {
  const terminal = document.querySelector('.hero-terminal');
  
  // Terminal content with syntax highlighting
  const content = [
    '<span class="token keyword">@import</span> <span class="token bracket">[</span><span class="token variable">roles</span><span class="token bracket">, </span><span class="token variable">tasks</span><span class="token bracket">]</span> from <span class="token bracket">[</span>prompts.mld<span class="token bracket">]</span>',
    '<span class="space"></span>',
    '<span class="token keyword">@text</span> <span class="token variable">arch</span> = <span class="token keyword">@embed</span> <span class="token bracket">[</span>README.md <span class="token selector"># Architecture</span><span class="token bracket">]</span>',
    '<span class="token keyword">@text</span> <span class="token variable">standards</span> = <span class="token keyword">@embed</span> <span class="token bracket">[</span>README.md <span class="token selector"># Code Standards</span><span class="token bracket">]</span>',
    '<span class="token keyword">@text</span> <span class="token variable">diff</span> = <span class="token keyword">@run</span> <span class="token bracket">[</span>git diff | cat<span class="token bracket">]</span>',
    '<span class="space"></span>',
    '<span class="token keyword">@text</span> <span class="token variable">prompt</span> = <span class="token bracket">[[</span>',
    '  Read our docs: <span class="token variable">{{arch}}</span> <span class="token variable">{{standards}}</span>',
    '  Latest changes: <span class="token variable">{{diff}}</span>',
    '  Your task: <span class="token variable">{{tasks.codereview}}</span>',
    '<span class="token bracket">]]</span>',
    '<span class="space"></span>',
    '<span class="token keyword">@run</span> <span class="token bracket">[</span>oneshot <span class="token variable">{{prompt}}</span> --system <span class="token variable">{{roles.architect}}</span><span class="token bracket">]</span>',
    '<span class="space"></span>',
    '<span class="token operator">---</span>',
    '<span class="space"></span>',
    '<span class="token string">LLM: "Here\'s my code review..."</span>'
  ];

  function animateTerminal() {
    if (!terminal) return;
    
    // Clear terminal and add all lines except the last one
    const terminalContent = document.querySelector('.terminal-content');
    terminalContent.innerHTML = '';
    
    // Add all lines except the last
    for (let i = 0; i < content.length - 1; i++) {
      const line = document.createElement('div');
      line.innerHTML = content[i];
      // Add space class to div if it contains a space span
      if (content[i] === '<span class="space"></span>') {
        line.classList.add('space');
      }
      terminalContent.appendChild(line);
    }
    
    // Create last line with cursor
    const lastLine = document.createElement('div');
    lastLine.classList.add('typing-line');
    terminalContent.appendChild(lastLine);
    
    // Start typing animation for last line
    const lastLineText = content[content.length - 1];
    let i = 0;
    let plainText = lastLineText.replace(/<[^>]*>/g, ''); // Get plain text for length calculation
    
    const typingInterval = setInterval(() => {
      if (i <= plainText.length) {
        // For the typing animation, we'll show the raw HTML but only up to the current character count
        lastLine.innerHTML = lastLineText;
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

  // Initialize terminal
  animateTerminal();
}); 