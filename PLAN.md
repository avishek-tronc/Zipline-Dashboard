# Zipline Content Dashboard: plan (v1)

## Which "Zipline" is this?
No public Zipline API documents "auto publish" or "embargo" features. The public candidates are:
- **Zipline (diced/zipline)**, an open-source file/image upload server. Has a REST API but no publishing workflow.
- **Zipline (getzipline.com)**, a retail store-communications platform. Advertises a GraphQL API with "full access to all your Zipline data", but the docs are private (customer access only) and don't mention embargo.

So the API this dashboard needs is most likely private (internal or customer-only). The scaffold therefore talks to Zipline through one small adapter, and runs on mock data until we have the real endpoint and field names.

## Prototype (current)
`public/index.html` is a working prototype built to Avishek's spec (2026-10-07):
- **Table:** Sl. No., Journal Title, Package ID, Package Name, ASAP/Issue, SubmissionKey, Uploaded By User, Uploaded Date, Auto Publish Flag, Publish Status, Load Status, Preview (pop-up with package details and article list), Publish (all articles in the package), Embargo Date, Unpublish (ASAP/Issue). Columns sort on click; 20 rows per page.
- **Filters:** Journal Code (58 ACS journals), ASAP/Issue, Uploaded by User (acs_pet, acs_striave, acs_tnq), Published/Unpublished, Upload date range.
- **Today tiles:** auto published today, pending publish today, under embargo, uploaded today, load failures today.
- **Charts:** published today by hour (auto vs manual), uploads over the last 14 days by publish state, packages by uploader, embargo releases over the next 7 days. Tiles and charts follow the Journal, ASAP/Issue and User filters.

### Rules the prototype assumes (confirm against the real workflow)
- Publish is blocked when Load Status is N or the embargo date is in the future.
- Unpublish is available only for published packages.
- Auto publish packages go live on load, or when their embargo lifts.
- "Pending publish today" = loaded, unpublished, uploaded today or embargo lifting today, and not embargoed past today.

### Sample data and mock API
Data is generated in the browser (300 packages over 30 days, regenerated each day). Publish and Unpublish call a mock API at the top of the page script (`api.listPackages`, `api.publishPackage`, `api.unpublishPackage`) and are remembered in the browser for the day. To go live, replace those functions with calls to the server, which proxies to Zipline with the token from `.env`.

## Architecture
```
Browser (public/index.html)  ->  Node server (server.js)  ->  Zipline API
                                   |-- src/adapters/mock.js     (default, sample data)
                                   `-- src/adapters/zipline.js  (real API, fill in mapping)
```
- **Server-side proxy.** The API token lives in an environment variable on the server, never in the browser.
- **One normalized item shape**, so the UI never depends on Zipline's raw fields:
  `{ id, title, type: "auto_publish" | "embargo", scheduledAt, embargoUntil, status, author, section, url }`
- **No dependencies.** Plain Node 18+ and vanilla JS, so it runs anywhere. Can move to React/Next later if the app grows.

## Original v1 idea (superseded by the prototype above)
1. List all auto-publish and embargoed items with their scheduled/embargo-lift times.
2. Filter by type, status (upcoming / live / past), section, and free-text search.
3. Sort by time; show "in 3h 12m" countdowns and highlight items going live in the next 24h.
4. Read-only. No editing or publishing from the dashboard yet.

## Later (v2+)
- Reschedule, lift or extend an embargo, cancel auto-publish (write endpoints).
- Calendar/timeline view; alerts before items go live; audit log.
- Auth for dashboard users (SSO).

## What's needed to connect the real API
- Link to the Zipline API docs (or an example response for a scheduled and an embargoed item).
- Base URL and auth method (Bearer token, API key header, OAuth). Put the secret in `.env`, never in chat.
Then fill in `src/adapters/zipline.js` (endpoint + field mapping) and set `DATA_SOURCE=zipline`.

## Run it
```
cd dashboard
node server.js          # http://localhost:3000, mock data
```
