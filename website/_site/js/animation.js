document.addEventListener('DOMContentLoaded', function() {
  // Check if we're on a mobile device
  function isMobileDevice() {
    return window.innerWidth <= 768 || 
           navigator.userAgent.match(/Android/i) || 
           navigator.userAgent.match(/iPhone|iPad|iPod/i);
  }
  
  // Set up the intersection observer for animation trigger
  function setupIntersectionObserver() {
    const terminalContent = document.querySelector('.terminal-content');
    if (!terminalContent) return;
    
    // Make sure terminal is hidden initially on mobile
    if (isMobileDevice()) {
      terminalContent.classList.add('not-visible');
    }
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Delay visibility slightly to ensure smooth animation
          setTimeout(() => {
            entry.target.classList.add('visible');
            entry.target.classList.remove('not-visible');
          }, 100);
          
          // Stop observing once animation has started
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.4, // Start animation when 40% of the element is visible
      rootMargin: '0px 0px -100px 0px' // Trigger a bit before the element is fully in view
    });
    
    // Start observing the terminal content
    observer.observe(terminalContent);
  }
  
  // Initial setup
  setupIntersectionObserver();
  
  // Also setup touch event as a fallback for mobile
  const terminalContent = document.querySelector('.terminal-content');
  if (terminalContent && isMobileDevice()) {
    // Add a touchstart listener as a fallback trigger
    window.addEventListener('touchstart', function() {
      // Only trigger if not already visible
      if (!terminalContent.classList.contains('visible')) {
        terminalContent.classList.add('visible');
        terminalContent.classList.remove('not-visible');
      }
    }, { once: true }); // Only trigger once
    
    // Also handle scroll events as another fallback
    let scrollTriggered = false;
    window.addEventListener('scroll', function() {
      if (!scrollTriggered && !terminalContent.classList.contains('visible')) {
        const rect = terminalContent.getBoundingClientRect();
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // If terminal is in viewport
        if (rect.top <= windowHeight && rect.bottom >= 0) {
          terminalContent.classList.add('visible');
          terminalContent.classList.remove('not-visible');
          scrollTriggered = true;
        }
      }
    }, { passive: true });
  }
}); 