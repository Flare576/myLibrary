# FLARE UI/UX Design Suggestions

## Overview
Based on FLARE_IDEA.md requirements, this document provides concrete UI/UX design patterns for an aggregated game library interface with passwordless authentication and multi-platform game display.

## Authentication Flow Design

### Simple Three-State Auth Flow

**Visual States:**
1. **Unauthenticated State**
   - Clean landing page with email input field
   - Minimal branding: "FLARE Game Library Aggregator"
   - Clear CTA: "Enter your email to get started"
   - Loading spinner appears immediately after email submission

2. **Pending State**
   - Persistent notification: "Check your email for verification link"
   - Visual polling indicator (pulsing dot or progress bar)
   - Option to resend verification email
   - Countdown timer showing remaining validation time

3. **Validated State**
   - Smooth transition to main dashboard
   - Welcome message: "Welcome back, [nickname]!"
   - Clear indication of connected platforms
   - Quick access to add more platforms

## Platform Connection Interface

### Platform Linking Cards
```html
<div class="platform-card" data-platform="steam">
  <div class="platform-icon">🎮</div>
  <h3>Steam</h3>
  <p>Connect your Steam library</p>
  <button class="connect-btn" onclick="connectPlatform('steam')">
    <span class="status-indicator disconnected"></span>
    Connect
  </button>
</div>
```

**Visual Indicators:**
- **Disconnected**: Gray card, "Connect" button
- **Connecting**: Yellow pulsing animation, "Connecting..."
- **Connected**: Green checkmark, game count badge
- **Error**: Red outline, retry button

## Aggregated Game Library Display

### Grid Layout System

**Mobile-First Responsive Grid:**
```css
.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  padding: 1rem;
}

@media (min-width: 768px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .game-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
```

### Game Card Design

**Minimal Game Card:**
```html
<div class="game-card" data-platform="steam" data-game-id="12345">
  <img src="game_cover.jpg" alt="Game Title" class="game-cover" 
       onerror="this.src='/placeholder.jpg'">
  <div class="game-info">
    <h4 class="game-title">Game Title</h4>
    <span class="platform-badge steam">Steam</span>
    <span class="playtime">12.5h played</span>
  </div>
</div>
```

**Visual Elements:**
- Platform-specific color coding (Steam blue, Epic orange, GOG purple)
- Hover effects: subtle scale transform and shadow
- Loading states: skeleton screens for images
- Error handling: fallback placeholder images

## Navigation & Filtering System

### Platform Filter Bar
```html
<div class="platform-filter">
  <button class="filter-btn active" data-platform="all">All Platforms</button>
  <button class="filter-btn" data-platform="steam">Steam</button>
  <button class="filter-btn" data-platform="epic">Epic</button>
  <button class="filter-btn" data-platform="gog">GOG</button>
  <!-- Additional platforms -->
</div>
```

**Filter Features:**
- Real-time filtering with smooth transitions
- Platform count badges: "Steam (247)"
- Combined search and filter functionality
- URL hash support for shareable filtered views

### Search Implementation
```javascript
// Simple vanilla JS search
function searchGames(query) {
  const games = document.querySelectorAll('.game-card');
  games.forEach(game => {
    const title = game.querySelector('.game-title').textContent.toLowerCase();
    const matches = title.includes(query.toLowerCase());
    game.style.display = matches ? 'block' : 'none';
  });
}
```

## Responsive Design Considerations

### Steam Deck Optimization
- **Touch Targets**: Minimum 44px touch targets for Deck controls
- **Font Sizes**: Base 16px, larger for Deck screen (18-20px)
- **Grid Layout**: 2-3 columns on Deck, 4-5 on desktop
- **Navigation**: Bottom-aligned controls for thumb reach

### Mobile Responsive Patterns
- Collapsible sidebar navigation
- Swipe gestures for platform switching
- Optimized image loading (WebP where supported)
- Reduced motion for performance

## Visual Design System

### Color Palette
```css
:root {
  --primary: #2563eb;      /* Steam blue-inspired */
  --secondary: #f59e0b;   /* Epic orange */
  --accent: #8b5cf6;      /* GOG purple */
  --success: #10b981;     /* Connected green */
  --warning: #f59e0b;     /* Pending yellow */
  --error: #ef4444;       /* Error red */
  
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #111827;
    --bg-secondary: #1f2937;
    --text-primary: #f9fafb;
    --text-secondary: #d1d5db;
  }
}
```

### Typography Scale
```css
html {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
}

h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.5rem; font-weight: 600; }
h3 { font-size: 1.25rem; font-weight: 600; }
h4 { font-size: 1.125rem; font-weight: 500; }

@media (min-width: 768px) {
  h1 { font-size: 2.5rem; }
  h2 { font-size: 2rem; }
}
```

## Loading & Performance Patterns

### Skeleton Screens
```html
<div class="game-card loading">
  <div class="skeleton-image"></div>
  <div class="skeleton-text"></div>
  <div class="skeleton-badge"></div>
</div>
```

### Progressive Image Loading
```javascript
// Lazy load images with intersection observer
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        observer.unobserve(img);
      }
    });
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => {
    observer.observe(img);
  });
}
```

## Cache Footer Implementation

### 5-Minute Cache Indicator
```html
<footer class="cache-footer">
  <p>Data updated <span id="cache-timestamp">5 minutes ago</span></p>
  <button onclick="refreshData()" class="refresh-btn">
    <span class="refresh-icon">↻</span>
    Refresh
  </button>
</footer>
```

**Visual States:**
- **Fresh** (0-4 minutes): Green timestamp
- **Stale** (5+ minutes): Yellow timestamp, prominent refresh button
- **Refreshing**: Spinner animation, disabled button

## Accessibility Considerations

### WCAG 2.1 AA Compliance
- Minimum color contrast ratio of 4.5:1 for text
- Keyboard navigation support (Tab, Enter, Space)
- Screen reader announcements for state changes
- Focus indicators for all interactive elements
- Reduced motion support for animations

### ARIA Labels
```html
<button 
  class="platform-filter-btn" 
  data-platform="steam"
  aria-label="Filter by Steam platform"
  aria-pressed="false">
  Steam
</button>

<div 
  class="status-indicator" 
  aria-live="polite"
  aria-label="Authentication status: pending">
  <span class="visually-hidden">Pending verification</span>
</div>
```

## Implementation Checklist

### Phase 1: Core Authentication
- [ ] Email input form with validation
- [ ] Pending state UI with polling indicator
- [ ] Validation success transition
- [ ] Local storage token management

### Phase 2: Platform Connection
- [ ] Platform card components
- [ ] OAuth flow integration
- [ ] Connection status indicators
- [ ] Error handling and retry logic

### Phase 3: Game Display
- [ ] Responsive grid layout
- [ ] Game card components
- [ ] Platform filtering system
- [ ] Search functionality
- [ ] Image loading optimization

### Phase 4: Polish & Performance
- [ ] Skeleton screens
- [ ] Cache footer implementation
- [ ] Accessibility enhancements
- [ ] Mobile/Steam Deck optimization

## Technical Constraints & Solutions

### Vanilla JS Limitations
- Use modern ES6+ features supported by Steam Deck browser
- Implement simple state management with localStorage
- Use CSS variables for theming instead of preprocessors
- Leverage browser-native APIs (IntersectionObserver, Fetch)

### PHP Backend Integration
- AJAX calls for platform connection flows
- JSON responses for game data
- Error handling with user-friendly messages
- Session management through tokens

### Performance Budget
- Keep initial bundle under 100KB (uncompressed)
- Lazy load platform-specific assets
- Optimize images with WebP and responsive sizes
- Minimize reflows and repaints with CSS transforms

## Next Steps

1. **Create wireframes** for each authentication state
2. **Develop HTML/CSS prototypes** for game grid and cards
3. **Implement vanilla JS state management**
4. **Test on Steam Deck browser** for touch/controller compatibility
5. **Iterate based on user feedback** and performance metrics

This design system provides a foundation for building a functional, accessible, and performant aggregated game library interface within the technical constraints of vanilla JS/CSS/HTML and PHP backend.