/**
 * Cloudflare Worker to scrape WarrenNolan Big Ten standings
 *
 * This worker fetches the HTML from WarrenNolan, parses the standings table,
 * and returns clean JSON data with CORS headers.
 *
 * Deploy to: https://workers.cloudflare.com/
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
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
      // Fetch WarrenNolan standings page
      const url = 'https://www.warrennolan.com/basketball/2026/conference/Big-Ten';

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Big-Ten-Standings-Display/1.0',
          'Accept': 'text/html',
        },
      });

      if (!response.ok) {
        throw new Error(`WarrenNolan returned ${response.status}`);
      }

      const html = await response.text();

      // Parse the HTML to extract standings data
      const standings = parseWarrenNolanHTML(html);

      if (!standings || standings.length === 0) {
        throw new Error('No standings data found');
      }

      // Return JSON with CORS headers
      return new Response(JSON.stringify({ standings }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      });
    } catch (error) {
      console.error('Worker error:', error);

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

/**
 * Parse WarrenNolan HTML to extract standings
 *
 * This function uses regex and string parsing since Cloudflare Workers
 * don't have a full DOM parser. Adjust the patterns based on actual HTML structure.
 */
function parseWarrenNolanHTML(html) {
  const standings = [];

  try {
    // WarrenNolan typically uses tables with specific classes
    // Adjust these patterns after inspecting the actual HTML

    // Find the main standings table (adjust selector as needed)
    const tableMatch = html.match(/<table[^>]*class="[^"]*conf-standings[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
                      html.match(/<table[^>]*id="[^"]*standings[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
                      html.match(/<table[^>]*>([\s\S]*?)<\/table>/);

    if (!tableMatch) {
      throw new Error('Could not find standings table');
    }

    const tableHTML = tableMatch[1];

    // Extract table rows (skip header row)
    const rowMatches = [...tableHTML.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    for (let i = 1; i < rowMatches.length; i++) { // Start at 1 to skip header
      const rowHTML = rowMatches[i][1];

      // Extract cells from row
      const cells = [...rowHTML.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(m => stripHTML(m[1]).trim());

      if (cells.length < 4) continue; // Skip incomplete rows

      // WarrenNolan typical format:
      // [Rank, Team, Conf, Overall, ...]
      // Adjust indices based on actual table structure

      let teamName = cells[1] || cells[0]; // Team name usually in 2nd column
      let confRecord = cells[2] || '';
      let ovrRecord = cells[3] || '';

      // Clean team name (remove links, extra spaces)
      teamName = teamName.replace(/^\d+\.\s*/, '').trim();

      // Skip empty rows
      if (!teamName || teamName.length < 2) continue;

      // Extract AP ranking if present (usually shown as superscript or prefix)
      let apRank = 999;
      const rankMatch = teamName.match(/^(\d+)\s+/);
      if (rankMatch) {
        apRank = parseInt(rankMatch[1], 10);
        teamName = teamName.substring(rankMatch[0].length);
      }

      // Parse conference record (format: "W-L")
      const confMatch = confRecord.match(/(\d+)-(\d+)/);
      const confWins = confMatch ? parseInt(confMatch[1], 10) : 0;
      const confLosses = confMatch ? parseInt(confMatch[2], 10) : 0;

      // Parse overall record (format: "W-L")
      const ovrMatch = ovrRecord.match(/(\d+)-(\d+)/);
      const overallWins = ovrMatch ? parseInt(ovrMatch[1], 10) : 0;
      const overallLosses = ovrMatch ? parseInt(ovrMatch[2], 10) : 0;

      standings.push({
        team: teamName.toUpperCase(),
        conf: confRecord,
        ovr: ovrRecord,
        apRank,
        wins: overallWins,
        losses: overallLosses,
        confWins,
        confLosses,
      });
    }

  } catch (error) {
    console.error('Parse error:', error);
    throw new Error(`Failed to parse HTML: ${error.message}`);
  }

  return standings;
}

/**
 * Strip HTML tags from text
 */
function stripHTML(html) {
  return html
    .replace(/<[^>]*>/g, '') // Remove all tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
