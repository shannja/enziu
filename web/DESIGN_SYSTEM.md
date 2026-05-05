# ENZIU Design System

## Overview

The ENZIU design system is built on principles of clarity, transparency, and modern minimalism. The visual identity centers around a signature gradient that represents the transition from complexity to clarity.

## Core Philosophy

- **Transparency**: Clear visual hierarchy and honest representation of data
- **Simplicity**: Minimal, focused interfaces that reduce cognitive load
- **Consistency**: Unified visual language across all touchpoints
- **Accessibility**: Designs that work for everyone, in all contexts

## Color System

### Primary Gradient

The ENZIU gradient is the cornerstone of our visual identity, representing the journey from confusion to clarity.

```
Linear Gradient: #ffde59 (yellow) → #ff914d (orange)
Direction: 90deg (left to right) or 135deg (diagonal)
```

**Usage:**
- Primary action buttons
- Active states and highlights
- Progress indicators
- Brand accents and icons

### Neutral Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Black | `#151515` | Primary text, dark mode backgrounds |
| White | `#FAFAFA` | Light mode backgrounds, cards |
| Gray 100 | `#F5F5F5` | Subtle backgrounds |
| Gray 200 | `#E5E5E5` | Borders, dividers |
| Gray 300 | `#D4D4D4` | Disabled states |
| Gray 400 | `#A3A3A3` | Secondary text |
| Gray 500 | `#737373` | Muted text |

### Semantic Colors

#### Grade Colors
Used for the ENZIU Index scoring system:

| Grade | Color | Hex | Meaning |
|-------|-------|-----|---------|
| A | Green | `#22C55E` | Excellent |
| B | Lime | `#84CC16` | Good |
| C | Yellow | `#EAB308` | Average |
| D | Orange | `#F97316` | Below Average |
| F | Red | `#EF4444` | Poor |

#### Status Colors
| Status | Color | Usage |
|--------|-------|-------|
| Success | Green | Positive outcomes, validations |
| Warning | Yellow | Caution, attention needed |
| Error | Red | Errors, critical issues |
| Info | Blue | Informational messages |

### CSS Variables

All colors are available as CSS variables for easy theming:

```css
:root {
  --background: 0 0% 97%;
  --foreground: 0 0% 8.2%;
  --primary: 45 100% 50%;
  --accent: 45 100% 50%;
  --border: 0 0% 90%;
  --ring: 45 100% 50%;
}

.dark {
  --background: 0 0% 8.2%;
  --foreground: 0 0% 100%;
  --border: 0 0% 18%;
}
```

## Typography

### Font Families

| Usage | Font | Weights |
|-------|------|---------|
| Headings | Agrandir Regular | 400 |
| Body | Object Sans Regular | 400 |
| Code | JetBrains Mono | 400, 500 |

### Type Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 2.5rem | 400 | 1.2 |
| H2 | 2rem | 400 | 1.25 |
| H3 | 1.5rem | 400 | 1.3 |
| H4 | 1.25rem | 400 | 1.4 |
| Body | 1rem | 400 | 1.5 |
| Small | 0.875rem | 400 | 1.5 |
| Caption | 0.75rem | 400 | 1.5 |

## Components

### Buttons

ENZIU uses two primary button styles, both featuring the signature gradient.

#### 1. Gradient Text Button

Used for secondary actions, links, and subtle CTAs.

**States:**
- **Default**: Gradient text, no underline
- **Hover**: Shows underline + gradient shift (colors reverse)
- **Active**: Slight opacity reduction

```tsx
<Button variant="gradient-text">
  Learn More
</Button>
```

**CSS Class:** `.btn-gradient-text`

#### 2. Gradient Background Button

Used for primary actions and prominent CTAs.

**States:**
- **Default**: Solid gradient background (135deg diagonal)
- **Hover**: Gradient shift + lift effect (translateY + shadow)
- **Active**: Returns to original position with reduced shadow
- **Disabled**: 50% opacity, no interaction

```tsx
<Button variant="gradient-bg" size="lg">
  Get Started
</Button>
```

**CSS Class:** `.btn-gradient-bg`

**Size Variants:**
- `sm`: Compact buttons (0.5rem × 1rem padding)
- `default`: Standard buttons (0.75rem × 1.5rem padding)
- `lg`: Large buttons (1rem × 2rem padding)

#### 3. Gradient Outline Button

Used for tertiary actions with gradient border.

```tsx
<Button variant="gradient-outline">
  View Details
</Button>
```

### Cards

Cards are the primary container for content grouping.

**Features:**
- Subtle border with gradient hover effect
- Smooth transition on hover
- Consistent padding and spacing

```tsx
<Card className="bento-card">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

**Variants:**
- **Standard Card**: Basic container with border
- **Bento Card**: Enhanced hover effects, used in grid layouts

### Form Elements

#### Inputs

**Features:**
- Gradient focus ring
- Smooth transitions
- Consistent sizing

```tsx
<input 
  className="input-gradient"
  placeholder="Enter your email"
/>
```

#### Progress Bars

**Features:**
- Gradient fill animation
- Smooth transitions
- Customizable width

```tsx
<Progress value={75} className="w-full" />
```

### Badges & Pills

#### Gradient Badge

Used for status indicators and tags.

```tsx
<span className="badge-gradient">
  New
</span>
```

#### Active Pill

Used in toggle groups and segmented controls.

```tsx
<button className={cn(
  "pill-base",
  isActive && "pill-active"
)}>
  Option A
</button>
```

## Layout

### Grid System

- **Container**: Max-width 1400px, centered
- **Columns**: 12-column grid
- **Gutters**: 1rem (mobile), 1.5rem (tablet), 2rem (desktop)
- **Margins**: 1rem (mobile), 2rem (desktop)

### Spacing Scale

Based on Tailwind's default spacing:

| Token | Value | Usage |
|-------|-------|-------|
| 1 | 0.25rem | Tight spacing |
| 2 | 0.5rem | Icon gaps |
| 3 | 0.75rem | Component padding |
| 4 | 1rem | Standard spacing |
| 6 | 1.5rem | Section spacing |
| 8 | 2rem | Large spacing |
| 12 | 3rem | Hero spacing |

## Animations

### Micro-interactions

All interactive elements follow these principles:

- **Duration**: 200ms - 400ms
- **Easing**: `ease-out` for entrances, `ease-in-out` for transitions
- **Properties**: Prefer `transform` and `opacity` for performance

### Keyframe Animations

#### Fade In
```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

#### Slide Up
```css
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### Gradient Shift
```css
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

## Dark Mode

The design system fully supports dark mode with automatic system detection.

### Light Mode
- Background: `#FAFAFA` (off-white)
- Text: `#151515` (near black)
- Cards: White with subtle shadows

### Dark Mode
- Background: `#151515` (near black)
- Text: `#FFFFFF` (white)
- Cards: Dark gray with subtle borders

### Implementation

```tsx
import { useTheme } from "@/context/ThemeContext";

const { theme, setTheme, actualTheme } = useTheme();
```

## Accessibility

### Color Contrast

All text meets WCAG AA standards:
- Normal text: 4.5:1 minimum contrast ratio
- Large text: 3:1 minimum contrast ratio

### Focus States

All interactive elements have visible focus indicators:
- 2px solid ring with gradient color
- 2px offset from element
- Clear visual distinction

### Keyboard Navigation

- Tab order follows visual layout
- All interactive elements are keyboard accessible
- Focus trap in modals and dialogs

### Screen Reader Support

- Semantic HTML structure
- ARIA labels where needed
- Hidden decorative elements

## Iconography

### Style

- **Type**: Outlined, minimalist
- **Weight**: 1.5px stroke
- **Size**: Consistent sizing (16px, 20px, 24px)
- **Color**: Gradient or semantic colors

### Library

Using Lucide React icons for consistency:

```tsx
import { Shield, FileText, ArrowRight } from "lucide-react";
```

### Gradient Icons

Icons can use the signature gradient:

```tsx
<GradientIcon icon={Shield} size="md" />
```

## Responsive Design

### Breakpoints

| Name | Min Width | Target |
|------|-----------|--------|
| sm | 640px | Mobile landscape |
| md | 768px | Tablets |
| lg | 1024px | Laptops |
| xl | 1280px | Desktops |
| 2xl | 1400px | Large screens |

### Mobile-First Approach

All components are designed mobile-first, then enhanced for larger screens.

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Content */}
</div>
```

## File Structure

```
web/
├── app/
│   ├── globals.css      # Global styles, CSS variables
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home page
├── components/
│   ├── ui/              # Reusable UI components
│   │   ├── button.tsx   # Button variants
│   │   ├── card.tsx     # Card components
│   │   ├── gradient-icon.tsx
│   │   └── progress.tsx
│   ├── customer/        # Customer-specific components
│   ├── broker/          # Broker-specific components
│   └── theme/           # Theme-related components
├── context/
│   └── ThemeContext.tsx # Theme state management
├── lib/
│   └── utils.ts         # Utility functions
├── types/
│   └── index.ts         # TypeScript definitions
└── public/
    └── logos/           # Logo assets
```

## Best Practices

### DO ✅

- Use gradient for primary actions only
- Maintain sufficient color contrast
- Test in both light and dark modes
- Use semantic HTML elements
- Keep animations subtle and meaningful
- Follow the established spacing scale

### DON'T ❌

- Overuse the gradient (creates visual noise)
- Use gradient for body text
- Create custom animations without approval
- Ignore accessibility guidelines
- Use hardcoded colors (use CSS variables)
- Mix multiple gradient directions inconsistently

## Contributing

When adding new components:

1. Follow existing patterns and conventions
2. Use CSS variables for colors
3. Support both light and dark themes
4. Include proper TypeScript types
5. Test accessibility with screen readers
6. Document props and usage examples
7. Add stories for visual testing

## Resources

- **Figma Library**: [Link to design file]
- **Storybook**: [Link to component stories]
- **GitHub Repository**: [Link to codebase]
- **Accessibility Guide**: [Link to a11y guidelines]

---

*Last updated: May 2026*
*Version: 2.0.0*