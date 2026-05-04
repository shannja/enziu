# Enziu Web Design System

## Overview

This document outlines the minimalist design system implemented for the Enziu web application.

## Typography

### Fonts
- **Headings**: Agrandir Regular (sans-serif) - Modern display font with clean lines
- **Body**: Object Sans Regular (sans-serif) - Clean, highly readable body font
- **Monospace**: JetBrains Mono - For code and technical content

### Font Weights
- Regular: 400 (only weight used for both display and body fonts)

## Colors

### Background & Text
- **Light Mode Background**: #FAFAFA (Off-white)
- **Light Mode Text**: #151515 (Near black)
- **Dark Mode Background**: #151515 (Near black)
- **Dark Mode Text**: #FFFFFF (White)

### Primary Palette
- **Brand Amber**: #FFBF00 (Primary accent color)
- **Amber Light**: #FFD54F
- **Amber Dark**: #FF8F00

### Grade Colors
- **A**: #22C55E (Green - Excellent)
- **B**: #84CC16 (Lime - Good)
- **C**: #EAB308 (Yellow - Average)
- **D**: #F97316 (Orange - Below Average)
- **F**: #EF4444 (Red - Poor)

### Semantic Colors (HSL)
All semantic colors use CSS variables for easy theming:
- `--background` / `--foreground`
- `--primary` / `--primary-foreground`
- `--secondary` / `--secondary-foreground`
- `--muted` / `--muted-foreground`
- `--accent` / `--accent-foreground`
- `--destructive` / `--destructive-foreground`
- `--border` / `--input` / `--ring`

## Dark/Light Theme

The application supports both dark and light themes with automatic system detection.

### Light Theme
- Background: Off-white (#FAFAFA)
- Foreground: Near black (#151515)
- Borders: Light gray

### Dark Theme
- Background: Near black (#151515)
- Foreground: White (#FFFFFF)
- Borders: Dark gray

## Components

### Buttons
- `.btn-primary` - Amber background with black text
- `.btn-secondary` - Subtle gray background

### Cards
- `.card` - Bordered container with hover effect

### Dropzones
- `.dropzone` - Dashed border upload area
- `.dropzone-active` - Active state with amber accent

## Layout

- **Container**: Centered with max-width of 1400px
- **Spacing**: Consistent padding and margins using Tailwind's spacing scale
- **Responsive**: Mobile-first approach with breakpoints at md (768px) and 2xl (1400px)

## Animations

- `fade-in` - Simple opacity transition
- `slide-up` - Slide up with fade effect

## Brand Elements

### Logo
- Custom wordmark with symbol (PNG format)
- Light and dark variants for theme support
- Located in `/public/logos/`

### Iconography
- Lucide React icons for consistency
- Minimal, outlined style

## File Structure

```
web/
├── app/
│   ├── globals.css      # Global styles and CSS variables
│   ├── layout.tsx       # Root layout with font loading
│   └── page.tsx         # Main page with hero and features
├── components/
│   ├── header.tsx       # Simple navigation header
│   ├── theme/
│   │   └── theme-toggle.tsx  # Theme switcher component
│   ├── customer/        # Customer-specific components
│   └── broker/          # Broker-specific components
├── context/
│   └── ThemeContext.tsx # Theme state management
├── lib/
│   └── utils.ts         # Utility functions
└── types/
    └── index.ts         # TypeScript type definitions
```

## Usage

### Adding New Components

1. Use semantic HTML elements
2. Apply Tailwind utility classes
3. Use CSS variables for colors
4. Support both light and dark themes
5. Follow the established typography hierarchy

### Example Component

```tsx
<div className="card">
  <h3 className="font-display text-lg font-semibold mb-2">
    Title
  </h3>
  <p className="text-muted-foreground">
    Description text
  </p>
</div>
```

## Accessibility

- All interactive elements have focus states
- Color contrast meets WCAG AA standards
- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support