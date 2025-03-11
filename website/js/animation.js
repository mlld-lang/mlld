document.addEventListener('DOMContentLoaded', function() {
  // Only set up the observer on mobile devices
  if (window.innerWidth <= 768) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          entry.target.classList.remove('not-visible');
          // Optional: stop observing once animation has started
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.2 // Start animation when 20% of the element is visible
    });

    // Find and observe the terminal content
    const terminalContent = document.querySelector('.terminal-content');
    if (terminalContent) {
      terminalContent.classList.add('not-visible');
      observer.observe(terminalContent);
    }
  }
}); 