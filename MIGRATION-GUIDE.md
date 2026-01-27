# Migration Guide: Google Sheets → WarrenNolan Direct

This guide explains how to migrate from the Google Sheets CSV approach to fetching data directly from WarrenNolan.com.

## Why Migrate?

**Benefits:**
- ✅ Fully automated - no manual data entry
- ✅ Always up-to-date with WarrenNolan's data
- ✅ One less service to manage (no Google Sheet)
- ✅ Faster updates (real-time vs manual)
- ✅ Cleaner codebase

**Tradeoffs:**
- Depends on WarrenNolan's site structure staying consistent
- Requires Cloudflare Worker deployment
- Less control over data (can't manually fix errors)

## Migration Steps

### Step 1: Deploy Cloudflare Worker

1. Go to https://dash.cloudflare.com/
2. Navigate to Workers & Pages → Create Application → Create Worker
3. Name it: `big-ten-standings-warrennolan`
4. Copy content from `cloudflare-worker-warrennolan.js` and paste
5. Click "Save and Deploy"
6. Copy your worker URL (e.g., `https://big-ten-standings-warrennolan.YOUR-ACCOUNT.workers.dev`)

### Step 2: Test the Worker

Visit your worker URL in a browser. You should see JSON like:

```json
{
  "standings": [
    {
      "team": "NEBRASKA",
      "conf": "7-0",
      "ovr": "18-0",
      "apRank": 8,
      "wins": 18,
      "losses": 0,
      "confWins": 7,
      "confLosses": 0
    },
    ...
  ]
}
```

### Step 3: Update index.html

Replace `script.js` with `script-warrennolan.js`:

```html
<!-- OLD -->
<script src="script.js"></script>

<!-- NEW -->
<script src="script-warrennolan.js"></script>
```

### Step 4: Configure Worker URL

Edit `script-warrennolan.js` (line ~7):

```javascript
const CONFIG = {
  // Update this with your actual worker URL
  workerUrl: 'https://big-ten-standings-warrennolan.YOUR-ACCOUNT.workers.dev',
  // ... rest of config
};
```

### Step 5: Deploy & Test

1. Commit changes:
   ```bash
   git add .
   git commit -m "Migrate to WarrenNolan direct data source"
   git push origin claude/espn-api-implementation-HHfIz
   ```

2. Test on your preview deployment
3. If everything works, merge to main for production

### Step 6: Fine-Tune Worker (if needed)

If the data doesn't look right, you may need to adjust the HTML parsing in `cloudflare-worker-warrennolan.js`:

1. Visit https://www.warrennolan.com/basketball/2026/conference/Big-Ten
2. Right-click → Inspect → View table structure
3. Update the `parseWarrenNolanHTML()` function to match actual HTML
4. Redeploy worker

## Rollback Plan

If something goes wrong, you can easily roll back:

### Quick Rollback (5 minutes)

1. Edit `index.html`:
   ```html
   <script src="script.js"></script>  <!-- Use old script -->
   ```

2. Commit and push:
   ```bash
   git checkout claude/visual-rankings-updates-HHfIz
   git push origin main
   ```

Your Google Sheets data source will work immediately.

### Full Rollback

Merge the backup branch:
```bash
git checkout main
git merge backup/google-sheets-version
git push origin main
```

## Monitoring

After migration, monitor for:

1. **Data accuracy**: Compare with WarrenNolan to ensure parsing is correct
2. **Update frequency**: Verify standings update every 15 minutes
3. **Error rates**: Check Cloudflare Workers dashboard for 500 errors
4. **Load time**: Should be <500ms for data fetch

## Cost

**Cloudflare Workers Free Tier:**
- 100,000 requests/day (you'll use ~96/day = 1 every 15 min)
- Plenty of headroom for traffic spikes
- $0/month

## Troubleshooting

### Worker returns empty standings
**Fix**: WarrenNolan changed their HTML structure. Update `parseWarrenNolanHTML()` function.

### Data looks wrong
**Fix**: Check cell indices in parsing function. WarrenNolan may have added/removed columns.

### CORS errors
**Fix**: Verify worker has CORS headers (`Access-Control-Allow-Origin: *`)

### Slow updates
**Fix**: Reduce `REFRESH_INTERVAL_MS` in script config (currently 15 minutes)

## Maintenance

**Monthly**: Check that worker is still parsing correctly
**Quarterly**: Review Cloudflare Workers usage (should be well under free tier)
**Yearly**: Verify WarrenNolan hasn't significantly changed their site structure

## Questions?

Open an issue or check the README for more information.
