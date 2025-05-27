// mobile-optimizations.js
// Mobile-specific optimizations for preventing scroll, zoom, and enforcing portrait

console.log('Mobile optimizations loaded');

// ===== PREVENT SCROLLING AND ZOOMING =====

// 1. PREVENT BOUNCE SCROLLING ON iOS
document.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });

// 2. PREVENT ZOOM ON DOUBLE TAP
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// 3. PREVENT CONTEXT MENU (RIGHT CLICK / LONG PRESS)
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// ===== ORIENTATION HANDLING =====

// 4. LOCK ORIENTATION TO PORTRAIT (if supported)
function lockOrientationToPortrait() {
    if ('screen' in window && 'orientation' in window.screen) {
        try {
            window.screen.orientation.lock('portrait').then(() => {
                console.log('Orientation locked to portrait');
            }).catch(err => {
                console.log('Orientation lock not supported or failed:', err);
            });
        } catch (error) {
            console.log('Orientation lock not available:', error);
        }
    }
}

// 5. HANDLE ORIENTATION CHANGES
function handleOrientationChange() {
    console.log('Orientation changed, adjusting layout...');
    
    // Force layout recalculation
    setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        
        // Ensure app container fills screen
        setFullscreen();
    }, 100);
}

window.addEventListener('orientationchange', handleOrientationChange);
window.addEventListener('resize', handleOrientationChange);

// ===== NAVIGATION AND USER EXPERIENCE =====

// 6. PREVENT ACCIDENTAL NAVIGATION
window.addEventListener('beforeunload', function(e) {
    // Only prevent if in a game or multiplayer session
    const inGame = document.querySelector('.cell.disabled') || 
                   window.location.search.includes('room=') ||
                   document.querySelector('#side-menu.open');
    
    if (inGame) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave? Your game will be lost.';
        return e.returnValue;
    }
});

// 7. PREVENT ZOOM ON INPUT FOCUS (Additional JS approach for iOS Safari)
function preventZoomOnInputFocus() {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            // Temporarily increase font size to prevent zoom
            this.style.fontSize = '16px';
        });
        
        input.addEventListener('blur', function() {
            // Reset font size
            this.style.fontSize = '';
        });
    });
}

// ===== FULLSCREEN AND LAYOUT =====

// 8. ENSURE FULL SCREEN ON MOBILE
function setFullscreen() {
    // Set document and body to full height
    document.documentElement.style.height = '100%';
    document.body.style.height = '100%';
    
    // Scroll to top to hide address bar
    window.scrollTo(0, 0);
    
    // Force repaint
    document.body.style.display = 'none';
    document.body.offsetHeight; // Trigger reflow
    document.body.style.display = '';
}

// ===== INITIALIZATION =====

// Run optimizations when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing mobile optimizations...');
    
    // Apply all optimizations
    lockOrientationToPortrait();
    preventZoomOnInputFocus();
    setFullscreen();
    
    // Additional setup for PWA
    setupPWABehavior();
});

// Run on load and orientation change
window.addEventListener('load', function() {
    setFullscreen();
    lockOrientationToPortrait();
});

window.addEventListener('orientationchange', function() {
    setTimeout(() => {
        setFullscreen();
        lockOrientationToPortrait();
    }, 500);
});

// ===== PWA SPECIFIC BEHAVIOR =====

function setupPWABehavior() {
    // Detect if running as PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone ||
                  document.referrer.includes('android-app://');
    
    if (isPWA) {
        console.log('Running as PWA, applying additional optimizations...');
        
        // Hide any browser-specific elements when in PWA mode
        document.body.classList.add('pwa-mode');
        
        // Prevent any potential scrolling in PWA mode
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    }
}

// ===== ACCESSIBILITY IMPROVEMENTS =====

// Improve focus handling for keyboard navigation
document.addEventListener('keydown', function(e) {
    // Handle escape key to close modals/menus
    if (e.key === 'Escape') {
        const openMenu = document.querySelector('#side-menu.open');
        const openModal = document.querySelector('#qr-display-area[style*="block"]');
        
        if (openMenu) {
            openMenu.classList.remove('open');
        }
        if (openModal) {
            openModal.style.display = 'none';
        }
    }
    
    // Handle enter/space on game cells
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cell')) {
        e.preventDefault();
        e.target.click();
    }
});

// ===== PERFORMANCE OPTIMIZATIONS =====

// Debounce resize events to improve performance
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        console.log('Window resized, adjusting layout...');
        setFullscreen();
    }, 250);
});

// ===== DEBUGGING HELPERS =====

// Log important events for debugging
if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
    console.log('Development mode - enabling debug logs');
    
    window.addEventListener('touchstart', () => console.log('Touch start'));
    window.addEventListener('touchmove', () => console.log('Touch move (should be prevented)'));
    window.addEventListener('orientationchange', () => console.log('Orientation changed'));
    
    // Add debug info to window object
    window.mobileDebug = {
        isTouch: 'ontouchstart' in window,
        orientation: window.screen?.orientation?.type || 'unknown',
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        userAgent: navigator.userAgent
    };
}

// ===== EXPORT FOR POTENTIAL EXTERNAL USE =====

window.mobileOptimizations = {
    lockOrientation: lockOrientationToPortrait,
    setFullscreen: setFullscreen,
    handleOrientationChange: handleOrientationChange
};