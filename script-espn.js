// =====================
// CONFIG
// =====================
const CONFIG = {
  // Data source: 'espn' or 'csv'
  dataSource: 'espn',

  // ESPN API via Cloudflare Worker (update this after deploying worker)
  espnApiUrl: 'https://big-ten-standings.YOUR-ACCOUNT.workers.dev',

  // Fallback: Google Sheets CSV
  csvUrl: 'https://docs.google.com/spreadsheets/d/1bOdPDPKf1QHUyayNgDToaCtu3k6_-bccnWLNqpyayvQ/export?format=csv&gid=1204601349',

  refreshIntervalMs: 15 * 60 * 1000, // 15 minutes
  staleDataThresholdMs: 30 * 60 * 1000, // 30 minutes
  maxRetryDelayMs: 5 * 60 * 1000, // 5 minutes
  positionChangeDurationMs: 5000, // 5 seconds
  noRankValue: 999,
};

// =====================
// STATE
// =====================
const state = {
  wakeLock: null,
  lastSuccessfulUpdate: null,
  previousStandings: new Map(),
  retryCount: 0,
  refreshTimer: null,
};

// =====================
// DATA PARSERS
// =====================

/**
 * Parse ESPN API response
 */
function parseESPNData(data) {
  const teams = [];

  try {
    // ESPN API structure varies, but typically:
    // data.children[0].standings.entries[] contains team data
    const entries = data?.children?.[0]?.standings?.entries || [];

    for (const entry of entries) {
      const team = entry.team;
      if (!team) continue;

      const teamName = (team.displayName || team.name || team.shortDisplayName || '').toUpperCase();
      if (!teamName) continue;

      // Stats array: [0] = conference record, [1] = overall record
      const stats = entry.stats || [];

      // Conference record (typically index 0-2)
      const confWins = parseInt(stats.find(s => s.name === 'wins' || s.displayName === 'CONF')?.value || '0', 10);
      const confLosses = parseInt(stats.find(s => s.name === 'losses')?.value || '0', 10);
      const confStr = `${confWins}-${confLosses}`;

      // Overall record
      let overallWins = confWins;
      let overallLosses = confLosses;

      // Look for overall stats
      stats.forEach(stat => {
        if (stat.type === 'total') {
          overallWins = parseInt(stat.wins || stat.value || '0', 10);
          overallLosses = parseInt(stat.losses || '0', 10);
        }
      });

      const ovrStr = `${overallWins}-${overallLosses}`;

      // AP Rank (if available)
      let apRank = CONFIG.noRankValue;
      if (team.rank) {
        apRank = parseInt(team.rank, 10) || CONFIG.noRankValue;
      }

      teams.push({
        team: teamName,
        conf: confStr,
        ovr: ovrStr,
        apRank,
        wins: overallWins,
        losses: overallLosses,
        confWins,
        confLosses,
        pct: calculateWinPercentage(overallWins, overallLosses),
        confPct: calculateWinPercentage(confWins, confLosses),
        isWisconsin: teamName === 'WISCONSIN',
      });
    }
  } catch (error) {
    console.error('Error parsing ESPN data:', error);
    throw new Error('Failed to parse ESPN data structure');
  }

  return teams;
}

/**
 * Parse CSV data (legacy fallback)
 */
function parseCSVData(text) {
  const { headers, rows } = parseCSV(text);

  const headerToIndex = Object.fromEntries(
    headers.map((h, idx) => [h.trim().toUpperCase(), idx])
  );

  const TEAM_COL = headerToIndex['TEAM'];
  const CONF_COL = headerToIndex['CONF'];
  const OVR_COL = headerToIndex['OVR'];
  const AP_COL = headerToIndex['RANK'];
  const WINS_COL = headerToIndex['WINS'];
  const LOSSES_COL = headerToIndex['LOSSES'];

  if (
    TEAM_COL == null ||
    CONF_COL == null ||
    OVR_COL == null ||
    WINS_COL == null ||
    LOSSES_COL == null
  ) {
    throw new Error('Missing required columns in CSV');
  }

  return rows
    .map(cols => {
      if (!cols.length) return null;

      const teamRaw = (cols[TEAM_COL] || '').trim();
      if (!teamRaw) return null;

      const team = teamRaw.toUpperCase();
      const confStr = cols[CONF_COL]?.trim() || '';
      const { wins: confWins, losses: confLosses } = parseRecord(confStr);
      const ovrStr = cols[OVR_COL]?.trim() || '';
      const apRaw = AP_COL != null ? String(cols[AP_COL] || '').trim() : '';
      const apRank = apRaw ? parseInt(apRaw, 10) || CONFIG.noRankValue : CONFIG.noRankValue;

      const wins = parseInt(cols[WINS_COL] || '0', 10);
      const losses = parseInt(cols[LOSSES_COL] || '0', 10);

      return {
        team,
        conf: confStr,
        ovr: ovrStr,
        apRank,
        wins,
        losses,
        pct: calculateWinPercentage(wins, losses),
        confWins,
        confLosses,
        confPct: calculateWinPercentage(confWins, confLosses),
        isWisconsin: team === 'WISCONSIN',
      };
    })
    .filter(Boolean);
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });

  return { headers, rows };
}

// =====================
// UTILITIES
// =====================

function parseRecord(str) {
  const clean = (str || '').replace(/[–—−]/g, '-');
  const [wRaw, lRaw] = clean.split('-');
  const wins = parseInt(wRaw, 10) || 0;
  const losses = parseInt(lRaw, 10) || 0;
  return { wins, losses };
}

function calculateWinPercentage(wins, losses) {
  const total = wins + losses;
  return total === 0 ? 0 : wins / total;
}

function compareTeams(a, b) {
  // Conference standing hierarchy
  if (b.confPct !== a.confPct) return b.confPct - a.confPct;
  if (b.confWins !== a.confWins) return b.confWins - a.confWins;
  if (a.confLosses !== b.confLosses) return a.confLosses - b.confLosses;

  // Overall record tiebreakers
  if (b.pct !== a.pct) return b.pct - a.pct;
  if (b.wins !== a.wins) return b.wins - a.wins;

  // Wisconsin tie-breaker
  if (a.isWisconsin && !b.isWisconsin) return -1;
  if (b.isWisconsin && !a.isWisconsin) return 1;

  // AP ranking tiebreaker
  const aRanked = a.apRank < CONFIG.noRankValue;
  const bRanked = b.apRank < CONFIG.noRankValue;

  if (aRanked && !bRanked) return -1;
  if (bRanked && !aRanked) return 1;
  if (aRanked && bRanked && a.apRank !== b.apRank) {
    return a.apRank - b.apRank;
  }

  // Alphabetical fallback
  return a.team.localeCompare(b.team);
}

// =====================
// UI UPDATES
// =====================

function showError(message) {
  const tableEl = document.getElementById('table');
  if (tableEl) {
    tableEl.innerHTML = `<div class="error-message">${message}</div>`;
  }
}

function setLoadingState(isLoading) {
  const loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) {
    loadingEl.style.display = isLoading ? 'block' : 'none';
  }
}

function updateConnectionStatus(isOnline) {
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.className = `connection-status ${isOnline ? 'online' : 'offline'}`;
    statusEl.textContent = isOnline ? '●' : '○';
    statusEl.title = isOnline ? 'Connected' : 'Offline';
  }
}

function updateTimestamp() {
  const ts = document.getElementById('timestamp');
  if (!ts) return;

  if (!state.lastSuccessfulUpdate) {
    ts.textContent = 'Waiting for data...';
    ts.className = 'timestamp';
    return;
  }

  const now = Date.now();
  const timeSinceUpdate = now - state.lastSuccessfulUpdate;
  const isStale = timeSinceUpdate > CONFIG.staleDataThresholdMs;

  const updateDate = new Date(state.lastSuccessfulUpdate);
  const nowDate = new Date(now);
  const isToday = updateDate.toDateString() === nowDate.toDateString();
  const isYesterday = new Date(now - 86400000).toDateString() === updateDate.toDateString();

  const timeString = updateDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  let datePrefix;
  if (isToday) {
    datePrefix = 'Today';
  } else if (isYesterday) {
    datePrefix = 'Yesterday';
  } else {
    datePrefix = updateDate.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric'
    });
  }

  ts.textContent = `Last updated ${datePrefix} at ${timeString}`;
  ts.className = isStale ? 'timestamp stale' : 'timestamp';
}

function createTeamRow(rowData, index) {
  const { team, conf, ovr, apRank, isWisconsin } = rowData;
  const currentPosition = index + 1;

  const row = document.createElement('div');
  row.className = 'row';
  if (isWisconsin) row.classList.add('wisconsin');
  row.dataset.team = team;

  // Position change tracking
  const previousPosition = state.previousStandings.get(team);
  if (previousPosition !== undefined && previousPosition !== currentPosition) {
    const positionChange = previousPosition - currentPosition;
    row.classList.add('position-changed');

    if (positionChange > 0) {
      row.classList.add('moved-up');
      row.dataset.change = `↑${positionChange}`;
    } else {
      row.classList.add('moved-down');
      row.dataset.change = `↓${Math.abs(positionChange)}`;
    }

    setTimeout(() => {
      row.classList.remove('position-changed', 'moved-up', 'moved-down');
      delete row.dataset.change;
    }, CONFIG.positionChangeDurationMs);
  }

  row.innerHTML = `
    <div class="rank">${currentPosition}.</div>
    <div class="team-cell">
      ${apRank < CONFIG.noRankValue ? `<span class="ap-rank">${apRank}</span>` : ''}
      <span class="team-name">${team}</span>
      ${row.dataset.change ? `<span class="position-change-indicator">${row.dataset.change}</span>` : ''}
    </div>
    <div class="conf">${conf}</div>
    <div class="ovr">${ovr}</div>
  `;

  return row;
}

function renderStandings(teams) {
  const tableEl = document.getElementById('table');
  tableEl.innerHTML = '';

  const fragment = document.createDocumentFragment();
  teams.forEach((team, index) => {
    fragment.appendChild(createTeamRow(team, index));
  });
  tableEl.appendChild(fragment);

  // Update position tracking
  state.previousStandings.clear();
  teams.forEach((team, index) => {
    state.previousStandings.set(team.team, index + 1);
  });
}

// =====================
// DATA LOADING
// =====================

async function loadStandings() {
  setLoadingState(true);

  try {
    let teams;

    if (CONFIG.dataSource === 'espn') {
      // Fetch from ESPN API (via Cloudflare Worker)
      const response = await fetch(`${CONFIG.espnApiUrl}?t=${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }

      const data = await response.json();
      teams = parseESPNData(data);
    } else {
      // Fallback to CSV
      const response = await fetch(`${CONFIG.csvUrl}&t=${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`CSV error: ${response.status}`);
      }

      const text = await response.text();
      teams = parseCSVData(text);
    }

    if (teams.length === 0) {
      throw new Error('No team data found');
    }

    // Sort and render
    teams.sort(compareTeams);
    renderStandings(teams);

    // Update state
    state.lastSuccessfulUpdate = Date.now();
    state.retryCount = 0;
    updateTimestamp();
    updateConnectionStatus(true);
    setLoadingState(false);

    console.log(`✓ Loaded ${teams.length} teams from ${CONFIG.dataSource}`);
  } catch (error) {
    console.error('Error loading standings:', error);
    setLoadingState(false);
    updateConnectionStatus(false);

    // Exponential backoff retry
    state.retryCount++;
    const retryDelay = Math.min(
      1000 * Math.pow(2, state.retryCount),
      CONFIG.maxRetryDelayMs
    );

    console.log(`Retrying in ${retryDelay}ms (attempt ${state.retryCount})`);

    setTimeout(loadStandings, retryDelay);

    if (!state.lastSuccessfulUpdate) {
      showError('Error loading data - retrying...');
    }
  }
}

function scheduleNextRefresh() {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
  }

  state.refreshTimer = setTimeout(() => {
    loadStandings();
    scheduleNextRefresh();
  }, CONFIG.refreshIntervalMs);
}

// =====================
// WAKE LOCK
// =====================

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock acquired');

      state.wakeLock.addEventListener('release', () => {
        console.log('Wake lock released');
      });
    } catch (err) {
      console.error('Wake lock error:', err);
    }
  }
}

// =====================
// INITIALIZATION
// =====================

// Request wake lock
requestWakeLock();

// Re-acquire wake lock when visibility changes
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.wakeLock === null) {
    await requestWakeLock();
  }
});

// Monitor online/offline status
window.addEventListener('online', () => {
  updateConnectionStatus(true);
  loadStandings();
});

window.addEventListener('offline', () => {
  updateConnectionStatus(false);
});

// Update timestamp every minute
setInterval(updateTimestamp, 60 * 1000);

// Initial load and schedule refreshes
loadStandings();
scheduleNextRefresh();

console.log(`Big Ten Standings Display initialized (${CONFIG.dataSource} mode)`);
