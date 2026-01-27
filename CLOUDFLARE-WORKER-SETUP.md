# Cloudflare Worker Setup Guide

This guide explains how to deploy the ESPN API proxy worker to Cloudflare.

## Prerequisites

- Cloudflare account (free tier works fine)
- Access to Cloudflare Workers dashboard

## Deployment Steps

### Option 1: Cloudflare Dashboard (Easiest)

1. **Go to Cloudflare Workers**
   - Visit: https://dash.cloudflare.com/
   - Navigate to: Workers & Pages → Create Application → Create Worker

2. **Name Your Worker**
   - Suggested name: `big-ten-standings-api`
   - Click "Deploy"

3. **Edit the Worker Code**
   - Click "Edit Code" button
   - Delete the default code
   - Copy/paste the entire content from `cloudflare-worker.js`
   - Click "Save and Deploy"

4. **Get Your Worker URL**
   - Copy the worker URL (e.g., `https://big-ten-standings-api.your-account.workers.dev`)
   - You'll need this for the next step

5. **Update script.js**
   - Open `script.js`
   - Find the `ESPN_API_URL` constant (line ~4)
   - Replace with your worker URL:
     ```javascript
     const ESPN_API_URL = "https://big-ten-standings-api.your-account.workers.dev";
     ```

### Option 2: Wrangler CLI (Advanced)

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Initialize project
wrangler init big-ten-standings-api

# Copy cloudflare-worker.js content to src/index.js

# Deploy
wrangler deploy
```

## Testing Your Worker

Once deployed, test it in your browser:

```
https://big-ten-standings-api.your-account.workers.dev
```

You should see JSON data with Big Ten standings.

## Configuration Options

### Custom Domain (Optional)

You can map a custom domain to your worker:
1. Go to Workers → Your Worker → Settings → Triggers
2. Add custom domain: `api.mbb-standings.erikrole.com`

### Rate Limiting (Optional)

Add to worker code if needed:
```javascript
// Check rate limit before fetching
const rateLimitKey = `rate-limit:${request.headers.get('CF-Connecting-IP')}`;
// Implement rate limiting logic
```

## Troubleshooting

### Worker returns 500 error
- Check Cloudflare Workers logs in dashboard
- Verify ESPN API is accessible
- Check worker code syntax

### CORS errors still occurring
- Verify worker is deployed and accessible
- Check that script.js is pointing to correct worker URL
- Clear browser cache

### No data returned
- ESPN may have changed their API structure
- Check worker logs for errors
- Try accessing ESPN API URL directly in browser

## Cost & Limits

**Cloudflare Workers Free Tier:**
- 100,000 requests per day
- 10ms CPU time per request
- More than enough for this use case

**Your usage:**
- ~1 request per 15 minutes per viewer
- Even with 1000 concurrent viewers, well under free limit

## Maintenance

The worker should be maintenance-free, but monitor:
- ESPN API changes (rare but possible)
- Cloudflare Workers status
- Error rates in dashboard

## Rollback Plan

If ESPN API doesn't work well:
1. Keep `backup/google-sheets-version` branch
2. Revert `script.js` to use `CSV_URL`
3. Switch back to Google Sheets

The Google Sheets backup is preserved in the git history and can be restored anytime.
