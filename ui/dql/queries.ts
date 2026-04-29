/**
 * dql/queries.ts
 *
 * All DQL query builders for the GA4-style analytics app.
 *
 * Data sources (Dynatrace Gen 3 Grail):
 *   user.sessions — session-level summary data
 *   user.events   — page views, interactions, custom events
 *
 * VERIFIED FIELD NAMES (Semantic Dictionary, Apr 2026):
 *
 * user.sessions:
 *   duration                    — session duration in nanoseconds
 *   navigation_count            — number of navigation events (use == 1 for "bounce")
 *   dt.rum.instance.id          — visitor ID (persistent across sessions)
 *   dt.rum.session.id           — unique session ID
 *   dt.rum.application.entities — array of APPLICATION-XXXX IDs
 *   dt.rum.user_type            — NOT AVAILABLE on this environment (removed from filters)
 *   browser.name / browser.version
 *   os.name / os.version
 *   device.type                 — "desktop" | "mobile"
 *   device.screen.width / device.screen.height
 *   geo.country.iso_code        — 2-letter ISO code (NO geo.country.name!)
 *   client.ip / client.isp
 *   error.count
 *
 * user.events:
 *   dt.rum.application.entity   — single APPLICATION-XXXX
 *   dt.rum.session.id           — session ID
 *   characteristics.classifier  — "navigation" | "user_interaction" | "error" etc.
 *   page.url.path / page.url.domain / page.url.full
 *   page.source.url.domain      — referrer domain (on events, NOT sessions)
 *   start_time                  — event timestamp
 *   duration                    — event duration
 *
 * FIELDS THAT DO NOT EXIST:
 *   bounce, new.user, user.id, referrer.type, referrer.url.host,
 *   geo.country.name, geo.city.name, screen.resolution
 */

// ── Helper: app filter for user.sessions (array field) ────────────────────────

function sessionAppFilter(appId: string): string {
  if (!appId) return "";
  return `| filter in("${appId}", dt.rum.application.entities)\n`;
}

// ── Helper: app filter for user.events (scalar field) ─────────────────────────

function eventAppFilter(appId: string): string {
  if (!appId) return "";
  return `| filter dt.rum.application.entity == "${appId}"\n`;
}

// ── Helper: convert timeframe string to DQL from/to clause ────────────────────
// Preset: "24h" → 'from:now()-24h'
// Custom: "custom:2026-04-01T00:00:00Z/2026-04-15T23:59:59Z" → 'from:"2026-04-01T00:00:00Z", to:"2026-04-15T23:59:59Z"'
function timeframeClause(timeframe: string): string {
  if (timeframe.startsWith("custom:")) {
    const [from, to] = timeframe.slice(7).split("/");
    return `from:"${from}", to:"${to}"`;
  }
  return `from:now()-${timeframe}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW / HOME
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key metrics: users, sessions, bounce rate, avg session duration.
 * Uses user.events to avoid session materialization latency on short timeframes.
 * Bounce rate = sessions with only 1 navigation event.
 * Avg duration = average time between first and last event in a session.
 */
export function overviewKPIs(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    navCount     = count(),
    firstEvent   = min(start_time),
    lastEvent    = max(start_time),
    by: { dt.rum.session.id, dt.rum.instance.id }
| summarize
    users        = countDistinct(dt.rum.instance.id),
    sessions     = count(),
    pageViews    = sum(navCount),
    bounced      = countIf(navCount == 1),
    avgDuration  = avg(lastEvent - firstEvent)
| fieldsAdd
    bounceRate   = toDouble(bounced) / toDouble(sessions) * 100.0
  `.trim();
}

/** Page views count from user.events (kept for backward compat) */
export function overviewPageViews(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize pageViews = count()
  `.trim();
}

/** Sessions over time (from user.events to avoid session materialization latency) */
export function sessionsOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| makeTimeseries sessions = countDistinct(dt.rum.session.id), interval:${interval}
  `.trim();
}

/** Users over time (from user.events to avoid session materialization latency) */
export function usersOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| makeTimeseries users = countDistinct(dt.rum.instance.id), interval:${interval}
  `.trim();
}

/** Page views over time */
export function pageViewsOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| makeTimeseries pageViews = count(), interval:${interval}
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// REALTIME
// ═══════════════════════════════════════════════════════════════════════════════

/** Active users in last 30 minutes (from user.events — sessions table has latency) */
export function realtimeActiveUsers(appId: string): string {
  return `
fetch user.events, from:now()-30m
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    activeUsers = countDistinct(dt.rum.instance.id),
    sessions    = countDistinct(dt.rum.session.id)
  `.trim();
}

/** Real-time page views per minute (last 30 min) */
export function realtimePageViewsPerMinute(appId: string): string {
  return `
fetch user.events, from:now()-30m
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| makeTimeseries views = count(), interval:1m
  `.trim();
}

/** Real-time top active pages */
export function realtimeTopPages(appId: string): string {
  return `
fetch user.events, from:now()-5m
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| summarize activeViews = count(), by: { page.url.path }
| sort activeViews desc
| limit 10
  `.trim();
}

/** Real-time user locations (country ISO code — from user.events) */
export function realtimeUserCountries(appId: string): string {
  return `
fetch user.events, from:now()-30m
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(geo.country.iso_code)
| summarize users = countDistinct(dt.rum.instance.id), by: { geo.country.iso_code }
| sort users desc
| limit 10
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACQUISITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Traffic by referrer domain (from user.events page.source.url.domain).
 * Note: referrer.type does NOT exist on user.sessions in Gen 3.
 * We derive channel from the referrer domain on user.events instead.
 */
export function acquisitionByChannel(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    firstRefDomain = first(page.source.url.domain),
    by: { dt.rum.session.id, dt.rum.instance.id }
| fieldsAdd channel = if(isNull(firstRefDomain) or firstRefDomain == "", "Direct",
    else: if(contains(firstRefDomain, "google") or contains(firstRefDomain, "bing") or contains(firstRefDomain, "yahoo") or contains(firstRefDomain, "duckduckgo"), "Organic Search",
    else: if(contains(firstRefDomain, "facebook") or contains(firstRefDomain, "instagram") or contains(firstRefDomain, "twitter") or contains(firstRefDomain, "linkedin") or contains(firstRefDomain, "tiktok"), "Social",
    else: "Referral")))
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { channel }
| sort sessions desc
  `.trim();
}

/** Traffic by source (referrer domain from user.events) */
export function acquisitionBySource(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    refDomain = first(page.source.url.domain),
    by: { dt.rum.session.id, dt.rum.instance.id }
| fieldsAdd source = if(isNull(refDomain) or refDomain == "", "(direct)", else: refDomain)
| summarize sessions = count(), users = countDistinct(dt.rum.instance.id), by: { source }
| sort sessions desc
| limit 20
  `.trim();
}

/**
 * Device type breakdown.
 * Note: dt.rum.user_type does NOT exist on this environment.
 * We use device.type as a useful segmentation instead.
 */
export function acquisitionNewVsReturning(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}| filter isNotNull(device.type)
| summarize
    sessions    = count(),
    users       = countDistinct(dt.rum.instance.id),
    avgDuration = avg(duration),
    by: { device.type }
  `.trim();
}

/** Acquisition over time by channel (derived from referrer domain) */
export function acquisitionOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| fieldsAdd channel = if(isNull(page.source.url.domain) or page.source.url.domain == "", "Direct",
    else: if(contains(page.source.url.domain, "google") or contains(page.source.url.domain, "bing"), "Organic Search",
    else: if(contains(page.source.url.domain, "facebook") or contains(page.source.url.domain, "twitter") or contains(page.source.url.domain, "linkedin"), "Social",
    else: "Referral")))
| makeTimeseries sessions = count(), interval:${interval}, by: { channel }
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/** Top pages by views */
export function engagementTopPages(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| summarize
    views         = count(),
    uniqueUsers   = countDistinct(dt.rum.instance.id),
    avgDuration   = avg(duration),
    by: { page.url.path }
| sort views desc
| limit 25
  `.trim();
}

/**
 * Session duration distribution.
 * Note: duration on user.sessions is in NANOSECONDS.
 */
export function engagementSessionDuration(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| fieldsAdd durationSec = toDouble(duration) / 1000000000.0
| fieldsAdd durationBucket = if(durationSec < 10, "0-10s",
    else: if(durationSec < 30, "10-30s",
    else: if(durationSec < 60, "30-60s",
    else: if(durationSec < 180, "1-3m",
    else: if(durationSec < 600, "3-10m",
    else: if(durationSec < 1800, "10-30m",
    else: "30m+"))))))
| summarize sessions = count(), by: { durationBucket }
| sort sessions desc
  `.trim();
}

/** Pages per session distribution */
export function engagementPagesPerSession(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| fieldsAdd pageBucket = if(navigation_count <= 1, "1",
    else: if(navigation_count <= 3, "2-3",
    else: if(navigation_count <= 5, "4-5",
    else: if(navigation_count <= 10, "6-10",
    else: "11+"))))
| summarize sessions = count(), by: { pageBucket }
| sort sessions desc
  `.trim();
}

/** User engagement events (non-navigation) */
export function engagementEvents(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "user_interaction" or characteristics.classifier == "user_action"
| summarize eventCount = count(), users = countDistinct(dt.rum.instance.id), by: { characteristics.classifier }
| sort eventCount desc
| limit 20
  `.trim();
}

/** Landing pages (first page of session) */
export function engagementLandingPages(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize landingPage = first(page.url.path), by: { dt.rum.session.id }
| summarize entrances = count(), by: { landingPage }
| sort entrances desc
| limit 20
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNOLOGY
// ═══════════════════════════════════════════════════════════════════════════════

/** Browser breakdown */
export function techBrowsers(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(browser.name)
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { browser.name }
| sort sessions desc
| limit 10
  `.trim();
}

/** Operating system breakdown */
export function techOS(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(os.name)
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { os.name }
| sort sessions desc
| limit 10
  `.trim();
}

/** Device type breakdown (desktop, mobile) */
export function techDevices(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(device.type)
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { device.type }
| sort sessions desc
  `.trim();
}

/**
 * Screen resolution breakdown.
 * Note: screen.resolution does NOT exist. We build it from device.screen.width + device.screen.height.
 */
export function techScreenResolutions(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(device.screen.width) and isNotNull(device.screen.height)
| fieldsAdd resolution = concat(toString(device.screen.width), "x", toString(device.screen.height))
| summarize sessions = count(), by: { resolution }
| sort sessions desc
| limit 10
  `.trim();
}

/**
 * Geography: sessions by country.
 * Note: Only geo.country.iso_code is available (2-letter ISO), NOT geo.country.name.
 */
export function geoByCountry(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(geo.country.iso_code)
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { geo.country.iso_code }
| sort sessions desc
| limit 20
  `.trim();
}

/**
 * Geography: sessions by ISP (closest substitute for city).
 * Note: geo.city.name does NOT exist on user.sessions.
 * client.isp is available as an alternative geographical breakdown.
 */
export function geoByCity(appId: string, timeframe: string): string {
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}
| filter isNotNull(client.isp)
| summarize
    sessions = count(),
    users    = countDistinct(dt.rum.instance.id),
    by: { client.isp }
| sort sessions desc
| limit 20
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS & PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Known marketing, analytics, advertising, consent, and tracking domains.
 * Failed requests to these endpoints are NOT guest-impacting.
 * This list is generic and covers the most common third-party services
 * found on any commercial website — not specific to any one tenant.
 * Exported so the UI can also use these patterns for client-side classification.
 */
export const MARKETING_ANALYTICS_PATTERNS: string[] = [
  // ── Google ─────────────────────────────────────────────────────────────
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "googlesyndication.com",
  "googleadservices.com",
  "google.com/ccm/collect",
  "google.com/rmkt/collect",
  "google.com/pagead",
  "googleads.g.doubleclick.net",
  "doubleclick.net",
  "google.com/ads",
  "google.com/adsense",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "www.google.com/recaptcha",
  "recaptcha.net",
  "google.com/recaptcha",
  // ── Meta / Facebook ───────────────────────────────────────────────────
  "facebook.com",
  "facebook.net",
  "connect.facebook.net",
  "graph.facebook.com",
  "pixel.facebook.com",
  "ep1.facebook.com",
  "ep2.facebook.com",
  "instagram.com/embed",
  "instagram.com/logging",
  // ── TikTok ────────────────────────────────────────────────────────────
  "analytics.tiktok.com",
  "tiktok.com/i18n/pixel",
  "business-api.tiktok.com",
  // ── Twitter / X ───────────────────────────────────────────────────────
  "platform.twitter.com",
  "twitter.com/widgets",
  "analytics.twitter.com",
  "t.co/i/adsct",
  "ads-twitter.com",
  "ads-api.twitter.com",
  // ── Microsoft / Bing ──────────────────────────────────────────────────
  "bat.bing.com",
  "bing.com/bat",
  "clarity.ms",
  "c.clarity.ms",
  "c.bing.com",
  // ── LinkedIn ──────────────────────────────────────────────────────────
  "snap.licdn.com",
  "linkedin.com/px",
  "ads.linkedin.com",
  "analytics.linkedin.com",
  "dc.ads.linkedin.com",
  // ── Pinterest ─────────────────────────────────────────────────────────
  "pinterest.com/ct",
  "ct.pinterest.com",
  "analytics.pinterest.com",
  // ── Snapchat ──────────────────────────────────────────────────────────
  "tr.snapchat.com",
  "sc-static.net",
  // ── Adobe / Omniture ──────────────────────────────────────────────────
  "demdex.net",
  "omtrdc.net",
  "2o7.net",
  "sc.omtrdc.net",
  "everesttech.net",
  // ── A/B Testing & Optimisation ────────────────────────────────────────
  "webtrends-optimize.com",
  "optimizely.com",
  "cdn.optimizely.com",
  "logx.optimizely.com",
  "cdn-pci.optimizely.com",
  "abtasty.com",
  "kameleoon.eu",
  "kameleoon.com",
  "vwo.com",
  "dev.visualwebsiteoptimizer.com",
  // ── Consent Management ────────────────────────────────────────────────
  "privacy-center.org",
  "sdk.privacy-center.org",
  "api.privacy-center.org",
  "onetrust.com",
  "cdn.cookielaw.org",
  "cookielaw.org",
  "trustarc.com",
  "consent.trustarc.com",
  "quantcast.mgr.consensu.org",
  "cmp.quantcast.com",
  "didomi.io",
  "sdk.didomi.io",
  // ── Ad Networks & Exchanges ───────────────────────────────────────────
  "criteo.com",
  "criteo.net",
  "adnxs.com",
  "adsrvr.org",
  "bidswitch.net",
  "casalemedia.com",
  "openx.net",
  "pubmatic.com",
  "rubiconproject.com",
  "taboola.com",
  "outbrain.com",
  "amazon-adsystem.com",
  "advertising.com",
  "media.net",
  "moatads.com",
  "serving-sys.com",
  "3lift.com",
  "sharethrough.com",
  "teads.tv",
  // ── Analytics & Tracking ──────────────────────────────────────────────
  "hotjar.com",
  "static.hotjar.com",
  "script.hotjar.com",
  "vars.hotjar.com",
  "quantserve.com",
  "scorecardresearch.com",
  "sb.scorecardresearch.com",
  "pixel.quantserve.com",
  "segment.io",
  "api.segment.io",
  "cdn.segment.com",
  "heapanalytics.com",
  "cdn.heapanalytics.com",
  "mixpanel.com",
  "api.mixpanel.com",
  "cdn.mxpnl.com",
  "amplitude.com",
  "api.amplitude.com",
  "cdn.amplitude.com",
  "fullstory.com",
  "rs.fullstory.com",
  "mouseflow.com",
  "n.mouseflow.com",
  "logrocket.com",
  "cdn.logrocket.io",
  "sentry.io",
  "contentsquare.net",
  "t.contentsquare.net",
  "c.contentsquare.net",
  "pendo.io",
  "cdn.pendo.io",
  "app.pendo.io",
  "plausible.io",
  "api.plausible.io",
  "matomo.cloud",
  "newrelic.com",
  "bam.nr-data.net",
  "js-agent.newrelic.com",
  "datadog-rum.com",
  "browser-intake-datadoghq.com",
  // ── Affiliate & Attribution ───────────────────────────────────────────
  "impactcdn.com",
  "impact.com",
  "go.impact.com",
  "fingerprint.host",
  "fpjs.io",
  "branch.io",
  "app.link",
  "adjust.com",
  "appsflyer.com",
  "kochava.com",
  "go.flx1.com",
  // ── Chat & Support Widgets ────────────────────────────────────────────
  "widget.intercom.io",
  "js.intercomcdn.com",
  "api-iam.intercom.io",
  "embed.tawk.to",
  "cdn.livechatinc.com",
  "api.livechatinc.com",
  "static.zdassets.com",
  "ekr.zdassets.com",
  "drift.com",
  "js.driftt.com",
  // ── Social Embeds & Sharing ───────────────────────────────────────────
  "platform.linkedin.com",
  "assets.pinterest.com",
  "widgets.pinterest.com",
  "s7.addthis.com",
  "m.addthis.com",
  "sharethis.com",
  // ── Email Marketing & Push ────────────────────────────────────────────
  "cdn.sailthru.com",
  "braze.com",
  "sdk.iad-01.braze.com",
  "sdk.iad-03.braze.com",
  "push.zhanzhang.baidu.com",
  "onesignal.com",
  "cdn.onesignal.com",
  "customer.io",
  "track.customer.io",
  // ── Tag Managers & Data Layers ────────────────────────────────────────
  "cdn.tagcommander.com",
  "cdn.segment.com",
  "cdn.ravenjs.com",
  "cdn.cookiebot.com",
  "tealiumiq.com",
  "tags.tiqcdn.com",
  "collect.tealiumiq.com",
  "ensighten.com",
  "nexus.ensighten.com",
];

/** DQL filter clause to exclude marketing/analytics request errors */
function marketingExcludeFilter(exclude: boolean): string {
  if (!exclude) return "";
  // Use matchesValue with wildcards — single expression, stays under the 250 sub-expression DQL limit.
  // Only exclude marketing domains from "request" type errors; non-request errors pass through.
  const patterns = [
    "*google-analytics.com*", "*analytics.google.com*", "*googletagmanager.com*",
    "*googlesyndication.com*", "*googleadservices.com*", "*doubleclick.net*",
    "*google.com/ccm*", "*google.com/rmkt*", "*google.com/pagead*",
    "*adservice.google.com*", "*recaptcha.net*",
    "*facebook.com*", "*facebook.net*",
    "*tiktok.com*", "*twitter.com*", "*ads-twitter.com*",
    "*bat.bing.com*", "*clarity.ms*",
    "*licdn.com*", "*linkedin.com/px*", "*ads.linkedin.com*",
    "*pinterest.com/ct*", "*ct.pinterest.com*",
    "*tr.snapchat.com*", "*sc-static.net*",
    "*demdex.net*", "*omtrdc.net*", "*2o7.net*", "*everesttech.net*",
    "*webtrends-optimize.com*", "*optimizely.com*", "*abtasty.com*", "*kameleoon.eu*", "*kameleoon.com*",
    "*privacy-center.org*", "*onetrust.com*", "*cookielaw.org*", "*trustarc.com*", "*didomi.io*",
    "*criteo.com*", "*criteo.net*", "*adnxs.com*", "*adsrvr.org*",
    "*taboola.com*", "*outbrain.com*", "*amazon-adsystem.com*", "*moatads.com*",
    "*hotjar.com*", "*quantserve.com*", "*scorecardresearch.com*",
    "*segment.io*", "*segment.com/analytics*", "*heapanalytics.com*",
    "*mixpanel.com*", "*amplitude.com*", "*fullstory.com*",
    "*mouseflow.com*", "*logrocket.com*", "*contentsquare.net*",
    "*pendo.io*", "*newrelic.com*", "*nr-data.net*", "*datadog*",
    "*impactcdn.com*", "*fingerprint.host*", "*fpjs.io*",
    "*intercom.io*", "*intercomcdn.com*", "*tawk.to*", "*livechatinc.com*",
    "*drift.com*", "*driftt.com*",
    "*braze.com*", "*onesignal.com*", "*customer.io*",
    "*tealiumiq.com*", "*tiqcdn.com*", "*ensighten.com*",
    "*addthis.com*", "*sharethis.com*",
  ];
  return `| filter error.type != "request" OR NOT matchesValue(error.display_name, ${patterns.map(p => `"${p}"`).join(", ")})\n`;
}

/** Error KPIs: total errors, affected sessions, affected users */
export function errorsKPIs(appId: string, timeframe: string, excludeMarketing = false): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
${marketingExcludeFilter(excludeMarketing)}| summarize
    totalErrors     = count(),
    affectedSessions = countDistinct(dt.rum.session.id),
    affectedUsers    = countDistinct(dt.rum.instance.id)
  `.trim();
}

/** Errors over time */
export function errorsOverTime(appId: string, timeframe: string, excludeMarketing = false): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
${marketingExcludeFilter(excludeMarketing)}| makeTimeseries errors = count(), interval:${interval}
  `.trim();
}

/** Top error messages */
export function errorsTopMessages(appId: string, timeframe: string, excludeMarketing = false): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
| filter isNotNull(error.display_name)
${marketingExcludeFilter(excludeMarketing)}| fieldsAdd error.display_name = if(contains(error.display_name, ".js:"), concat(arrayElement(splitString(error.display_name, ".js:"), 0), ".js"), else: error.display_name)
| summarize
    occurrences = count(),
    sessions    = countDistinct(dt.rum.session.id),
    by: { error.display_name, error.type }
| sort occurrences desc
| limit 20
  `.trim();
}

/** Error types breakdown (type + source) */
export function errorsByType(appId: string, timeframe: string, excludeMarketing = false): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
${marketingExcludeFilter(excludeMarketing)}| summarize
    errors   = count(),
    sessions = countDistinct(dt.rum.session.id),
    by: { error.type, error.source }
| sort errors desc
  `.trim();
}

/** Top error messages for a specific type+source (used in detail modal) */
export function errorTypeDetail(appId: string, timeframe: string, errType: string, errSource: string | null, excludeMarketing = false): string {
  const sourceFilter = errSource && errSource !== "—"
    ? `| filter error.source == "${errSource}"`
    : `| filter isNull(error.source)`;
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
| filter error.type == "${errType}"
${sourceFilter}
| filter isNotNull(error.display_name)
${marketingExcludeFilter(excludeMarketing)}| summarize
    occurrences = count(),
    sessions    = countDistinct(dt.rum.session.id),
    by: { error.display_name }
| sort occurrences desc
| limit 15
  `.trim();
}

/** Errors by page */
export function errorsByPage(appId: string, timeframe: string, excludeMarketing = false): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "error"
| filter isNotNull(page.url.path)
${marketingExcludeFilter(excludeMarketing)}| summarize
    errors   = count(),
    sessions = countDistinct(dt.rum.session.id),
    by: { page.url.path }
| sort errors desc
| limit 20
  `.trim();
}

/** Page load duration distribution */
export function pageLoadDistribution(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(performance.load_event_end)
| fieldsAdd loadSec = toLong(performance.load_event_end) / 1000000000
| filter loadSec > 0
| fieldsAdd loadBucket = if(loadSec < 1, "<1s",
    else: if(loadSec < 2, "1-2s",
    else: if(loadSec < 3, "2-3s",
    else: if(loadSec < 5, "3-5s",
    else: if(loadSec < 10, "5-10s",
    else: ">10s")))))
| summarize pages = count(), by: { loadBucket }
| sort pages desc
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER JOURNEYS
// ═══════════════════════════════════════════════════════════════════════════════

/** Top page flows: from → to transitions */
export function journeyPageFlows(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize pages = collectArray(page.url.path), by: { dt.rum.session.id }
| filter arraySize(pages) >= 2
| expand idx = array(0,1,2,3,4,5,6,7,8,9)
| filter idx < arraySize(pages) - 1
| fieldsAdd fromPage = arrayElement(pages, idx), toPage = arrayElement(pages, idx + 1)
| summarize transitions = count(), by: { fromPage, toPage }
| sort transitions desc
| limit 25
  `.trim();
}

/** Count total sessions with 2+ navigation pages (for "Showing X of Y" label) */
export function journeySessionCount(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| summarize pageCount = count(), by: { dt.rum.session.id }
| filter pageCount >= 2
| summarize totalSessions = count()
  `.trim();
}

/** Sankey session-level page arrays: one row per session with ordered page paths */
export function journeySankeyFlows(appId: string, timeframe: string, maxSteps: number = 5): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| limit 200000
| sort start_time asc
| summarize pages = collectArray(page.url.path), by: { dt.rum.session.id }
| fieldsAdd pageCount = arraySize(pages)
| filter pageCount >= 2
| filter pageCount <= ${maxSteps + 5}
| fields pages, pageCount
| limit 50000
  `.trim();
}

/** Exit pages: last page before session ends */
export function journeyExitPages(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time desc
| summarize exitPage = first(page.url.path), by: { dt.rum.session.id }
| summarize exits = count(), by: { exitPage }
| sort exits desc
| limit 20
  `.trim();
}

/** Top complete paths (first 3 pages of each session) */
export function journeyTopPaths(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize pages = collectArray(page.url.path), by: { dt.rum.session.id }
| fieldsAdd pathLength = arraySize(pages)
| filter pathLength >= 2
| fieldsAdd path = concat(
    arrayFirst(pages),
    " → ",
    if(pathLength >= 2, arrayElement(pages, 1), else: ""),
    if(pathLength >= 3, concat(" → ", arrayElement(pages, 2)), else: "")
  )
| summarize sessions = count(), avgDepth = avg(pathLength), by: { path }
| sort sessions desc
| limit 15
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════

/** Session list with key dimensions */
export function sessionList(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    pageViews  = count(),
    firstPage  = first(page.url.path),
    lastPage   = last(page.url.path),
    startTime  = min(start_time),
    endTime    = max(start_time),
    errors     = countIf(characteristics.has_error == true),
    by: { dt.rum.session.id, dt.rum.instance.id, device.type, browser.name, geo.country.iso_code }
| fieldsAdd durationSec = toDouble(endTime - startTime) / 1000000000.0
| sort startTime desc
| limit 100
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEB VITALS
// ═══════════════════════════════════════════════════════════════════════════════

/** Core Web Vitals averages and p75 */
export function webVitalsKPIs(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter isNotNull(web_vitals.time_to_first_byte) or isNotNull(web_vitals.largest_contentful_paint) or isNotNull(web_vitals.cumulative_layout_shift) or isNotNull(web_vitals.interaction_to_next_paint) or isNotNull(web_vitals.first_contentful_paint)
| summarize
    ttfb_avg  = avg(toDouble(web_vitals.time_to_first_byte) / 1000000.0),
    ttfb_p75  = percentile(toDouble(web_vitals.time_to_first_byte) / 1000000.0, 75),
    lcp_avg   = avg(toDouble(web_vitals.largest_contentful_paint) / 1000000.0),
    lcp_p75   = percentile(toDouble(web_vitals.largest_contentful_paint) / 1000000.0, 75),
    fcp_avg   = avg(toDouble(web_vitals.first_contentful_paint) / 1000000.0),
    fcp_p75   = percentile(toDouble(web_vitals.first_contentful_paint) / 1000000.0, 75),
    cls_avg   = avg(toDouble(web_vitals.cumulative_layout_shift)),
    cls_p75   = percentile(toDouble(web_vitals.cumulative_layout_shift), 75),
    inp_avg   = avg(toDouble(web_vitals.interaction_to_next_paint) / 1000000.0),
    inp_p75   = percentile(toDouble(web_vitals.interaction_to_next_paint) / 1000000.0, 75),
    samples   = count()
  `.trim();
}

/** Web vitals over time for a selected metric */
export function webVitalsOverTime(appId: string, timeframe: string, metric: string = "lcp"): string {
  const interval = timeframeToBucket(timeframe);
  const metricMap: Record<string, { field: string; divisor: string; alias: string }> = {
    ttfb: { field: "web_vitals.time_to_first_byte", divisor: " / 1000000.0", alias: "ttfb_p75" },
    fcp:  { field: "web_vitals.first_contentful_paint", divisor: " / 1000000.0", alias: "fcp_p75" },
    lcp:  { field: "web_vitals.largest_contentful_paint", divisor: " / 1000000.0", alias: "lcp_p75" },
    cls:  { field: "web_vitals.cumulative_layout_shift", divisor: "", alias: "cls_p75" },
    inp:  { field: "web_vitals.interaction_to_next_paint", divisor: " / 1000000.0", alias: "inp_p75" },
  };
  const m = metricMap[metric] ?? metricMap["lcp"];
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter isNotNull(${m.field})
| makeTimeseries ${m.alias} = percentile(toDouble(${m.field})${m.divisor}, 75), interval:${interval}
  `.trim();
}

/** Web vitals by page */
export function webVitalsByPage(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter isNotNull(web_vitals.largest_contentful_paint) and isNotNull(page.url.path)
| summarize
    lcp_p75 = percentile(toDouble(web_vitals.largest_contentful_paint) / 1000000.0, 75),
    fcp_p75 = percentile(toDouble(web_vitals.first_contentful_paint) / 1000000.0, 75),
    cls_p75 = percentile(toDouble(web_vitals.cumulative_layout_shift), 75),
    samples = count(),
    by: { page.url.path }
| sort samples desc
| limit 20
  `.trim();
}

/** Pages failing Core Web Vitals thresholds (high traffic, actionable) */
export function webVitalsFailingPages(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "view_summary"
| filter isNotNull(device.type)
| summarize
    Sessions = countDistinct(dt.rum.session.id),
    LCP_P75 = toDouble(percentile(web_vitals.largest_contentful_paint, 75) / 1000000),
    CLS_P75 = toDouble(percentile(web_vitals.cumulative_layout_shift, 75)),
    INP_P75 = toDouble(percentile(web_vitals.interaction_to_next_paint, 75) / 1000000),
    FCP_P75 = toDouble(percentile(web_vitals.first_contentful_paint, 75) / 1000000),
    TTFB_P75 = toDouble(percentile(web_vitals.time_to_first_byte, 75) / 1000000),
    Samples = count(),
    by: { view.detected_name }
| filter Samples >= 30
| fieldsAdd
    LCP_SLO = if(LCP_P75 <= 2500.0, "pass", else: "fail"),
    CLS_SLO = if(CLS_P75 <= 0.1, "pass", else: "fail"),
    INP_SLO = if(INP_P75 <= 200.0, "pass", else: "fail"),
    FCP_SLO = if(FCP_P75 <= 1800.0, "pass", else: "fail"),
    TTFB_SLO = if(TTFB_P75 <= 800.0, "pass", else: "fail")
| filter LCP_P75 > 2500.0 or CLS_P75 > 0.1 or INP_P75 > 200.0
| sort Sessions desc
| limit 10
| fieldsRename Page = view.detected_name
| fields Page, Sessions, LCP_P75, LCP_SLO, CLS_P75, CLS_SLO, INP_P75, INP_SLO, FCP_P75, FCP_SLO, TTFB_P75, TTFB_SLO
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETENTION
// ═══════════════════════════════════════════════════════════════════════════════

/** Daily unique visitors (for retention trending) */
export function retentionDailyVisitors(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| makeTimeseries
    totalUsers    = countDistinct(dt.rum.instance.id),
    interval:${interval}
  `.trim();
}

/** Session frequency: how many sessions per user */
export function retentionSessionFrequency(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize sessions = countDistinct(dt.rum.session.id), by: { dt.rum.instance.id }
| fieldsAdd freqBucket = if(sessions == 1, "1 session",
    else: if(sessions <= 3, "2-3 sessions",
    else: if(sessions <= 5, "4-5 sessions",
    else: if(sessions <= 10, "6-10 sessions",
    else: "11+ sessions"))))
| summarize users = count(), by: { freqBucket }
| sort users desc
  `.trim();
}

/** New vs returning visitors */
export function retentionNewVsReturning(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize sessions = countDistinct(dt.rum.session.id), by: { dt.rum.instance.id }
| fieldsAdd visitorType = if(sessions == 1, "New visitor", else: "Returning visitor")
| summarize users = count(), by: { visitorType }
  `.trim();
}

/** Returning visitor loyalty tiers — how many sessions do returners have? */
export function retentionReturningDepth(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize sessions = countDistinct(dt.rum.session.id), by: { dt.rum.instance.id }
| filter sessions > 1
| fieldsAdd loyaltyTier = if(sessions <= 3, "Casual (2-3)",
    else: if(sessions <= 5, "Regular (4-5)",
    else: if(sessions <= 10, "Engaged (6-10)",
    else: "Loyal (11+)")))
| summarize users = count(), avgSessions = avg(sessions), by: { loyaltyTier }
| sort avgSessions asc
  `.trim();
}

/** Returning visitors — how many distinct days did they visit? */
export function retentionReturningFrequency(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| fieldsAdd visitDay = formatTimestamp(start_time, format:"yyyy-MM-dd")
| summarize
    sessions = countDistinct(dt.rum.session.id),
    activeDays = countDistinct(visitDay),
    by: { dt.rum.instance.id }
| filter sessions > 1
| fieldsAdd daysPerWeek = toDouble(activeDays) / (toDouble(${timeframeDays(timeframe)}) / 7.0)
| fieldsAdd freqBand = if(daysPerWeek >= 5, "Daily (5+/wk)",
    else: if(daysPerWeek >= 2, "Several times/wk",
    else: if(daysPerWeek >= 0.5, "Weekly",
    else: "Monthly or less")))
| summarize users = count(), by: { freqBand }
| sort users desc
  `.trim();
}

/** "New" visitor quality — signals that suggest cookie/tracker blocking rather than truly new */
export function retentionNewVisitorQuality(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    sessions = countDistinct(dt.rum.session.id),
    pageViews = count(),
    browsers = collectDistinct(browser.name),
    by: { dt.rum.instance.id }
| filter sessions == 1
| fieldsAdd browserName = browsers[0]
| fieldsAdd isPrivacyBrowser = if(
    browserName == "Safari" or browserName == "Firefox" or browserName == "Brave" or browserName == "DuckDuckGo",
    true, else: false)
| fieldsAdd isSinglePage = if(pageViews == 1, true, else: false)
| summarize
    totalNew = count(),
    privacyBrowserNew = countIf(isPrivacyBrowser == true),
    singlePageNew = countIf(isSinglePage == true),
    multiPageNew = countIf(pageViews > 3)
  `.trim();
}

/** "New" visitor breakdown by browser — which browsers produce the most "new" visitors */
export function retentionNewByBrowser(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    sessions = countDistinct(dt.rum.session.id),
    browsers = collectDistinct(browser.name),
    by: { dt.rum.instance.id }
| filter sessions == 1
| fieldsAdd browserName = browsers[0]
| summarize newVisitors = count(), by: { browserName }
| sort newVisitors desc
| limit 10
  `.trim();
}

/** Day-of-week patterns for returning visitors */
export function retentionDayOfWeek(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize sessions = countDistinct(dt.rum.session.id), by: { dt.rum.instance.id, dt.rum.session.id }
| lookup [
    fetch user.events, ${timeframeClause(timeframe)}
    ${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
    | summarize sessionCount = countDistinct(dt.rum.session.id), by: { dt.rum.instance.id }
  ], sourceField:dt.rum.instance.id, lookupField:dt.rum.instance.id, fields:{ sessionCount }
| filter sessionCount > 1
| lookup [
    fetch user.events, ${timeframeClause(timeframe)}
    ${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
    | summarize minTime = min(start_time), by: { dt.rum.session.id }
  ], sourceField:dt.rum.session.id, lookupField:dt.rum.session.id, fields:{ minTime }
| fieldsAdd dayName = formatTimestamp(minTime, format:"EEEE")
| summarize visits = count(), by: { dayName }
| sort visits desc
  `.trim();
}

/** Returning visitors over time trend (as a timeseries) */
export function retentionReturningTrend(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.sessions, ${timeframeClause(timeframe)}
${sessionAppFilter(appId)}| summarize totalVisitors = countDistinct(dt.rum.instance.id), interval: ${interval}
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Build a DQL filter clause from conversion patterns */
function conversionFilter(patterns: string[]): string {
  return patterns.map(p => `contains(page.url.path, "${p}")`).join(" or ");
}

/** Page depth funnel: sessions reaching N pages */
export function conversionPageDepthFunnel(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize pageViews = count(), by: { dt.rum.session.id }
| summarize
    reached1  = countIf(pageViews >= 1),
    reached2  = countIf(pageViews >= 2),
    reached3  = countIf(pageViews >= 3),
    reached5  = countIf(pageViews >= 5),
    reached10 = countIf(pageViews >= 10)
  `.trim();
}

/** Top conversion pages (pages that tend to be deeper in sessions) */
export function conversionGoalPages(appId: string, timeframe: string, patterns?: string[]): string {
  const filter = conversionFilter(patterns || ["booking", "order", "checkout", "confirm", "payment", "thank", "success", "basket", "cart", "reserve"]);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| filter ${filter}
| summarize
    views    = count(),
    users    = countDistinct(dt.rum.instance.id),
    sessions = countDistinct(dt.rum.session.id),
    by: { page.url.path }
| sort views desc
| limit 20
  `.trim();
}

/** Conversion rate: sessions that reached a "goal" page vs total */
export function conversionRate(appId: string, timeframe: string, patterns?: string[]): string {
  const filter = conversionFilter(patterns || ["booking", "order", "checkout", "confirm", "payment", "thank", "success", "basket", "cart", "reserve"]);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    hasGoal  = countIf(${filter}),
    by: { dt.rum.session.id }
| summarize
    totalSessions = count(),
    convertedSessions = countIf(hasGoal > 0)
| fieldsAdd conversionRate = toDouble(convertedSessions) / toDouble(totalSessions) * 100.0
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTM CAMPAIGNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * UTM parameter extraction helper.
 * Extracts a named query parameter from page.url.full using string functions.
 * DQL doesn't have a native URL parse, so we use splitString + contains.
 *
 * Strategy: split URL on "?" to get query string, then split on "&" to get
 * individual params, and use contains to find e.g. "utm_source=".
 * Since DQL can't iterate arrays dynamically, we use a simpler approach:
 * extract the substring after "utm_source=" up to the next "&" or end.
 */

// DQL expression that extracts a UTM param value from the full URL.
// Usage: substitute PARAM_NAME with utm_source, utm_medium, etc.
// Splits on & then # then ? to handle fragment-based URLs (e.g. path#/...?utm_source=meta)
function utmExtract(param: string): string {
  return `if(contains(coalesce(page.url.full, ""), "${param}="),
    arrayElement(splitString(arrayElement(splitString(arrayElement(splitString(
      arrayElement(splitString(coalesce(page.url.full, ""), "${param}="), 1),
    "&"), 0), "#"), 0), "?"), 0),
    else: "")`;
}

/** UTM campaign overview — sessions & users by campaign */
export function utmByCampaign(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| fieldsAdd utm_campaign = ${utmExtract("utm_campaign")}
| filter utm_campaign != ""
| summarize
    sessions = countDistinct(dt.rum.session.id),
    users = countDistinct(dt.rum.instance.id),
    pageViews = count(),
    by: { utm_campaign }
| sort sessions desc
| limit 25
  `.trim();
}

/** UTM source/medium breakdown */
export function utmBySourceMedium(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| fieldsAdd
    utm_source = ${utmExtract("utm_source")},
    utm_medium = ${utmExtract("utm_medium")}
| filter utm_source != "" or utm_medium != ""
| fieldsAdd
    source = if(utm_source == "", "(not set)", else: utm_source),
    medium = if(utm_medium == "", "(not set)", else: utm_medium)
| summarize
    sessions = countDistinct(dt.rum.session.id),
    users = countDistinct(dt.rum.instance.id),
    by: { source, medium }
| sort sessions desc
| limit 25
  `.trim();
}

/** UTM sessions over time — trend by campaign */
export function utmOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| makeTimeseries sessions = countDistinct(dt.rum.session.id), interval:${interval}
  `.trim();
}

/** UTM content & term breakdown (for A/B testing) */
export function utmByContentTerm(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| fieldsAdd
    utm_content = ${utmExtract("utm_content")},
    utm_term = ${utmExtract("utm_term")}
| filter utm_content != "" or utm_term != ""
| fieldsAdd
    content = if(utm_content == "", "(not set)", else: utm_content),
    term = if(utm_term == "", "(not set)", else: utm_term)
| summarize
    sessions = countDistinct(dt.rum.session.id),
    by: { content, term }
| sort sessions desc
| limit 25
  `.trim();
}

/** UTM landing pages — which pages campaign traffic lands on */
export function utmLandingPages(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| fieldsAdd utm_campaign = ${utmExtract("utm_campaign")}
| filter utm_campaign != ""
| sort start_time asc
| summarize
    landingPage = first(page.url.path),
    utm_campaign = first(utm_campaign),
    by: { dt.rum.session.id }
| summarize sessions = count(), by: { landingPage, utm_campaign }
| sort sessions desc
| limit 25
  `.trim();
}

/** UTM summary KPIs — total sessions, users, campaigns with UTM params */
export function utmSummary(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter contains(coalesce(page.url.full, ""), "utm_")
| fieldsAdd utm_campaign = ${utmExtract("utm_campaign")}
| summarize
    sessions = countDistinct(dt.rum.session.id),
    users = countDistinct(dt.rum.instance.id),
    pageViews = count(),
    campaigns = countDistinct(if(utm_campaign != "", utm_campaign, else: ""))
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATION DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/** List all RUM applications available on the tenant */
export function discoverApplications(): string {
  return `
fetch dt.entity.application, from:now()-24h
| fields id, entity.name
| sort entity.name asc
| limit 100
  `.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Map a timeframe string to a sensible chart bucket interval */
function timeframeToBucket(timeframe: string): string {
  // Custom range: compute days between from/to
  if (timeframe.startsWith("custom:")) {
    const [from, to] = timeframe.slice(7).split("/");
    const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    if (days <= 0.125)  return "1m";   // ≤3 hours
    if (days <= 0.5)    return "15m";  // ≤12 hours
    if (days <= 1)      return "1h";
    if (days <= 7)      return "6h";
    return "1d";
  }
  const tf = timeframe.toLowerCase();
  if (tf === "30m" || tf === "1h")  return "1m";
  if (tf === "2h")                  return "5m";
  if (tf === "6h")                  return "15m";
  if (tf === "12h")                 return "30m";
  if (tf === "24h" || tf === "1d")  return "1h";
  if (tf === "7d")                  return "6h";
  if (tf === "28d" || tf === "30d") return "1d";
  if (tf === "90d")                 return "1d";
  return "1h"; // default
}

/** Returns the number of days in the selected timeframe (as a string for DQL injection) */
function timeframeDays(timeframe: string): string {
  if (timeframe.startsWith("custom:")) {
    const [from, to] = timeframe.slice(7).split("/");
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
    return String(days);
  }
  const tf = timeframe.toLowerCase();
  if (tf === "30m" || tf === "1h") return "1";
  if (tf === "6h" || tf === "12h" || tf === "24h" || tf === "1d") return "1";
  if (tf === "7d") return "7";
  if (tf === "28d" || tf === "30d") return "28";
  if (tf === "90d") return "90";
  return "1";
}

// ═══════════════════════════════════════════════════════════════════════════════
// AEM REQUEST ANALYSIS — Content Navigation & Referrer Intelligence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Summary KPIs: total page views, unique referrer domains, avg session depth,
 * and percentage of direct (non-referred) traffic.
 */
export function aemKPIs(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    refDomain = first(page.source.url.domain),
    pageCount = count(),
    by: { dt.rum.session.id }
| summarize
    totalSessions      = count(),
    totalPageViews     = sum(pageCount),
    avgDepth           = avg(pageCount),
    uniqueRefDomains   = countDistinct(refDomain),
    directSessions     = countIf(isNull(refDomain) or refDomain == "")
  `.trim();
}

/**
 * Per-session page arrays WITH referrer domain — source data for the Chord diagram.
 * Each row: { pages: string[], refDomain: string, pageCount: number }
 * Processed client-side to build the page-to-page transition matrix.
 */
export function aemChordFlows(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize
    pages     = collectArray(page.url.path),
    refDomain = first(page.source.url.domain),
    by: { dt.rum.session.id }
| fieldsAdd pageCount = arraySize(pages)
| filter pageCount >= 1
| limit 25000
  `.trim();
}

/**
 * Top referrer domains — how many sessions originated from each external source.
 */
export function aemReferrerDomains(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize refDomain = first(page.source.url.domain), by: { dt.rum.session.id }
| fieldsAdd refSource = if(isNull(refDomain) or refDomain == "", "Direct / None", else: refDomain)
| summarize sessions = count(), by: { refSource }
| sort sessions desc
| limit 20
  `.trim();
}

/**
 * Entry page analysis by referrer channel:
 * which landing pages do users arrive on from each traffic source?
 * Returns: { channel, entryPage, sessions }
 */
export function aemEntryPagesByReferrer(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize
    pages     = collectArray(page.url.path),
    refDomain = first(page.source.url.domain),
    by: { dt.rum.session.id }
| fieldsAdd entryPage = arrayFirst(pages)
| fieldsAdd channel = if(isNull(refDomain) or refDomain == "", "Direct",
    else: if(contains(refDomain, "google") or contains(refDomain, "bing") or contains(refDomain, "yahoo") or contains(refDomain, "duckduckgo"), "Organic Search",
    else: if(contains(refDomain, "facebook") or contains(refDomain, "instagram") or contains(refDomain, "twitter") or contains(refDomain, "x.com") or contains(refDomain, "linkedin") or contains(refDomain, "tiktok") or contains(refDomain, "pinterest"), "Social",
    else: "Referral")))
| summarize sessions = count(), by: { channel, entryPage }
| sort sessions desc
| limit 40
  `.trim();
}

/**
 * Content performance: top pages by views, with unique users, avg time on page.
 */
export function aemContentPerformance(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| summarize
    views       = count(),
    uniqueUsers = countDistinct(dt.rum.instance.id),
    avgDuration = avg(toDouble(duration) / 1000000.0),
    by: { page.url.path }
| sort views desc
| limit 25
  `.trim();
}

/**
 * Referrer channel trend over time — sessions per channel per bucket.
 * Returns makeTimeseries result: { timeframe: timestamp, sessions: number, channel: string }
 */
export function aemReferrerChannelOverTime(appId: string, timeframe: string): string {
  const interval = timeframeToBucket(timeframe);
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| fieldsAdd channel = if(isNull(page.source.url.domain) or page.source.url.domain == "", "Direct",
    else: if(contains(page.source.url.domain, "google") or contains(page.source.url.domain, "bing") or contains(page.source.url.domain, "yahoo"), "Organic",
    else: if(contains(page.source.url.domain, "facebook") or contains(page.source.url.domain, "instagram") or contains(page.source.url.domain, "twitter") or contains(page.source.url.domain, "x.com") or contains(page.source.url.domain, "linkedin") or contains(page.source.url.domain, "tiktok"), "Social",
    else: "Referral")))
| makeTimeseries sessions = countDistinct(dt.rum.session.id), interval:${interval}, by: { channel }
  `.trim();
}

/**
 * Session depth (pages per session) broken down by referrer channel.
 * Useful for seeing whether organic search users explore deeper than direct visitors.
 */
export function aemSessionDepthByChannel(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| summarize
    pageCount = count(),
    refDomain = first(page.source.url.domain),
    by: { dt.rum.session.id }
| fieldsAdd channel = if(isNull(refDomain) or refDomain == "", "Direct",
    else: if(contains(refDomain, "google") or contains(refDomain, "bing") or contains(refDomain, "yahoo") or contains(refDomain, "duckduckgo"), "Organic Search",
    else: if(contains(refDomain, "facebook") or contains(refDomain, "instagram") or contains(refDomain, "twitter") or contains(refDomain, "x.com") or contains(refDomain, "linkedin") or contains(refDomain, "tiktok") or contains(refDomain, "pinterest"), "Social",
    else: "Referral")))
| summarize
    sessions    = count(),
    avgDepth    = avg(pageCount),
    medianDepth = percentile(pageCount, 50),
    maxDepth    = max(pageCount),
    by: { channel }
| sort sessions desc
  `.trim();
}

/**
 * Top page-to-page transitions (from → to) across all sessions.
 * Identical to journeyPageFlows but surfaced separately for the AEM page context.
 */
export function aemPageTransitions(appId: string, timeframe: string): string {
  return `
fetch user.events, ${timeframeClause(timeframe)}
${eventAppFilter(appId)}| filter characteristics.classifier == "navigation"
| filter isNotNull(page.url.path)
| sort start_time asc
| summarize pages = collectArray(page.url.path), by: { dt.rum.session.id }
| filter arraySize(pages) >= 2
| expand idx = array(0,1,2,3,4,5,6,7,8,9)
| filter idx < arraySize(pages) - 1
| fieldsAdd fromPage = arrayElement(pages, idx), toPage = arrayElement(pages, idx + 1)
| summarize transitions = count(), by: { fromPage, toPage }
| sort transitions desc
| limit 30
  `.trim();
}
