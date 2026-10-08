# Zipline Content Dashboard

Dashboard for ACS journal packages set to auto publish or under embargo. It currently runs on sample data.

## Run locally

Requires Node 18+. No dependencies to install.

```
node server.js
```

Then open http://localhost:3000 (set `PORT` to change the port).

## Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/avishek-tronc/zipline-dashboard)

The button reads `render.yaml` and creates a free web service that redeploys on every push to `main`.

## Login and Analytics

Use **Login** at the top of the dashboard (default credentials `Admin` / `Admin`; set `ADMIN_USER` and `ADMIN_PASS` to change them). Once signed in, **Analytics** opens `/analytics`, which shows total views, distinct visitors, each visitor IP address and its country, region and city.

Views are saved to `data/analytics.json` (set `DATA_DIR` to move it). Render's free plan has no persistent disk, so this file is reset on every redeploy or restart; attach a disk and point `DATA_DIR` at it to keep the history. Geography is looked up from the IP address with ipwho.is, falling back to ip-api.com.
