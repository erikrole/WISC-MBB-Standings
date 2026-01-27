/**
 * Cloudflare Worker to proxy ESPN API and add CORS headers
 *
 * Deploy this to: https://workers.cloudflare.com/
 * Then update your script.js ESPN_API_URL to point to this worker
 *
 * Example worker URL: https://big-ten-standings.your-worker.workers.dev
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // ESPN API endpoint for Big Ten men's basketball standings
      // Group 7 = Big Ten Conference
      const espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/standings?group=7';

      // Add cache busting timestamp
      const urlWithTimestamp = `${espnUrl}&t=${Date.now()}`;

      // Fetch from ESPN
      const response = await fetch(urlWithTimestamp, {
        headers: {
          'User-Agent': 'Big-Ten-Standings-Display/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`ESPN API returned ${response.status}`);
      }

      const data = await response.json();

      // Return with CORS headers
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      });
    } catch (error) {
      // Return error response
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch standings',
          message: error.message,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
