# User Session Analytics — Deployment Guide

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js | v18 or later |
| Dynatrace tenant | Gen 3 (Grail-enabled) |
| Tenant permissions | **App Engine** enabled; your account must have permission to deploy apps |

Install dependencies (first time only):

```bash
npm install
```

---

## 1. Set Your Target Tenant

Edit `app.config.json` and update the `environmentUrl` to your tenant:

```json
{
  "environmentUrl": "https://<your-tenant>.apps.dynatrace.com"
}
```

> **Sprint/lab tenants** use the format `https://<id>.sprint.apps.dynatracelabs.com`

---

## 2. Deploy

```bash
npm run deploy
```

You will be prompted to authenticate via browser if you are not already logged in. Once complete, the CLI will confirm deployment and print the app URL:

```
✔ App is deployed
Open your deployed app: 'https://<your-tenant>.apps.dynatrace.com/ui/apps/my.user.session.analytics'
```

---

## 3. Required Scopes

The app requests the following OAuth scopes automatically on first launch. Ensure your tenant allows these:

| Scope | Purpose |
|---|---|
| `storage:user.sessions:read` | Session-level analytics |
| `storage:user.events:read` | Page views, interactions, navigation |
| `storage:entities:read` | RUM application auto-discovery |
| `storage:buckets:read` | Grail bucket access |
| `storage:metrics:read` | Metrics data |
| `app-settings:objects:read/write` | Conversion & segment configuration |
| `settings:objects:write` | Gates Settings UI to environment admins |

---

## 4. After Deployment

- Open the app URL printed by the CLI
- Navigate to **Settings** to configure RUM applications, conversion goals, and saved segments
- The app auto-discovers RUM applications registered in your tenant

---

## Restoring Default Config

After deploying to a non-production tenant, restore `app.config.json` to the default before committing:

```json
{
  "environmentUrl": "https://demo.apps.dynatrace.com"
}
```
