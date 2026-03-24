document.addEventListener('DOMContentLoaded', function() {
  function isMobileDevice() {
    return window.innerWidth <= 768 ||
           navigator.userAgent.match(/Android/i) ||
           navigator.userAgent.match(/iPhone|iPad|iPod/i);
  }

  // Hero terminal animation trigger
  function setupTerminalObserver() {
    const terminalContent = document.querySelector('.terminal-content');
    if (!terminalContent) return;

    if (isMobileDevice()) {
      terminalContent.classList.add('not-visible');
    }

    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          setTimeout(function() {
            entry.target.classList.add('visible');
            entry.target.classList.remove('not-visible');
          }, 100);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.4,
      rootMargin: '0px 0px -100px 0px'
    });

    observer.observe(terminalContent);

    // Mobile fallbacks
    if (isMobileDevice()) {
      window.addEventListener('touchstart', function() {
        if (!terminalContent.classList.contains('visible')) {
          terminalContent.classList.add('visible');
          terminalContent.classList.remove('not-visible');
        }
      }, { once: true });

      var scrollTriggered = false;
      window.addEventListener('scroll', function() {
        if (!scrollTriggered && !terminalContent.classList.contains('visible')) {
          var rect = terminalContent.getBoundingClientRect();
          var windowHeight = window.innerHeight || document.documentElement.clientHeight;
          if (rect.top <= windowHeight && rect.bottom >= 0) {
            terminalContent.classList.add('visible');
            terminalContent.classList.remove('not-visible');
            scrollTriggered = true;
          }
        }
      }, { passive: true });
    }
  }

  // Scroll-triggered reveal animations
  function setupRevealObserver() {
    var reveals = document.querySelectorAll('[data-reveal]');
    if (!reveals.length) return;

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    reveals.forEach(function(el) {
      observer.observe(el);
    });
  }

  setupTerminalObserver();
  setupRevealObserver();
});
