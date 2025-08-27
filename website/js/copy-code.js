// Add copy buttons to all code blocks
document.addEventListener('DOMContentLoaded', function() {
  // Find all pre elements that contain code blocks
  const codeBlocks = document.querySelectorAll('pre');
  
  codeBlocks.forEach((pre) => {
    // Skip if this pre already has a copy button
    if (pre.querySelector('.code-copy-button')) return;
    
    // Create wrapper div to position the button
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    wrapper.style.position = 'relative';
    
    // Move the pre element into the wrapper
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'code-copy-button';
    copyButton.innerHTML = `
      <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="check-icon" style="display: none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    
    // Add click handler
    copyButton.addEventListener('click', async () => {
      // Get the code text from the pre element
      const code = pre.textContent || pre.innerText;
      
      try {
        await navigator.clipboard.writeText(code);
        
        // Show success state
        copyButton.classList.add('copied');
        copyButton.querySelector('.copy-icon').style.display = 'none';
        copyButton.querySelector('.check-icon').style.display = 'block';
        
        // Reset after 2 seconds
        setTimeout(() => {
          copyButton.classList.remove('copied');
          copyButton.querySelector('.copy-icon').style.display = 'block';
          copyButton.querySelector('.check-icon').style.display = 'none';
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          // Show success state
          copyButton.classList.add('copied');
          copyButton.querySelector('.copy-icon').style.display = 'none';
          copyButton.querySelector('.check-icon').style.display = 'block';
          
          setTimeout(() => {
            copyButton.classList.remove('copied');
            copyButton.querySelector('.copy-icon').style.display = 'block';
            copyButton.querySelector('.check-icon').style.display = 'none';
          }, 2000);
        } catch (err) {
          console.error('Fallback copy failed:', err);
        }
        document.body.removeChild(textArea);
      }
    });
    
    // Add the button to the wrapper
    wrapper.appendChild(copyButton);
  });
});