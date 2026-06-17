# Session Analytics v2 - Merge Summary

## ✅ Completed Changes

### 1. New Files Created

#### a) `ui/components/SegmentForm.tsx` ✓
- Complete segment filter form component
- Supports URL filtering (path/domain/full with contains/excludes/equals operators)
- Country dropdown with search
- Browser, OS text filters
- Quick filters: errors, bounced, has replay
- Helper functions: `segmentToFilter()`, `segmentActiveCount()`, `segmentTags()`

#### b) `ui/hooks/useSavedSegments.ts` ✓
- CRUD operations for saved segments
- Uses App Settings 2.0 for persistence
- Functions: `fetchSegments()`, `saveSegment()`, `deleteSegment()`
- Schema: "segment-config"

#### c) `ui/pages/SegmentsPage.tsx` ✓
- Complete segment management page
- Create, view, and delete saved segments
- Expandable segment list with filter preview
- DQL filter code preview

#### d) `settings/schemas/segment-config.schema.json` ✓
- JSON schema for segment configuration
- Defines all segment properties (name, hasErrors, isBounced, etc.)

---

## 🔄 Files That Need Manual Updates

### 2. `package.json` - Add Dependency

**Location**: Root directory

**Add this line to "dependencies" section:**
```json
"@dynatrace-sdk/client-app-settings-v2": "^1.1.3"
```

**Complete dependencies section should include:**
```json
"dependencies": {
  "@dynatrace-sdk/app-utils": "^1.0.0",
  "@dynatrace-sdk/client-app-settings-v2": "^1.1.3",  // ← ADD THIS
  "@dynatrace-sdk/client-query": "^1.0.0",
  "@dynatrace/strato-components": "^1.0.0",
  // ... other dependencies
}
```

---

### 3. `ui/dql/queries.ts` - Add Filter System

**Location**: `ui/dql/queries.ts`

**Add these sections at the TOP of the file (after imports, around line 70-80):**

```typescript
// ── Global filter injection ───────────────────────────────────────────────────
//
// Fields available on user.sessions only (session-level aggregates):
//   error.count, navigation_count, characteristics.has_replay
// Fields available on both user.sessions and user.events (inherited context):
//   device.type, browser.name, os.name, geo.country.iso_code
//
// Strategy:
//   user.sessions queries → inject all filter conditions directly.
//   user.events queries   → split filter:
//     • event-safe conditions (device.type etc.) → inject directly
//     • session-only conditions (error.count etc.) → add a `lookup` subquery
//       that pre-selects session IDs matching those conditions, then filters
//       the events to only those sessions.

const SESSION_ONLY_FIELDS = ["error.count", "navigation_count", "characteristics.has_replay"];
// URL conditions reference user.events fields — need special handling in user.sessions queries
const URL_ONLY_FIELDS = ["page.url.path", "page.url.domain", "page.url.full"];

function isSessionOnlyCondition(cond: string): boolean {
  return SESSION_ONLY_FIELDS.some(f => cond.includes(f));
}

function isUrlOnlyCondition(cond: string): boolean {
  return URL_ONLY_FIELDS.some(f => cond.includes(f));
}

/** Insert `clause` after the last | filter line (before any aggregation). */
function injectClause(dql: string, clause: string): string {
  const lines = dql.split("\n");
  let lastFilterIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("| filter") || t.startsWith("| lookup")) lastFilterIdx = i;
    if (t.startsWith("| summarize") || t.startsWith("| makeTimeseries") ||
        t.startsWith("| fields") || t.startsWith("| sort") || t.startsWith("| limit")) break;
  }
  const insertAt = lastFilterIdx >= 0 ? lastFilterIdx + 1 : 1;
  lines.splice(insertAt, 0, clause);
  return lines.join("\n");
}

/**
 * Injects a global segment filter into any DQL query string.
 * Works correctly for both user.sessions and user.events queries.
 * Safe to call with an empty/undefined filter — returns the query unchanged.
 */
export function withFilter(dql: string, filter?: string): string {
  if (!filter?.trim()) return dql;

  const conditions = filter.trim().split(/\s+AND\s+/i).map(c => c.trim()).filter(Boolean);

  // ── user.sessions: inject session-safe conditions; URL conditions need an events sub-lookup ──
  if (dql.includes("fetch user.sessions")) {
    const sessionSafe = conditions.filter(c => !isUrlOnlyCondition(c));
    const urlOnly     = conditions.filter(c =>  isUrlOnlyCondition(c));

    let result = dql;
    if (sessionSafe.length > 0) {
      result = injectClause(result, `| filter ${sessionSafe.join(" AND ")}`);
    }
    if (urlOnly.length > 0) {
      // Extract timeframe from the fetch line
      const tfMatch = result.match(/fetch user\.sessions,\s*(.+?)(?:\n|$)/);
      const tf = tfMatch ? tfMatch[1].trim() : "from:now()-24h";
      const appMatch = result.match(/in\("([^"]+)",\s*dt\.rum\.application\.entities\)/);
      const appLine  = appMatch
        ? `| filter in("${appMatch[1]}", dt.rum.application.entities)\n  `
        : "";
      const urlFilter = urlOnly.join(" AND ");
      const subquery = `fetch user.events, ${tf}\n  ${appLine}| filter ${urlFilter}\n  | summarize by: { dt.rum.session.id }`;
      const lookupClause =
        `| lookup [\n  ${subquery}\n], sourceField: dt.rum.session.id, lookupField: dt.rum.session.id\n| filter isNotNull(lookup.dt.rum.session.id)`;
      result = injectClause(result, lookupClause);
    }
    return result;
  }

  // ── user.events: split and handle each category ────────────────────────────
  if (dql.includes("fetch user.events")) {
    let result = dql;

    // URL-only conditions are event-safe; session-only conditions need a sub-lookup
    const eventSafe    = conditions.filter(c => !isSessionOnlyCondition(c));
    const sessionOnly  = conditions.filter(c =>  isSessionOnlyCondition(c));

    // 1. Event-safe conditions → inject directly
    if (eventSafe.length > 0) {
      result = injectClause(result, `| filter ${eventSafe.join(" AND ")}`);
    }

    // 2. Session-only conditions → lookup against user.sessions
    if (sessionOnly.length > 0) {
      // Extract timeframe from the fetch line
      const tfMatch = result.match(/fetch user\.events,\s*(.+?)(?:\n|$)/);
      const tf = tfMatch ? tfMatch[1].trim() : "from:now()-24h";

      // Extract app entity ID (if present) to scope the sessions subquery
      const appMatch = result.match(/dt\.rum\.application\.entity\s*==\s*"([^"]+)"/);
      const appLine  = appMatch
        ? `| filter in("${appMatch[1]}", dt.rum.application.entities)\n  `
        : "";

      const sessionFilter = sessionOnly.join(" AND ");
      const subquery = `fetch user.sessions, ${tf}\n  ${appLine}| filter ${sessionFilter}\n  | fields dt.rum.session.id`;

      const lookupClause =
        `| lookup [\n  ${subquery}\n], sourceField: dt.rum.session.id, lookupField: dt.rum.session.id\n| filter isNotNull(lookup.dt.rum.session.id)`;

      result = injectClause(result, lookupClause);
    }

    return result;
  }

  // Other query types — return unchanged
  return dql;
}
```

---

### 4. `ui/App.tsx` - Complete Rewrite Needed

**⚠️ CRITICAL**: The App.tsx file needs significant changes to support:
- Segment picker in header
- Compare mode (A vs B segments)
- GlobalFilterB prop passing to pages
- SegmentsPage routing

**To get the complete updated App.tsx:**

Visit: https://raw.githubusercontent.com/smaff-dt/dynatrace-session-analytics-v2/main/ui/App.tsx

**Key changes in App.tsx:**
1. Import SegmentForm components:
   ```typescript
   import { SegmentForm, SegmentState, EMPTY_SEGMENT, segmentToFilter } from "./components/SegmentForm";
   import { useSavedSegments } from "./hooks/useSavedSegments";
   ```

2. Add state for segments:
   ```typescript
   const [segmentA, setSegmentA] = useState<SegmentState>(EMPTY_SEGMENT);
   const [segmentB, setSegmentB] = useState<SegmentState | null>(null);
   const compareMode = segmentB !== null;
   const globalFilter = segmentToFilter(segmentA);
   const globalFilterB = compareMode ? segmentToFilter(segmentB!) : undefined;
   ```

3. Add CombinedSegmentPicker component to header
4. Add SegmentsPage routing
5. Update page components to pass `globalFilterB` prop

---

## 📊 Major New Features

### 1. **Segment Filtering**
- Create custom user segments with multiple filter conditions
- Save segments for reuse
- Filters: errors, bounced, has replay, country, browser, OS, URL patterns

### 2. **Compare Mode (A vs B)**
- Compare two segments side-by-side
- Supported pages: Overview, Acquisition, Engagement, Tech, Errors, Journeys
- Dual visualizations, split KPIs, and comparison tables

### 3. **URL Filtering**
- Filter by URL path, domain, or full URL
- Operators: contains, excludes (not_contains), equals
- Example: `URL path contains "/checkout"`

### 4. **Advanced DQL Filter Injection**
- `withFilter()` function intelligently handles both user.sessions and user.events queries
- Automatically creates sub-lookups for session-only fields in event queries
- Handles URL fields in session queries via event lookups

---

## 🔧 Next Steps

1. **Update package.json**
   - Add `@dynatrace-sdk/client-app-settings-v2` dependency
   - Run `npm install`

2. **Update queries.ts**
   - Add the `withFilter()` function and helper functions (see section 3 above)
   - This is the MOST CRITICAL update for functionality

3. **Replace App.tsx**
   - Download from: https://raw.githubusercontent.com/smaff-dt/dynatrace-session-analytics-v2/main/ui/App.tsx
   - Or manually integrate the changes listed in section 4

4. **Update Page Components (if needed)**
   - Most pages already have compare mode support in the forked repo
   - Check OverviewPage, AcquisitionPage, EngagementPage, TechPage, ErrorsPage, JourneysPage
   - Ensure they accept `globalFilterB?: string` prop

5. **Rebuild and Deploy**
   ```bash
   npm install
   npm run build
   npm run deploy
   ```

---

## 📝 Key Code References

### Using withFilter in a page component:
```typescript
import * as Q from "../dql/queries";

const results = await executeMultipleDql({
  kpis: Q.withFilter(Q.overviewKPIs(appId, timeframe), globalFilter),
  // ... other queries
});
```

### Segment filter format examples:
```
error.count > 0 AND geo.country.iso_code == "US"
navigation_count <= 1 AND contains(browser.name, "Chrome")
contains(page.url.path, "/checkout") AND device.type == "MOBILE"
```

---

## ⚠️ Important Notes

1. **OneDrive Sync Issues**: Some files experienced sync delays during creation
2. **App Settings 2.0**: Requires proper scopes in app.config.json (already configured)
3. **Testing**: After deployment, test segment creation, filtering, and compare mode
4. **Schema**: The segment-config schema is already registered in settings/schemas/

---

## 🎯 Summary

**Completed**: 4 new files created
**Pending**: 3 file updates (package.json, queries.ts, App.tsx)

All the foundational components for segment filtering and compare mode are now in place. The remaining updates are primarily adding the filter injection logic and integrating the UI components.
