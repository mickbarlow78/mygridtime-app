# Phase 4: Public Timetable

## Objective
Build the public-facing timetable page. Mobile-perfect, fast-loading, printable, SEO-optimised. This is the page drivers and parents use trackside. It must be flawless.

## Prerequisites
- Phase 3 complete (events can be created, edited and published)
- At least one published event with seed data

## UX Rules (Non-Negotiable)
- Loads in < 2 seconds on 4G
- No login required
- Works one-handed on a phone
- Clear answer to "what's next?" within 2 seconds
- Zero confusion: clear times, clear categories, obvious "today" view

## What to Build

### 1. Public Timetable Page (src/app/(public)/[slug]/page.tsx)

**Data fetching:**
- Server component using SSG (generateStaticParams) with on-demand revalidation
- Fetch event + event_days + timetable_entries where status='published' AND deleted_at IS NULL
- 404 if event not found or not published

**Layout:**
- Event header: title, venue, dates
- Day tabs: one tab per EventDay, labelled by date (e.g. "Sat 15 Mar") or custom label
- Auto-select today's date if the event is currently running, otherwise first day
- "Last updated" timestamp (event.updated_at)

**Timetable display:**
- Entries ordered by sort_order, then start_time
- Each entry shows: start_time, end_time (if set), title, category (if set), notes (if set)
- Break rows visually distinct: lighter background, italic text, no category
- Category grouping: if entries have categories, show as section headers (optional — only if data uses them)

**Responsive layout:**
- Desktop (1024px+): table layout with columns for time, title, category, notes
- Tablet (768px): same table, slightly compressed
- Mobile (<640px): stacked card layout. Each entry is a card with time prominent at top, title below, category as tag/badge

**Empty states:**
- Event exists but no entries: "Timetable coming soon."
- Day has no entries: "No sessions scheduled for this day."

### 2. Print View (src/app/(public)/[slug]/print/page.tsx)
- Separate route, not a modal
- Clean A4-optimised layout
- No navigation, no header, no footer chrome
- Event title, venue, date at top
- All days on one page if they fit, otherwise page break per day
- Entries in table format: Time, Title, Category, Notes
- Print-specific CSS: `@media print` rules
- "Print" button on main timetable page links here

### 3. Landing Page (src/app/(public)/page.tsx)
- List of published events
- Show: title, venue, start_date, status
- Link to /[slug] for each event
- Simple, clean. No marketing copy needed yet.

### 4. 404 Page
- Custom not-found page for invalid slugs
- Friendly message: "Event not found."
- Link back to event list

### 5. SEO + Meta Tags
For each event page:
```tsx
export function generateMetadata({ params }) {
  // Fetch event
  return {
    title: `${event.title} — TKC Timetable`,
    description: `Timetable for ${event.title} at ${event.venue}`,
    openGraph: {
      title: event.title,
      description: `Race schedule for ${event.title}`,
      type: 'website',
    },
  }
}
```

### 6. On-Demand Revalidation
When an event is published or updated (from admin), the public page must regenerate.

Option A (recommended): Use Next.js `revalidatePath` in the publish flow:
```ts
revalidatePath(`/${event.slug}`)
```

Option B: Use ISR with `revalidate: 60` (fallback if Option A is complex).

### 7. Shareable URLs
- Public URL format: `/{slug}` (e.g. `/tkc-round-3-whilton-mill`)
- Must work when shared via WhatsApp, iMessage, social media
- Open Graph meta must render preview card correctly

## Components to Create

| Component | Location | Purpose |
|---|---|---|
| TimetableView | src/components/timetable/TimetableView.tsx | Main timetable display (used by public + admin preview) |
| DayTabs | src/components/timetable/DayTabs.tsx | Day tab navigation |
| EntryCard | src/components/timetable/EntryCard.tsx | Single entry (mobile card view) |
| EntryRow | src/components/timetable/EntryRow.tsx | Single entry (desktop table row) |
| BreakRow | src/components/timetable/BreakRow.tsx | Break/ceremony entry (visually distinct) |
| PrintTimetable | src/components/timetable/PrintTimetable.tsx | Print-optimised layout |
| EventHeader | src/components/timetable/EventHeader.tsx | Event title, venue, dates display |

## Acceptance Criteria
- [ ] Public timetable loads at /[slug] for published events
- [ ] 404 returned for unpublished, archived or non-existent events
- [ ] Day tabs work — clicking switches day, today auto-selected during event
- [ ] Mobile layout (card view) is clean and readable at 320px–428px
- [ ] Desktop layout (table view) is clean at 1024px+
- [ ] Print view renders clean A4 output (test: Cmd+P in Chrome)
- [ ] Break entries visually distinct from race entries
- [ ] "Last updated" timestamp displays correctly
- [ ] SEO meta tags and Open Graph data correct (test with opengraph.xyz or similar)
- [ ] Landing page lists all published events
- [ ] Page loads in < 2 seconds (test with Lighthouse)
- [ ] Lighthouse scores: Performance ≥ 90, SEO ≥ 90, Accessibility ≥ 90
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds (SSG generates pages)

## Test Commands
```bash
npm run typecheck
npm run build
npm run dev
# Test: visit /[slug] → timetable renders
# Test: resize browser to 375px width → card layout
# Test: visit /[slug]/print → clean print layout
# Test: Cmd+P → print preview looks correct
# Test: visit /nonexistent-slug → 404 page
# Test: Lighthouse audit on public timetable page
```

## Do NOT Build in This Phase
- Email notifications (Phase 5)
- Templates or multi-org (Phase 6)
- Any Phase 7 consumer features
- Any admin changes (Phase 3 is complete)
