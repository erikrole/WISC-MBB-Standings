/**
 * Cloudflare Worker for Big Ten Basketball Standings
 * Fetches data from WarrenNolan (standings + NET) and NCAA (AP Poll)
 */

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // Fetch both sources in parallel
      const [warrenNolanResponse, apPollResponse] = await Promise.all([
        fetch('https://www.warrennolan.com/basketball/2026/conference/Big-Ten', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BigTenStandings/1.0)',
          },
        }),
        fetch('https://www.ncaa.com/rankings/basketball-men/d1/associated-press', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BigTenStandings/1.0)',
          },
        }),
      ]);

      if (!warrenNolanResponse.ok) {
        throw new Error(`WarrenNolan returned ${warrenNolanResponse.status}`);
      }

      // Parse both HTMLs
      const warrenNolanHTML = await warrenNolanResponse.text();
      const apPollHTML = apPollResponse.ok ? await apPollResponse.text() : '';

      // Get standings from WarrenNolan
      const standings = parseWarrenNolanTable(warrenNolanHTML);

      if (!standings || standings.length === 0) {
        throw new Error('No standings data found');
      }

      // Get AP rankings from NCAA
      const apRankings = parseAPPoll(apPollHTML);

      // Merge AP rankings into standings
      for (const team of standings) {
        const apRank = apRankings[team.team];
        if (apRank) {
          team.apRank = apRank;
        }
      }

      // Return JSON with CORS
      return new Response(JSON.stringify({ standings }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300', // 5 min cache
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
          timestamp: new Date().toISOString(),
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
 * Parse WarrenNolan conference standings table
 * Table columns: Rank | Team | Conf Record | Conf Win% | GB | Overall Record | Overall Win% | NET | Q1
 */
function parseWarrenNolanTable(html) {
  const standings = [];

  try {
    // Find all tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const tables = html.match(tableRegex);

    if (!tables || tables.length === 0) {
      throw new Error('No tables found');
    }

    // Find the table with standings data (contains "Conference" headers)
    let standingsTable = null;
    for (const table of tables) {
      // Look for table with records (W-L format) and multiple rows
      if (table.includes('-') && (table.match(/<tr/gi) || []).length > 5) {
        standingsTable = table;
        break;
      }
    }

    if (!standingsTable) {
      throw new Error('Could not find standings table');
    }

    // Extract rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = [...standingsTable.matchAll(rowRegex)];

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const rowHTML = rows[i][1];

      // Skip header rows
      if (rowHTML.includes('<th')) continue;

      // Extract all cells
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [...rowHTML.matchAll(cellRegex)].map(m =>
        stripHTML(m[1]).trim()
      );

      // Need at least 8 columns
      if (cells.length < 8) continue;

      // Parse based on column positions
      // Column 0: Rank (position number)
      // Column 1: Team name
      // Column 2: Conference record (W-L)
      // Column 3: Conference Win %
      // Column 4: Games Back
      // Column 5: Overall record (W-L)
      // Column 6: Overall Win %
      // Column 7: NET rank
      // Column 8+: Q1, etc.

      const teamName = cells[1]?.trim();
      const confRecord = cells[2]?.trim();
      const ovrRecord = cells[5]?.trim();
      const netRankStr = cells[7]?.trim();

      if (!teamName || !confRecord || !ovrRecord) continue;

      // Parse records
      const confMatch = confRecord.match(/(\d+)-(\d+)/);
      const ovrMatch = ovrRecord.match(/(\d+)-(\d+)/);

      const confWins = confMatch ? parseInt(confMatch[1], 10) : 0;
      const confLosses = confMatch ? parseInt(confMatch[2], 10) : 0;
      const overallWins = ovrMatch ? parseInt(ovrMatch[1], 10) : 0;
      const overallLosses = ovrMatch ? parseInt(ovrMatch[2], 10) : 0;

      // Parse NET rank (might be empty or have special chars)
      let netRank = null;
      if (netRankStr && /^\d+$/.test(netRankStr)) {
        netRank = parseInt(netRankStr, 10);
      }

      standings.push({
        team: teamName.toUpperCase(),
        conf: confRecord,
        ovr: ovrRecord,
        apRank: 999, // Will be filled in from NCAA data
        netRank,
        wins: overallWins,
        losses: overallLosses,
        confWins,
        confLosses,
      });
    }
  } catch (error) {
    throw new Error(`Parse error: ${error.message}`);
  }

  return standings;
}

/**
 * Parse AP Poll from NCAA.com
 * Returns object mapping team name to AP rank
 */
function parseAPPoll(html) {
  const rankings = {};

  if (!html) return rankings;

  try {
    // Find the rankings table
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const tables = html.match(tableRegex);

    if (!tables || tables.length === 0) {
      return rankings;
    }

    // Use first table (AP Poll)
    const pollTable = tables[0];

    // Extract rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows = [...pollTable.matchAll(rowRegex)];

    // Process each row
    for (let i = 1; i < rows.length; i++) {
      const rowHTML = rows[i][1];

      // Skip header rows
      if (rowHTML.includes('<th')) continue;

      // Extract cells
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [...rowHTML.matchAll(cellRegex)].map(m =>
        stripHTML(m[1]).trim()
      );

      if (cells.length < 2) continue;

      // First cell is rank, second is team name
      const rank = parseInt(cells[0], 10);
      let teamName = cells[1];

      // Clean team name (remove record, points, etc)
      // Example: "Nebraska (18-0)" -> "Nebraska"
      teamName = teamName
        .replace(/\([^)]*\)/g, '') // Remove parentheses content
        .replace(/\d+-\d+/g, '') // Remove records
        .trim();

      // Normalize team names to match WarrenNolan
      teamName = normalizeTeamName(teamName);

      if (rank && teamName) {
        rankings[teamName] = rank;
      }
    }
  } catch (error) {
    console.error('Error parsing AP Poll:', error);
  }

  return rankings;
}

/**
 * Normalize team names to match between sources
 */
function normalizeTeamName(name) {
  const normalized = name.toUpperCase().trim();

  // Handle common variations
  const mapping = {
    'MICHIGAN ST': 'MICHIGAN STATE',
    'MICHIGAN ST.': 'MICHIGAN STATE',
    'OHIO ST': 'OHIO STATE',
    'OHIO ST.': 'OHIO STATE',
    'PENN ST': 'PENN STATE',
    'PENN ST.': 'PENN STATE',
  };

  return mapping[normalized] || normalized;
}

/**
 * Remove HTML tags and decode entities
 */
function stripHTML(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
