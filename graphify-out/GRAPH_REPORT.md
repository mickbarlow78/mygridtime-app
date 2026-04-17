# Graph Report - src  (2026-04-17)

## Corpus Check
- 93 files · ~51,008 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 284 nodes · 393 edges · 67 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 112 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Event CRUD Actions|Event CRUD Actions]]
- [[_COMMUNITY_Auth & Public Pages|Auth & Public Pages]]
- [[_COMMUNITY_Email & Notifications|Email & Notifications]]
- [[_COMMUNITY_Org & Member Management|Org & Member Management]]
- [[_COMMUNITY_Timetable State Logic|Timetable State Logic]]
- [[_COMMUNITY_CSV Export|CSV Export]]
- [[_COMMUNITY_Audit Log UI|Audit Log UI]]
- [[_COMMUNITY_Notification Log Filters|Notification Log Filters]]
- [[_COMMUNITY_Magic Link Auth|Magic Link Auth]]
- [[_COMMUNITY_Member Management UI|Member Management UI]]
- [[_COMMUNITY_Timetable Builder|Timetable Builder]]
- [[_COMMUNITY_Env & Error Setup|Env & Error Setup]]
- [[_COMMUNITY_Day Tab Entry Editing|Day Tab Entry Editing]]
- [[_COMMUNITY_Entry Row Display|Entry Row Display]]
- [[_COMMUNITY_Template Delete|Template Delete]]
- [[_COMMUNITY_Branding Form|Branding Form]]
- [[_COMMUNITY_Auth Middleware|Auth Middleware]]
- [[_COMMUNITY_Global Error Boundary|Global Error Boundary]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Public Error Page|Public Error Page]]
- [[_COMMUNITY_Public Layout|Public Layout]]
- [[_COMMUNITY_Legacy Org Page|Legacy Org Page]]
- [[_COMMUNITY_Event Preview Page|Event Preview Page]]
- [[_COMMUNITY_Org Name Form|Org Name Form]]
- [[_COMMUNITY_Public Org URL Field|Public Org URL Field]]
- [[_COMMUNITY_Webhook Route|Webhook Route]]
- [[_COMMUNITY_Consumer Error Page|Consumer Error Page]]
- [[_COMMUNITY_Alerts Page|Alerts Page]]
- [[_COMMUNITY_Drivers Page|Drivers Page]]
- [[_COMMUNITY_Upload Page|Upload Page]]
- [[_COMMUNITY_Org Selector|Org Selector]]
- [[_COMMUNITY_Template Picker|Template Picker]]
- [[_COMMUNITY_Print Button|Print Button]]
- [[_COMMUNITY_Confirm Dialog|Confirm Dialog]]
- [[_COMMUNITY_Status Badge|Status Badge]]
- [[_COMMUNITY_Env Test Suite|Env Test Suite]]
- [[_COMMUNITY_CSS Utilities|CSS Utilities]]
- [[_COMMUNITY_Supabase Client|Supabase Client]]
- [[_COMMUNITY_Session Middleware|Session Middleware]]
- [[_COMMUNITY_Branding Resolver|Branding Resolver]]
- [[_COMMUNITY_Time Formatting|Time Formatting]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Error Page|Error Page]]
- [[_COMMUNITY_Layout|Layout]]
- [[_COMMUNITY_Loading State|Loading State]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Loading State|Loading State]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Layout|Layout]]
- [[_COMMUNITY_Loading State|Loading State]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Page|Page]]
- [[_COMMUNITY_Event Actions Bar|Event Actions Bar]]
- [[_COMMUNITY_Public Org View|Public Org View]]
- [[_COMMUNITY_Timetable Day|Timetable Day]]
- [[_COMMUNITY_Char Counter|Char Counter]]
- [[_COMMUNITY_Audit Test Suite|Audit Test Suite]]
- [[_COMMUNITY_Field Limits|Field Limits]]
- [[_COMMUNITY_Client Test Suite|Client Test Suite]]
- [[_COMMUNITY_Templates Test Suite|Templates Test Suite]]
- [[_COMMUNITY_Database Types|Database Types]]
- [[_COMMUNITY_App URL Test Suite|App URL Test Suite]]
- [[_COMMUNITY_Slug Test Suite|Slug Test Suite]]
- [[_COMMUNITY_Time Test Suite|Time Test Suite]]

## God Nodes (most connected - your core abstractions)
1. `requireEditor()` - 23 edges
2. `writeAuditLog()` - 21 edges
3. `makeActorContext()` - 19 edges
4. `sendEventNotification()` - 16 edges
5. `createAdminClient()` - 13 edges
6. `requireOwnerOrAdmin()` - 11 edges
7. `inviteMember()` - 11 edges
8. `revalidateAdminEventPaths()` - 9 edges
9. `requireUser()` - 9 edges
10. `createEvent()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `handleAddDay()` --calls--> `addEventDay()`  [INFERRED]
  src\components\admin\TimetableBuilder.tsx → src\app\admin\events\actions.ts
- `handleRemoveDay()` --calls--> `removeEventDay()`  [INFERRED]
  src\components\admin\TimetableBuilder.tsx → src\app\admin\events\actions.ts
- `handleSaveLabel()` --calls--> `updateDayLabel()`  [INFERRED]
  src\components\admin\TimetableBuilder.tsx → src\app\admin\events\actions.ts
- `async()` --calls--> `saveAsTemplate()`  [INFERRED]
  src\components\admin\EventEditor.tsx → src\app\admin\templates\actions.ts
- `sitemap()` --calls--> `getServerAppUrl()`  [INFERRED]
  src\app\sitemap.ts → src\lib\utils\app-url.ts

## Communities

### Community 0 - "Event CRUD Actions"
Cohesion: 0.18
Nodes (30): addEventDay(), archiveEvent(), createEvent(), createEventFromTemplate(), deleteTemplate(), duplicateEvent(), generateUniqueSlug(), getSnapshotData() (+22 more)

### Community 1 - "Auth & Public Pages"
Cohesion: 0.11
Nodes (14): lookupByToken(), maskEmail(), signOut(), toggleUnsubscribe(), createAdminClient(), NotFound(), generateMetadata(), PublicTimetablePage() (+6 more)

### Community 2 - "Email & Notifications"
Cohesion: 0.16
Nodes (17): inviteMember(), getServerAppUrl(), getFromAddress(), getResendClient(), debugLog(), sendEventNotification(), buildMetaLine(), escHtml() (+9 more)

### Community 3 - "Org & Member Management"
Cohesion: 0.18
Nodes (17): acceptInvite(), createOrganisation(), listOrgInvites(), listOrgMembers(), removeMember(), requireOwnerOrAdmin(), requireUser(), revokeInvite() (+9 more)

### Community 4 - "Timetable State Logic"
Cohesion: 0.19
Nodes (6): async(), computeEntryChangeInfos(), computeTimetableCards(), metaFieldState(), metaInputClass(), nTime()

### Community 5 - "CSV Export"
Cohesion: 0.21
Nodes (5): downloadCsv(), entriesToCsv(), fmtEntryLine(), fmtTime(), handleExportCsv()

### Community 6 - "Audit Log UI"
Cohesion: 0.18
Nodes (2): EntryAddedCard(), fmtTime()

### Community 7 - "Notification Log Filters"
Cohesion: 0.22
Nodes (3): downloadCsv(), entriesToCsv(), handleExportCsv()

### Community 8 - "Magic Link Auth"
Cohesion: 0.2
Nodes (3): sendMagicLink(), handleSubmit(), GET()

### Community 9 - "Member Management UI"
Cohesion: 0.29
Nodes (5): clearMessages(), handleInvite(), handleRemove(), handleRevokeInvite(), handleRoleChange()

### Community 10 - "Timetable Builder"
Cohesion: 0.22
Nodes (5): dayLabel(), formatDate(), handleAddDay(), handleRemoveDay(), handleSaveLabel()

### Community 11 - "Env & Error Setup"
Cohesion: 0.32
Nodes (5): isSet(), validateEnv(), validateEnvOnStartup(), Error(), register()

### Community 12 - "Day Tab Entry Editing"
Cohesion: 0.33
Nodes (0): 

### Community 13 - "Entry Row Display"
Cohesion: 0.33
Nodes (0): 

### Community 14 - "Template Delete"
Cohesion: 0.67
Nodes (1): handleDelete()

### Community 15 - "Branding Form"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Auth Middleware"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Global Error Boundary"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Root Layout"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Public Error Page"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Public Layout"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Legacy Org Page"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Event Preview Page"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Org Name Form"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Public Org URL Field"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Webhook Route"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Consumer Error Page"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Alerts Page"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Drivers Page"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Upload Page"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Org Selector"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Template Picker"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Print Button"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Confirm Dialog"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Status Badge"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Env Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "CSS Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Supabase Client"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Session Middleware"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Branding Resolver"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Time Formatting"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Error Page"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Layout"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Loading State"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Loading State"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Layout"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Loading State"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Page"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Event Actions Bar"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Public Org View"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Timetable Day"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Char Counter"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Audit Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Field Limits"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Client Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Templates Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Database Types"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "App URL Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Slug Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Time Test Suite"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Auth Middleware`** (2 nodes): `middleware()`, `middleware.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Global Error Boundary`** (2 nodes): `GlobalError()`, `global-error.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Root Layout`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Error Page`** (2 nodes): `PublicError()`, `error.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Layout`** (2 nodes): `PublicLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Legacy Org Page`** (2 nodes): `LegacyPublicOrgPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Preview Page`** (2 nodes): `EventPreviewPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Org Name Form`** (2 nodes): `handleSubmit()`, `OrgNameForm.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Org URL Field`** (2 nodes): `PublicOrgUrlField()`, `PublicOrgUrlField.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Webhook Route`** (2 nodes): `POST()`, `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Consumer Error Page`** (2 nodes): `ConsumerError()`, `error.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Alerts Page`** (2 nodes): `AlertsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Drivers Page`** (2 nodes): `DriversPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Upload Page`** (2 nodes): `UploadPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Org Selector`** (2 nodes): `OrgSelector()`, `OrgSelector.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Template Picker`** (2 nodes): `TemplatePicker.tsx`, `TemplatePicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Print Button`** (2 nodes): `PrintButton()`, `PrintButton.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Confirm Dialog`** (2 nodes): `handleKeyDown()`, `ConfirmDialog.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Status Badge`** (2 nodes): `StatusBadge.tsx`, `StatusBadge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Env Test Suite`** (2 nodes): `setAllRequired()`, `env.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSS Utilities`** (2 nodes): `styles.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Supabase Client`** (2 nodes): `createClient()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Session Middleware`** (2 nodes): `updateSession()`, `middleware.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Branding Resolver`** (2 nodes): `resolveEffectiveBranding()`, `branding.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Time Formatting`** (2 nodes): `time.ts`, `formatTime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Error Page`** (1 nodes): `error.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Layout`** (1 nodes): `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loading State`** (1 nodes): `loading.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loading State`** (1 nodes): `loading.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Layout`** (1 nodes): `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loading State`** (1 nodes): `loading.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Page`** (1 nodes): `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Actions Bar`** (1 nodes): `EventActionsBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Org View`** (1 nodes): `PublicOrgView.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Timetable Day`** (1 nodes): `TimetableDay.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Char Counter`** (1 nodes): `CharCounter.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Audit Test Suite`** (1 nodes): `audit.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Field Limits`** (1 nodes): `field-limits.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Client Test Suite`** (1 nodes): `client.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Templates Test Suite`** (1 nodes): `templates.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Database Types`** (1 nodes): `database.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App URL Test Suite`** (1 nodes): `app-url.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Slug Test Suite`** (1 nodes): `slug.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Time Test Suite`** (1 nodes): `time.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sendEventNotification()` connect `Email & Notifications` to `Event CRUD Actions`, `Auth & Public Pages`, `Magic Link Auth`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `createAdminClient()` connect `Auth & Public Pages` to `Magic Link Auth`, `Email & Notifications`, `Org & Member Management`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `saveDayEntries()` connect `Event CRUD Actions` to `Email & Notifications`, `Timetable State Logic`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `writeAuditLog()` (e.g. with `createEvent()` and `updateEventMetadata()`) actually correct?**
  _`writeAuditLog()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `makeActorContext()` (e.g. with `createEvent()` and `updateEventMetadata()`) actually correct?**
  _`makeActorContext()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `sendEventNotification()` (e.g. with `publishEvent()` and `saveDayEntries()`) actually correct?**
  _`sendEventNotification()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `createAdminClient()` (e.g. with `sitemap()` and `resolvePublicOrgName()`) actually correct?**
  _`createAdminClient()` has 12 INFERRED edges - model-reasoned connections that need verification._