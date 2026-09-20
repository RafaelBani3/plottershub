# Plottershub UI Design System

**Status:** Approved & Active (Phase 3.4B)  
**Direction:** Professional Social Media Analytics Workspace (Light Professional Analytics default, Dark Mode supported)

---

## 1. Principles

1. **Analytical Density Over Spectacle:** Prioritize clear information scanning, metric comparison, and dense data presentation over oversized decorative whitespace.
2. **Light Professional Analytics Direction:**
   - Pure white cards (`#FFFFFF`)
   - Light gray page background (`#F4F4F5` / `#F8F9FA`)
   - Subtle 1px borders (`rgba(0, 0, 0, 0.08)` / `#E4E4E7`)
   - Restrained shadows (`shadow-sm`)
   - Slightly rounded cards (6px / `rounded-md`)
   - Clean charts with minimal decoration
   - No rainbow gradients, no ambient glow circles, no excessive glassmorphism
   - Dense but readable analytical layouts
3. **AI as a Diagnostic Utility:** AI components are integrated as diagnostic utilities—collapsible panels, contextual blocks, and actionable lists—not as glowing, ambient centerpiece showcases.
4. **Architectural Component Integrity:** Sizing, padding, and layout constraints must resolve overflow at the component level. Global blankets like `overflow-x: hidden` are prohibited.

---

## 2. Design Tokens

### Color Palette (Light Professional Default)

| Token Name | Light Value | Dark Value | CSS Variable | Tailwind Utility | Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Background** | `#F4F4F5` | `#09090B` | `--background` | `bg-background` | Root canvas / page background |
| **Surface** | `#FFFFFF` | `#121215` | `--surface` / `--card` | `bg-surface` / `bg-card` | White cards, panels, sidebar |
| **Elevated** | `#FFFFFF` | `#18181B` | `--elevated` / `--popover` | `bg-elevated` | Popovers, dialogs, dropdowns (with `shadow-sm`) |
| **Hover Surface** | `#F4F4F5` | `#27272A` | `--hover` | `hover:bg-hover` | Hover state for interactive items |
| **Subtle Border** | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.08)` | `--border-subtle` | `border-border-subtle` | 1px dividers, card perimeters |
| **Strong Border** | `rgba(0, 0, 0, 0.16)` | `rgba(255, 255, 255, 0.16)` | `--border-strong` | `border-border-strong` | Inputs, focused items, active boundaries |
| **Primary Text** | `#09090B` | `#F4F4F5` | `--foreground` | `text-foreground` | High-contrast body, titles, numbers |
| **Secondary Text**| `#71717A` | `#A1A1AA` | `--muted-foreground` | `text-muted-foreground` | Table headers, form labels, captions |
| **Muted Text** | `#A1A1AA` | `#71717A` | `--muted-text` | `text-zinc-400` / `text-zinc-500` | Timestamps, units, inactive indicators |
| **Positive** | `#10B981` | `#10B981` | `--positive` | `text-positive` | Positive deltas, healthy states |
| **Negative** | `#F43F5E` | `#F43F5E` | `--negative` | `text-negative` | Negative deltas, errors, failures |
| **YouTube** | `#FF0000` | `#FF0000` | `--youtube` | `text-youtube` | YouTube platform branding |
| **Focus** | `#3B82F6` | `#3B82F6` | `--focus` | `ring-focus` | Accessible keyboard focus rings |

*Note: Repeated hex/RGBA values must not be hardcoded in component styling; components must consume semantic design tokens.*

---

## 3. Typography Hierarchy

| Level | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title** | 20px (`text-xl`) | Semibold / Bold (`font-semibold`) | 28px | Top-level page headers |
| **Section Title** | 14px (`text-sm`) | Semibold (`font-semibold`) | 20px | Card titles, panel headers |
| **Body** | 13–14px (`text-xs` / `text-sm`) | Normal (`font-normal`) | 18–20px | Standard body content |
| **Secondary** | 12–13px (`text-xs`) | Medium / Normal | 16–18px | Descriptions, metadata |
| **KPI Metric** | 22–24px (`text-2xl`) | Semibold (`font-semibold font-mono`) | 28px | Big number callouts |
| **Micro Metadata**| 10–11px (`text-[10px]` / `text-[11px]`) | Medium (`font-medium`) | 14px | Status badges, timestamps |

---

## 4. Border & Radius System

- **Small (`4px` / `rounded-sm`):** Micro badges, compact filters, status tags.
- **Default (`6px` / `rounded-md`):** Cards, inputs, buttons, table containers, dialogs.
- **Large (`8px` / `rounded-lg`):** Main application shell, modal dialog wrappers.
- **Prohibited:** Unrestrained `rounded-2xl`, `rounded-3xl`. Pill containers are restricted to compact filters and semantic status indicators.
- **Shadows:** Restrained `shadow-sm` on white cards and elevated popovers, paired with subtle 1px borders.

---

## 5. Layout & Spacing Density

- **Header:** Compact 56px (`h-14`), sticky, clean workspace switcher and user menu.
- **Sidebar:** 240–256px persistent on desktop, off-canvas sliding drawer on mobile/tablet.
- **Card Padding:** Restrained 16–20px (`p-4` or `p-5`).
- **Table Density:** Compact 36–38px row height, subtle horizontal dividing lines.
  - *Sticky headers are opt-in and only applied when rendered inside a defined scrolling container.*

---

## 6. AI Utility Constraints

- AI Insights must act as a **diagnostic utility**, not a decorative hero element.
- **Banned:** `blur-3xl` ambient glow circles, rainbow gradient buttons, shimmering backdrop filters.
- **Preferred Patterns:** Compact collapsible panel, concise diagnosis blocks, actionable roadmap steps with clear severity tagging.

---

## 7. Publishing Intelligence Visual Foundation (Phase 3.4G Compatibility)

The design system establishes the visual language and reusable components for the future **Publishing Intelligence** dashboard (scheduled for implementation in Phase 3.4G).

### Visual Aesthetic
- White cards on light gray canvas background.
- Subtle 1px borders (`border-border-subtle`).
- Clean, uncluttered analytical charts (business analytics feel, not an AI showcase).
- No ambient glow, no gradients, no oversized hero visualizations.

### Supported Analytical Views

1. **Historical Consumption Pattern**:
   - Line or stepped-area chart showing audience consumption by day/time bucket where officially supported.
   - **Constraint**: Must NOT be labeled as "viewers currently online" or "concurrent viewers". Hourly audience data must never be fabricated.
2. **Content Supply**:
   - Bar chart showing historical upload volume by day/time window.
   - **Constraint**: Must remain visually and analytically separate from audience consumption.
3. **Publishing Performance**:
   - Grouped performance cards and bar comparisons for previously published videos grouped by publication day/time window.
   - Standardized metrics:
     - Day 1 views & Day 1 watch time
     - Day 2 cumulative views & Day 2 cumulative watch time
     - Day 3 cumulative views & Day 3 cumulative watch time
4. **Consumption vs Publishing Performance Matrix**:
   - Scatter/matrix visualization comparing historical consumption patterns against publishing-window performance.
   - Descriptive conceptual quadrants:
     - *High Consumption / High Early Performance*
     - *High Consumption / Low Early Performance*
     - *Low Consumption / High Early Performance*
     - *Low Consumption / Low Early Performance*
   - **Constraint**: Strict descriptive analytical categories; NOT "optimal" or "suboptimal" value labels.
5. **Publishing Window Analysis**:
   - Dense table layout showing day-of-week × time-window rows (e.g. *Monday 09:00–12:00*, *Wednesday 18:00–21:00*).
   - Columns: Upload count, median/aggregate early performance, relative difference against channel baseline, and evidence strength badge.
6. **Publishing Intelligence Summary**:
   - Evidence-based historical observation cards (e.g., *"Historical uploads in this window achieved higher Day 1 viewing velocity."*).
   - **Constraint**: Strictly non-guaranteed wording. Banned phrases: *"Best time to upload"*, *"Guaranteed viral time"*, *"Optimal time"*.
7. **Evidence Strength Indicator**:
   - Supported via the reusable `<EvidenceStrengthBadge level="..." />` component.
   - 4 distinct levels:
     - `Strong` (emerald)
     - `Moderate` (blue)
     - `Limited` (amber)
     - `Insufficient` (neutral zinc)
   - **Rule**: Explicitly communicates historical observation depth; NOT a statistical confidence score.

### Preferred Chart Patterns for Phase 3.4G
- **Line chart**: Historical time-series trends.
- **Bar chart**: Publishing-window comparisons.
- **Scatter / Matrix visualization**: Consumption vs performance correlation.
- **Compact heatmap-style layout**: Applicable ONLY when the underlying data officially supports 2D day/hour buckets.
- **Dense table**: Publishing-window evidence breakdown.
- **Small KPI/stat cards**: Supporting metrics and cumulative deltas.
