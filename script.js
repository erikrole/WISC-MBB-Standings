// =====================
// CONFIG
// =====================

// Data source: set USE_WORKER to true after deploying Cloudflare Worker
const USE_WORKER = true; // Change to true after worker deployment

// Cloudflare Worker URL (update this after deploying worker)
const WORKER_URL = "https://big-ten-standings.erikrole.workers.dev";

// Fallback: Google Sheets CSV
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1bOdPDPKf1QHUyayNgDToaCtu3k6_-bccnWLNqpyayvQ/export?format=csv&gid=1204601349";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const NO_RANK_VALUE = 999;
const STALE_DATA_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes max backoff
const POSITION_CHANGE_DURATION_MS = 5000; // Highlight changes for 5 seconds

// =====================
// STATE
// =====================
let wakeLock = null;
let lastSuccessfulUpdate = null;
let previousStandings = new Map(); // team -> position
let retryCount = 0;
let refreshTimer = null;

// =====================
// CSV PARSING
// =====================
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
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
const toDash = str => (str && str.trim()) || "";

function parseRecord(str) {
  const clean = (str || "").replace(/[–—−]/g, "-");
  const [wRaw, lRaw] = clean.split("-");
  const wins = parseInt(wRaw, 10) || 0;
  const losses = parseInt(lRaw, 10) || 0;
  return { wins, losses };
}

function calculateWinPercentage(wins, losses) {
  const total = wins + losses;
  return total === 0 ? 0 : wins / total;
}

function compareTeams(a, b) {
  // 1) Conference winning percentage (higher first)
  if (b.confPct !== a.confPct) return b.confPct - a.confPct;

  // 2) Conference wins (more wins first)
  if (b.confWins !== a.confWins) return b.confWins - a.confWins;

  // 3) Conference losses (fewer losses first, when wins are tied)
  if (a.confLosses !== b.confLosses) return a.confLosses - b.confLosses;

  // 4) Overall winning percentage (higher first)
  if (b.pct !== a.pct) return b.pct - a.pct;

  // 5) Overall total wins (more wins first)
  if (b.wins !== a.wins) return b.wins - a.wins;

  // 6) Wisconsin bump among identical records
  if (a.isWisconsin && !b.isWisconsin) return -1;
  if (b.isWisconsin && !a.isWisconsin) return 1;

  // 7) AP ranking: ranked teams first, then lower number is better
  const aRanked = a.apRank < NO_RANK_VALUE;
  const bRanked = b.apRank < NO_RANK_VALUE;

  if (aRanked && !bRanked) return -1;
  if (bRanked && !aRanked) return 1;

  if (aRanked && bRanked && a.apRank !== b.apRank) {
    return a.apRank - b.apRank;
  }

  // 8) NET ranking: lower is better
  const aHasNet = a.netRank != null;
  const bHasNet = b.netRank != null;

  if (aHasNet && !bHasNet) return -1;
  if (bHasNet && !aHasNet) return 1;

  if (aHasNet && bHasNet && a.netRank !== b.netRank) {
    return a.netRank - b.netRank; // Lower NET rank is better
  }

  // 9) Alphabetical fallback (if all else is equal)
  return a.team.localeCompare(b.team);
}

function showError(message) {
  const tableEl = document.getElementById("table");
  if (tableEl) {
    tableEl.innerHTML = `<div class="error-message">${message}</div>`;
  }
}

function setLoadingState(isLoading) {
  const loadingEl = document.getElementById("loading-indicator");
  if (loadingEl) {
    loadingEl.style.display = isLoading ? "block" : "none";
  }
}

function updateConnectionStatus(isOnline) {
  const statusEl = document.getElementById("connection-status");
  if (statusEl) {
    statusEl.className = `connection-status ${isOnline ? "online" : "offline"}`;
    statusEl.textContent = isOnline ? "●" : "○";
    statusEl.title = isOnline ? "Connected" : "Offline";
  }
}

function updateDataSourceIndicator(isWorker) {
  const sourceEl = document.getElementById("data-source");
  if (sourceEl) {
    sourceEl.className = `data-source ${isWorker ? "worker" : "csv"}`;
    sourceEl.title = isWorker ? "Connected" : "CSV";
  }
}

function updateTimestamp() {
  const ts = document.getElementById("timestamp");
  if (!ts) return;

  if (!lastSuccessfulUpdate) {
    ts.textContent = "Waiting for data...";
    ts.className = "timestamp";
    return;
  }

  const now = Date.now();
  const timeSinceUpdate = now - lastSuccessfulUpdate;
  const isStale = timeSinceUpdate > STALE_DATA_THRESHOLD_MS;

  const updateDate = new Date(lastSuccessfulUpdate);

  // Format as relative date
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
    datePrefix = "today";
  } else if (isYesterday) {
    datePrefix = "yesterday";
  } else {
    datePrefix = updateDate.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric'
    });
  }

  ts.textContent = `Last updated ${datePrefix} at ${timeString}`;
  ts.className = isStale ? "timestamp stale" : "timestamp";
}

async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("Wake lock acquired");

      wakeLock.addEventListener("release", () => {
        console.log("Wake lock released");
      });
    } catch (err) {
      console.error("Wake lock error:", err);
    }
  }
}

function calculateRetryDelay() {
  const baseDelay = 1000; // 1 second
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
  return delay;
}

function createTeamRow(rowData, index) {
  const { team, conf, ovr, apRank, netRank, isWisconsin } = rowData;
  const currentPosition = index + 1;

  const row = document.createElement("div");
  row.className = "row";
  if (isWisconsin) row.classList.add("wisconsin");
  row.dataset.team = team;

  // Check if position changed
  const previousPosition = previousStandings.get(team);
  if (previousPosition !== undefined && previousPosition !== currentPosition) {
    const positionChange = previousPosition - currentPosition;
    row.classList.add("position-changed");

    if (positionChange > 0) {
      row.classList.add("moved-up");
      row.dataset.change = `↑${positionChange}`;
    } else {
      row.classList.add("moved-down");
      row.dataset.change = `↓${Math.abs(positionChange)}`;
    }

    // Remove highlight after duration
    setTimeout(() => {
      row.classList.remove("position-changed", "moved-up", "moved-down");
      delete row.dataset.change;
    }, POSITION_CHANGE_DURATION_MS);
  }

  row.innerHTML = `
    <div class="rank">${currentPosition}.</div>
    <div class="team-cell">
      ${apRank < NO_RANK_VALUE ? `<span class="ap-rank">${apRank}</span>` : ""}
      <span class="team-name">${team}</span>
      ${netRank ? `<span class="net-rank">NET ${netRank}</span>` : ""}
      ${row.dataset.change ? `<span class="position-change-indicator">${row.dataset.change}</span>` : ""}
    </div>
    <div class="conf">${conf}</div>
    <div class="ovr">${ovr}</div>
  `;

  return row;
}

// =====================
// DOM DIFFING HELPERS
// =====================
function updateTable(newTeamRows) {
  const tableEl = document.getElementById("table");
  const existingRows = Array.from(tableEl.querySelectorAll('.row'));

  newTeamRows.forEach((rowData, index) => {
    const existingRow = existingRows[index];

    if (!existingRow) {
      // New row - append
      tableEl.appendChild(createTeamRow(rowData, index));
    } else if (needsUpdate(existingRow, rowData, index)) {
      // Replace row if data changed
      const newRow = createTeamRow(rowData, index);
      tableEl.replaceChild(newRow, existingRow);
    }
    // else: no change, keep existing DOM
  });

  // Remove excess rows if teams were removed
  while (existingRows.length > newTeamRows.length) {
    tableEl.removeChild(existingRows[existingRows.length - 1]);
    existingRows.pop();
  }
}

function needsUpdate(row, newData, newIndex) {
  // Check if any displayed values changed
  const confCell = row.querySelector('.conf');
  const ovrCell = row.querySelector('.ovr');
  const rankCell = row.querySelector('.rank');
  const apRankSpan = row.querySelector('.ap-rank');
  const netRankSpan = row.querySelector('.net-rank');

  const currentApRank = apRankSpan ? apRankSpan.textContent : '';
  const expectedApRank = newData.apRank < NO_RANK_VALUE ? String(newData.apRank) : '';

  const currentNetRank = netRankSpan ? netRankSpan.textContent : '';
  const expectedNetRank = newData.netRank ? `NET ${newData.netRank}` : '';

  return (
    row.dataset.team !== newData.team ||
    confCell?.textContent !== newData.conf ||
    ovrCell?.textContent !== newData.ovr ||
    rankCell?.textContent !== `${newIndex + 1}.` ||
    currentApRank !== expectedApRank ||
    currentNetRank !== expectedNetRank
  );
}

// =====================
// MAIN LOAD FUNCTION
// =====================
async function loadStandings() {
  setLoadingState(true);

  try {
    let teamRows;

    if (USE_WORKER) {
      // ===== CLOUDFLARE WORKER MODE =====
      console.log("Fetching from Cloudflare Worker...");
      const res = await fetch(`${WORKER_URL}?t=${Date.now()}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Worker error: ${res.status}`);
      }

      const data = await res.json();

      if (!data.standings || data.standings.length === 0) {
        throw new Error("No standings data from worker");
      }

      // Worker returns data in the right format, just add calculated fields
      teamRows = data.standings.map(team => ({
        ...team,
        pct: calculateWinPercentage(team.wins, team.losses),
        confPct: calculateWinPercentage(team.confWins, team.confLosses),
        isWisconsin: team.team === "WISCONSIN",
      }));

      console.log(`✓ Loaded ${teamRows.length} teams from Worker`);

    } else {
      // ===== GOOGLE SHEETS CSV MODE (Fallback) =====
      console.log("Fetching from Google Sheets CSV...");
      const res = await fetch(`${CSV_URL}&t=${Date.now()}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`CSV error: ${res.status}`);
      }

      const text = await res.text();
      const { headers, rows } = parseCSV(text);

      // Map header names to column indexes
      const headerToIndex = Object.fromEntries(
        headers.map((h, idx) => [h.trim().toUpperCase(), idx])
      );

      const TEAM_COL   = headerToIndex["TEAM"];
      const CONF_COL   = headerToIndex["CONF"];
      const OVR_COL    = headerToIndex["OVR"];
      const AP_COL     = headerToIndex["RANK"];
      const WINS_COL   = headerToIndex["WINS"];
      const LOSSES_COL = headerToIndex["LOSSES"];

      // Basic validation
      if (
        TEAM_COL == null ||
        CONF_COL == null ||
        OVR_COL == null ||
        WINS_COL == null ||
        LOSSES_COL == null
      ) {
        console.error("Missing required columns:", headers);
        showError("Missing columns in sheet");
        return;
      }

      // Build team objects from CSV rows
      teamRows = rows
        .map((cols, originalIndex) => {
          if (!cols.length) return null;

          const teamRaw = (cols[TEAM_COL] || "").trim();
          if (!teamRaw) return null;

          const team = teamRaw.toUpperCase();
          const confStr = toDash(cols[CONF_COL]);
          const { wins: confWins, losses: confLosses } = parseRecord(confStr);
          const confPct = calculateWinPercentage(confWins, confLosses);
          const ovr  = toDash(cols[OVR_COL]);
          const apRaw = AP_COL != null ? String(cols[AP_COL] || "").trim() : "";
          const apRank = apRaw ? parseInt(apRaw, 10) || NO_RANK_VALUE : NO_RANK_VALUE;

          const wins = parseInt(cols[WINS_COL] || "0", 10);
          const losses = parseInt(cols[LOSSES_COL] || "0", 10);
          const pct = calculateWinPercentage(wins, losses);

          return {
            team,
            conf: confStr,
            ovr,
            apRank,
            wins,
            losses,
            pct,
            confWins,
            confLosses,
            confPct,
            isWisconsin: team === "WISCONSIN",
            originalIndex
          };
        })
        .filter(Boolean);

      console.log(`✓ Loaded ${teamRows.length} teams from CSV`);
    }

    // ===== COMMON: SORT AND RENDER =====
    teamRows.sort(compareTeams);

    // ---- Render ----
    updateTable(teamRows);

    // Update standings tracking for next comparison
    previousStandings.clear();
    teamRows.forEach((rowData, index) => {
      previousStandings.set(rowData.team, index + 1);
    });

    // Update timestamp and reset retry count on success
    lastSuccessfulUpdate = Date.now();
    retryCount = 0;
    updateTimestamp();
    updateConnectionStatus(true);
    updateDataSourceIndicator(USE_WORKER);
    setLoadingState(false);
  } catch (err) {
    console.error("Error loading CSV:", err);
    setLoadingState(false);
    updateConnectionStatus(false);

    // Implement exponential backoff retry
    retryCount++;
    const retryDelay = calculateRetryDelay();
    console.log(`Retrying in ${retryDelay}ms (attempt ${retryCount})`);

    setTimeout(() => {
      loadStandings();
    }, retryDelay);

    // Only show error if we don't have previous data
    if (!lastSuccessfulUpdate) {
      showError("Error loading data - retrying...");
    }
  }
}

function scheduleNextRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    loadStandings();
    scheduleNextRefresh();
  }, REFRESH_INTERVAL_MS);
}

// =====================
// INIT + AUTO REFRESH
// =====================

// Request wake lock to keep screen on
requestWakeLock();

// Re-acquire wake lock when visibility changes
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && wakeLock === null) {
    await requestWakeLock();
  }
});

// Monitor online/offline status
window.addEventListener("online", () => {
  updateConnectionStatus(true);
  loadStandings();
});

window.addEventListener("offline", () => {
  updateConnectionStatus(false);
});

// Update timestamp display every minute
setInterval(updateTimestamp, 60 * 1000);

// Set initial data source indicator
updateDataSourceIndicator(USE_WORKER);

// Initial load and scheduled refreshes
loadStandings();
scheduleNextRefresh();
