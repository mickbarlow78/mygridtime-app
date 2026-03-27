# Phase 7b: AI Timetable Extraction

## Objective
Allow users to upload a PDF or photo of a timetable. Extract structured data using Claude Vision API. Present for review, editing and approval before saving.

## Prerequisites
- Phase 7a complete (consumer accounts, drivers, user_timetables tables exist)
- Anthropic API key with access to Claude Haiku and Sonnet

## What to Build

### 1. Upload Page (src/app/my/upload/page.tsx)

**Two options presented:**
1. "Find your championship" → search published events (links official timetable, no extraction needed)
2. "Upload PDF or photo" → file upload

**File upload:**
- Accept: .pdf, .jpg, .jpeg, .png, .heic
- Max file size: 10MB
- Camera capture on mobile (accept="image/*" with capture attribute)
- Gallery selection on mobile
- Drag-and-drop on desktop
- Show upload progress
- On upload: send to extract-timetable Edge Function

### 2. Extraction Edge Function (supabase/functions/extract-timetable/index.ts)

**Runtime:** Deno

**Input:**
- file: base64-encoded file content
- file_type: 'pdf' | 'image'
- Auth: valid user session required

**Processing:**
1. If PDF: check for text layer. If text-based → use Claude Haiku. If image-based/scanned → use Claude Sonnet.
2. If image: always use Claude Sonnet.
3. Convert PDF pages to images if needed (use pdf rendering or send PDF directly — Claude API accepts PDFs).
4. Call Claude API with structured extraction prompt (see below).
5. Parse response as JSON.
6. Validate against expected schema.
7. Return extracted data + confidence score to client.

**Model routing:**
| Input | Model | Rationale |
|---|---|---|
| Clean text-based PDF | claude-haiku-4-5-20251001 | Cheaper, fast, sufficient for clean layouts |
| Photo / scan / image PDF | claude-sonnet-4-5-20241022 | Better layout comprehension for messy inputs |

**Extraction prompt:**
```
You are extracting timetable data from a karting event schedule document.

Return ONLY valid JSON matching this exact schema. No markdown, no explanation, no preamble.

{
  "event_name": "string",
  "championship": "string or null",
  "venue": "string or null",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD or null",
  "confidence": 0.0 to 1.0,
  "days": [
    {
      "date": "YYYY-MM-DD",
      "label": "string or null",
      "entries": [
        {
          "title": "string",
          "start_time": "HH:MM",
          "end_time": "HH:MM or null",
          "category": "string or null (e.g. Cadet, Junior, Senior)",
          "notes": "string or null",
          "is_break": false,
          "confidence": 0.0 to 1.0
        }
      ]
    }
  ]
}

Rules:
- Infer category/class from session titles (e.g. "Practice 1 - Cadet" → category: "Cadet")
- Mark lunch breaks, ceremonies, briefings with is_break: true
- Use 24-hour time format
- If you cannot determine a field, set it to null
- Set confidence per entry: 1.0 = certain, below 0.7 = flag for review
- Set overall confidence: average of entry confidences
```

### 3. Review + Approve Screen (src/app/my/upload/review/page.tsx)

After extraction, navigate to review screen showing:
- Extracted event name, venue, dates (editable)
- Day-by-day timetable in table format
- Each entry is editable (title, start_time, end_time, category, notes)
- Entries with confidence < 0.7: highlight in amber with "Please check" badge
- User can add, remove or reorder entries
- "Confirm and Save" button → saves to user_timetables + child tables
- "Re-upload" button → go back to upload

**On confirm:**
1. Create user_timetable with source_type='upload'
2. Create user_timetable_days and user_timetable_entries
3. Check for championship match (see below)
4. Navigate to /my/[timetableId]
5. If alerts are enabled for this user → schedule alerts for matching entries

### 4. Championship Match Check

After extraction, before saving:
1. Search published events where title ILIKE extracted event_name OR championship matches
2. If match found: show prompt: "We found an official timetable for this event. Use the official version instead?"
3. If user accepts → create user_timetable with source_type='official', link official_event_id
4. If user declines → save their uploaded version

### 5. Environment Variables
Ensure ANTHROPIC_API_KEY is set in Supabase Edge Function secrets:
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### 6. Error Handling
- API timeout: 30 second limit. Show "Extraction is taking longer than expected. Please try again."
- Invalid response: If Claude returns non-JSON or missing fields, show "We couldn't extract this timetable automatically. Please enter it manually." Provide a manual entry form.
- File too large: Client-side check before upload.
- Unsupported format: Client-side check.

## Components to Create

| Component | Location | Purpose |
|---|---|---|
| UploadDropzone | src/components/consumer/UploadDropzone.tsx | File upload with drag-drop + camera |
| ExtractionReview | src/components/consumer/ExtractionReview.tsx | Review + edit extracted data |
| ConfidenceBadge | src/components/consumer/ConfidenceBadge.tsx | Amber "Please check" indicator |
| ChampionshipMatch | src/components/consumer/ChampionshipMatch.tsx | "Official version found" prompt |
| ManualEntryForm | src/components/consumer/ManualEntryForm.tsx | Fallback if extraction fails |

## Acceptance Criteria
- [ ] User can upload a PDF and see extracted timetable within 15 seconds
- [ ] User can upload a photo (camera or gallery) and see extracted timetable within 20 seconds
- [ ] Extracted data rendered in editable review screen
- [ ] Low-confidence entries highlighted in amber
- [ ] User can edit any field before confirming
- [ ] User can add/remove entries on review screen
- [ ] Confirmed timetable saved to user_timetables correctly
- [ ] Championship match prompt appears when official event exists
- [ ] Manual entry fallback works when extraction fails
- [ ] Haiku used for clean PDFs, Sonnet for photos (check Edge Function logs)
- [ ] `npm run typecheck` passes

## Test Commands
```bash
npm run typecheck
npm run dev
# Test: upload a clean PDF timetable → review screen shows extracted data
# Test: upload a photo of a timetable → extraction works
# Test: upload a blurry/difficult image → low confidence entries flagged
# Test: upload a corrupt file → error message shown
# Test: extraction returns partial data → user can complete manually
# Test: confirm → data saved → visible in /my
```

## Do NOT Build in This Phase
- SMS / WhatsApp / Stripe (Phase 7c)
- Community timetable sharing (Phase 7d)
- Timetable update detection (Phase 7d)
