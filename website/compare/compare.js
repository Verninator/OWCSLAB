const teamAInput = document.getElementById('teamA');
const teamBInput = document.getElementById('teamB');
const teamASuggestions = document.getElementById('teamA-suggestions');
const teamBSuggestions = document.getElementById('teamB-suggestions');
const compareButton = document.getElementById('compareButton');
const compareResults = document.getElementById('compareResults');

let teams = [];
let selectedTeamAId = '';
let selectedTeamBId = '';
let currentMapView = 'map';
let currentBanView = 'hero';
let mapSectionCollapsed = false;
let heroSectionCollapsed = false;
let lastComparisonData = null;
let tournamentOptions = [];
let selectedTournamentIds = [];
let tournamentMode = 'include';

function capitalizeFirstLetter(val) {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

function closeSuggestions() {
    teamASuggestions.innerHTML = '';
    teamBSuggestions.innerHTML = '';
}

function findTeamIdByName(name) {
    const normalized = String(name || '').trim().toLowerCase();
    const team = teams.find(t => t.team_name.trim().toLowerCase() === normalized);
    return team ? team.team_id : '';
}

function setTeamSelection(teamType, teamName, teamId) {
    if (teamType === 'A') {
        teamAInput.value = teamName;
        selectedTeamAId = teamId;
    } else {
        teamBInput.value = teamName;
        selectedTeamBId = teamId;
    }
    closeSuggestions();
}

function renderSuggestions(target, query, teamType) {
    const queryValue = String(query || '').trim().toLowerCase();
    const matches = teams
        .filter(team => team.team_name.toLowerCase().includes(queryValue))
        .slice(0, 12);

    target.innerHTML = matches
        .map(team => `
            <button type="button" class="team-suggestion-item" data-team-id="${team.team_id}" data-team-name="${team.team_name}" data-team-type="${teamType}">
                ${team.team_name}
            </button>
        `)
        .join('');
}

function attachSearchHandlers(input, suggestions, teamType) {
    input.addEventListener('input', () => {
        if (!input.value.trim()) {
            selectedTeamAId = teamType === 'A' ? '' : selectedTeamAId;
            selectedTeamBId = teamType === 'B' ? '' : selectedTeamBId;
            suggestions.innerHTML = '';
            return;
        }

        if (teamType === 'A') selectedTeamAId = '';
        if (teamType === 'B') selectedTeamBId = '';
        renderSuggestions(suggestions, input.value, teamType);
    });

    input.addEventListener('focus', () => {
        if (input.value.trim()) {
            renderSuggestions(suggestions, input.value, teamType);
        }
    });

    suggestions.addEventListener('click', event => {
        const button = event.target.closest('button.team-suggestion-item');
        if (!button) return;
        const teamId = button.dataset.teamId;
        const teamName = button.dataset.teamName;
        setTeamSelection(teamType, teamName, teamId);
    });
}

function buildTournamentQuery() {
  const params = new URLSearchParams({
    tournaments: selectedTournamentIds.join(','),
    tournamentMode
  });
  return params.toString();
}

function renderTournamentFilters() {
  const container = document.getElementById('tournamentFilterOptions');
  const modeSelect = document.getElementById('tournamentMode');
  if (!container) return;
  container.innerHTML = '';

  if (!tournamentOptions.length) {
    container.innerHTML = '<div class="empty-chart-message">No tournament options available</div>';
    return;
  }

  const optionsMarkup = tournamentOptions.map(tournament => {
    const checked = selectedTournamentIds.includes(tournament.tournament_id);
    return `
      <label class="filter-option ${checked ? 'is-active' : ''}">
        <input type="checkbox" value="${tournament.tournament_id}" ${checked ? 'checked' : ''}>
        <span>${tournament.name}</span>
      </label>
    `;
  }).join('');

  container.innerHTML = optionsMarkup;
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', handleTournamentFilterChange);
  });

  if (modeSelect) {
    modeSelect.value = tournamentMode;
    modeSelect.onchange = () => {
      tournamentMode = modeSelect.value;
      if (selectedTeamAId && selectedTeamBId) {
        compareTeams();
      }
    };
  }
}

function handleTournamentFilterChange(event) {
  const { value, checked } = event.target;
  const tournamentId = Number(value);
  if (checked) {
    if (!selectedTournamentIds.includes(tournamentId)) {
      selectedTournamentIds.push(tournamentId);
    }
  } else {
    selectedTournamentIds = selectedTournamentIds.filter(id => id !== tournamentId);
  }
  renderTournamentFilters();
  if (selectedTeamAId && selectedTeamBId) {
    compareTeams();
  }
}

function setFilterPanelOpen(isOpen) {
  const panel = document.getElementById('filterPanel');
  const toggle = document.getElementById('filterToggle');
  if (!panel || !toggle) return;
  panel.classList.toggle('is-open', isOpen);
  panel.classList.toggle('is-collapsed', !isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.textContent = isOpen ? 'Close filters' : 'Filter tournaments';
}

function toggleFilterPanel(event) {
  if (event) {
    event.stopPropagation();
  }
  const panel = document.getElementById('filterPanel');
  if (!panel) return;
  setFilterPanelOpen(!panel.classList.contains('is-open'));
}

async function loadTournamentOptions() {
  try {
    const response = await fetch('/api/tournaments');
    const data = await response.json();
    tournamentOptions = Array.isArray(data) ? data : [];
    renderTournamentFilters();
  } catch (error) {
    console.warn('Failed to load tournament options', error);
  }
}

function buildHeroIconPath(icon) {
    if (!icon) return '/content/images/heroes/default.png';
    return icon.startsWith('/') ? icon : `/content/${icon}`;
}

function buildTeamIconPath(icon) {
    if (!icon) return '/content/images/teams/default.png';
    return icon.startsWith('/') ? icon : `/${icon}`;
}

function buildAssetPath(path) {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function getRoleIconPath(role) {
  const normalizedRole = String(role || '').trim();
  if (!normalizedRole) return '';

  if (normalizedRole.toLowerCase() === 'dps') {
    return '/content/images/roles/DPS.webp';
  }

  const titleCaseRole = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1).toLowerCase();
  return `/content/images/roles/${encodeURIComponent(titleCaseRole)}.webp`;
}

function getModeIconPath(mode) {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!normalizedMode) return '';

  const supportedModes = new Set(['control', 'escort', 'flashpoint', 'hybrid', 'push', 'clash']);
  if (!supportedModes.has(normalizedMode)) {
    return '';
  }

  return `/content/images/maps/modes/${encodeURIComponent(normalizedMode)}.webp`;
}

function normalizeHexColor(color) {
  const value = String(color || '').trim();
  if (!value.startsWith('#')) return '';

  const hex = value.slice(1);
  if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split('').map(ch => ch + ch).join('')}`;
  }

  if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return '';
}

function getReadableTextColor(backgroundColor) {
  const normalized = normalizeHexColor(backgroundColor);
  if (!normalized) {
    return '#ffffff';
  }

  const hex = normalized.slice(1);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness >= 160 ? '#0a0e27' : '#f5f9ff';
}

function buildTeamIcon(team, className = 'team-badge-icon') {
  return `<img src="${buildTeamIconPath(team.icon)}" alt="${team.name}" title="${team.name}" class="${className}">`;
}

function buildTeamTitle(team, label) {
  return `${buildTeamIcon(team)} <span>${label}</span>`;
}

function determineWinner(match) {
  if (match.teamA.score > match.teamB.score){
    return match.teamA.name
  } 
  else if (match.teamA.score < match.teamB.score){
    return match.teamB.name
  }
  else{
    return "None"
  }
}

function buildStatsCard(title, stats) {
  return `
    <div class="stats-card">
      <h3>${title}</h3>
      <dl>
        ${Object.entries(stats).map(([key, value]) => `
          <div class="stat-row">
            <dt>${capitalizeFirstLetter(key.replace(/_/g, ' '))}</dt>
            <dd>${value}</dd>
          </div>
        `).join('')}
      </dl>
    </div>
  `;
}

function buildWinnerDisplay(match) {
  if (match.teamA.score > match.teamB.score) {
    return buildTeamIcon(match.teamA, 'table-team-icon');
  }
  if (match.teamA.score < match.teamB.score) {
    return buildTeamIcon(match.teamB, 'table-team-icon');
  }
  return 'Draw';
}

function parseStatValue(value) {
  return Number.parseInt(value, 10) || 0;
}

function formatWinRate(stats) {
  const played = parseStatValue(stats.played);
  const wins = parseStatValue(stats.wins);

  if (!played) {
    return '0%';
  }

  return `${Math.round((wins / played) * 100)}%`;
}

function groupMapsByMode(maps) {
  const grouped = maps.reduce((acc, map) => {
    const mode = map.map_mode || 'Unknown';
    if (!acc[mode]) {
      acc[mode] = {
        map_name: mode,
        map_icon: '',
        map_mode: mode,
        teamA: { played: 0, wins: 0, losses: 0, draws: 0 },
        teamB: { played: 0, wins: 0, losses: 0, draws: 0 }
      };
    }

    acc[mode].teamA.played += parseStatValue(map.teamA.played);
    acc[mode].teamA.wins += parseStatValue(map.teamA.wins);
    acc[mode].teamA.losses += parseStatValue(map.teamA.losses);
    acc[mode].teamA.draws += parseStatValue(map.teamA.draws);
    acc[mode].teamB.played += parseStatValue(map.teamB.played);
    acc[mode].teamB.wins += parseStatValue(map.teamB.wins);
    acc[mode].teamB.losses += parseStatValue(map.teamB.losses);
    acc[mode].teamB.draws += parseStatValue(map.teamB.draws);

    return acc;
  }, {});

  return Object.values(grouped).sort((left, right) => left.map_name.localeCompare(right.map_name));
}

function buildMapComparisonSection(data, teamAColor, teamBColor) {
  const items = currentMapView === 'mode' ? groupMapsByMode(data.maps) : data.maps;
  const mapCards = items.map(item => {
    const useModeIcon = currentMapView === 'mode';
    const teamAWinRate = formatWinRate(item.teamA);
    const teamBWinRate = formatWinRate(item.teamB);
    const mapInitials = String(item.map_name || '?').trim().slice(0, 2).toUpperCase();
    const rawIconPath = useModeIcon ? getModeIconPath(item.map_mode) : item.map_icon;
    const mapIconPath = buildAssetPath(rawIconPath);
    const iconMarkup = useModeIcon && mapIconPath
      ? `<img src="${mapIconPath}" alt="${item.map_name}" class="map-pill-icon" loading="lazy">`
      : '';
    const fallbackBadge = iconMarkup
      ? ''
      : mapIconPath
        ? ''
        : `<div class="map-pill-badge" aria-hidden="true">${mapInitials || '?'}</div>`;
    const mapBackgroundStyle = !useModeIcon && mapIconPath
      ? ` style="--map-pill-bg-image: url('${mapIconPath.replace(/'/g, "%27")}')"`
      : '';
    const teamALine = `<span class="pill-team-line"><span class="pill-team-stat">${buildTeamIcon(data.teamA, 'hover-team-icon')}<span>WR ${teamAWinRate}</span></span><span class="pill-team-separator">|</span><span class="pill-team-stat pill-team-record"><span>${item.teamA.wins}/${item.teamA.losses}/${item.teamA.draws}</span></span></span>`;
    const teamBLine = `<span class="pill-team-line"><span class="pill-team-stat">${buildTeamIcon(data.teamB, 'hover-team-icon')}<span>WR ${teamBWinRate}</span></span><span class="pill-team-separator">|</span><span class="pill-team-stat pill-team-record"><span>${item.teamB.wins}/${item.teamB.losses}/${item.teamB.draws}</span></span></span>`;

    return `
      <div class="map-pill${!useModeIcon && mapIconPath ? ' has-map-background' : ''}"${mapBackgroundStyle}>
        ${iconMarkup}
        ${fallbackBadge}
        <div class="map-pill-content">
          <span>${item.map_name}</span>
          <strong class="pill-team-stats pill-team-stats-stacked">${teamALine}${teamBLine}</strong>
        </div>
      </div>
    `;
  }).join('');
  const mapCollapseLabel = mapSectionCollapsed ? 'Expand' : 'Collapse';
  const mapExpanded = String(!mapSectionCollapsed);

  return `
    <section class="compare-section compare-map-section${mapSectionCollapsed ? ' is-collapsed' : ''}">
      <div class="compare-section-header">
        <h2>Map Results</h2>
        <div class="compare-section-actions">
          <div class="compare-view-toggle" role="group" aria-label="Map results grouping">
            <button type="button" class="compare-view-button ${currentMapView === 'map' ? 'is-active' : ''}" data-map-view="map">Map</button>
            <button type="button" class="compare-view-button ${currentMapView === 'mode' ? 'is-active' : ''}" data-map-view="mode">Mode</button>
          </div>
          <button type="button" class="graph-collapse-toggle" data-map-collapse-toggle aria-expanded="${mapExpanded}" aria-controls="compareMapChart">${mapCollapseLabel}</button>
        </div>
      </div>
      <div class="map-results-chart map-chart" id="compareMapChart">
        <div class="map-pill-grid${currentMapView === 'mode' ? ' is-mode-grid' : ''}">${mapCards}</div>
      </div>
    </section>
  `;
}

function groupCompareBansByRole(items) {
  const grouped = items.reduce((acc, item) => {
    const role = item.hero_role || 'Unknown';
    if (!acc[role]) {
      acc[role] = {
        hero_id: role,
        hero_name: role,
        hero_icon: '',
        hero_role: role,
        teamA: 0,
        teamB: 0
      };
    }

    acc[role].teamA += parseStatValue(item.teamA);
    acc[role].teamB += parseStatValue(item.teamB);
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => (b.teamA + b.teamB) - (a.teamA + a.teamB));
}

function renderComparison(data) {
  lastComparisonData = data;
  const teamASummary = buildStatsCard(buildTeamTitle(data.teamA, 'Totals'), data.teamA.totals);
  const teamBSummary = buildStatsCard(buildTeamTitle(data.teamB, 'Totals'), data.teamB.totals);
  const teamAColor = data.teamA.colour || '#00ff8c';
  const teamBColor = data.teamB.colour || '#00ff8c';
  const teamAIcon = buildTeamIcon(data.teamA, 'head-card-icon');
  const teamBIcon = buildTeamIcon(data.teamB, 'head-card-icon');

  const headToHead = `
    <section class="compare-section">
      <h2>Head to Head</h2>
      <div class="headtohead-grid">
        <div class="head-card">
          <strong>Maps Played</strong>
          <span>${data.headToHead.played}</span>
        </div>
        <div class="head-card">
          <strong>${teamAIcon}<span>Wins</span></strong>
          <span>${data.headToHead.teamA_wins}</span>
        </div>
        <div class="head-card">
          <strong>${teamBIcon}<span>Wins</span></strong>
          <span>${data.headToHead.teamB_wins}</span>
        </div>
        <div class="head-card">
          <strong>Draws</strong>
          <span>${data.headToHead.draws}</span>
        </div>
      </div>
    </section>
  `;

  const mapComparison = buildMapComparisonSection(data, teamAColor, teamBColor);

  const heroMap = {};

  data.bans.teamA.forEach(ban => {
    heroMap[ban.hero_id] = {
      hero_id: ban.hero_id,
      hero_name: ban.hero_name,
      hero_icon: ban.hero_icon,
      hero_role: ban.hero_role,
      [data.teamA.name]: ban.bans_for || 0,
      [data.teamB.name]: 0
    };
  });

  data.bans.teamB.forEach(ban => {
    if (!heroMap[ban.hero_id]) {
      heroMap[ban.hero_id] = {
        hero_id: ban.hero_id,
        hero_name: ban.hero_name,
        hero_icon: ban.hero_icon,
        hero_role: ban.hero_role,
        [data.teamA.name]: 0,
        [data.teamB.name]: ban.bans_for || 0
      };
    } else {
      heroMap[ban.hero_id].hero_role = heroMap[ban.hero_id].hero_role || ban.hero_role;
      heroMap[ban.hero_id][data.teamB.name] = ban.bans_for || 0;
    }
  });

  const heroNames = {
    teamA: data.teamA.name,
    teamB: data.teamB.name
  };
  const heroItems = Object.values(heroMap)
    .map(ban => ({
      ...ban,
      hero_role: ban.hero_role || 'Unknown',
      teamA: ban[heroNames.teamA] || 0,
      teamB: ban[heroNames.teamB] || 0
    }))
    .sort((a, b) => (b.teamA + b.teamB) - (a.teamA + a.teamB));
  const banItems = currentBanView === 'role' ? groupCompareBansByRole(heroItems) : heroItems;
  const banCards = banItems.map(item => {
    const roleIcon = currentBanView === 'role' ? getRoleIconPath(item.hero_name) : '';
    const iconMarkup = currentBanView === 'hero'
      ? `<img src="${buildAssetPath(item.hero_icon)}" alt="${item.hero_name}" loading="lazy">`
      : roleIcon
        ? `<img src="${roleIcon}" alt="${item.hero_name}" loading="lazy" class="ban-pill-role-icon">`
        : `<div class="ban-pill-role" aria-hidden="true">${String(item.hero_name || '?').charAt(0).toUpperCase()}</div>`;
    const totalBans = parseStatValue(item.teamA) + parseStatValue(item.teamB);
    const teamABans = `${buildTeamIcon(data.teamA, 'hover-team-icon')}<span>${item.teamA}</span>`;
    const teamBBans = `${buildTeamIcon(data.teamB, 'hover-team-icon')}<span>${item.teamB}</span>`;

    return `
      <div class="ban-pill">
        <span class="ban-pill-title">${item.hero_name}</span>
        <div class="ban-pill-body">
          ${iconMarkup}
          <div class="ban-pill-content">
            <strong>${totalBans} bans</strong>
            <small class="pill-team-stats"><span class="pill-team-stat">${teamABans}</span><span class="pill-team-stat">${teamBBans}</span></small>
          </div>
        </div>
      </div>
    `;
  }).join('');
  const heroCollapseLabel = heroSectionCollapsed ? 'Expand' : 'Collapse';
  const heroExpanded = String(!heroSectionCollapsed);

  const bansSection = `
    <section class="compare-section compare-bans compare-heroes-section${heroSectionCollapsed ? ' is-collapsed' : ''}">
      <div class="compare-section-header">
        <h2>Ban Comparison</h2>
        <div class="compare-section-actions">
          <div class="compare-view-toggle" role="group" aria-label="Ban results grouping">
            <button type="button" class="compare-view-button ${currentBanView === 'hero' ? 'is-active' : ''}" data-ban-view="hero">Hero</button>
            <button type="button" class="compare-view-button ${currentBanView === 'role' ? 'is-active' : ''}" data-ban-view="role">Role</button>
          </div>
          <button type="button" class="graph-collapse-toggle" data-ban-collapse-toggle aria-expanded="${heroExpanded}" aria-controls="compareBanChart">${heroCollapseLabel}</button>
        </div>
      </div>
      <div class="ban-results-chart ban-chart" id="compareBanChart">
        <div class="ban-pill-grid">${banCards}</div>
      </div>
    </section>
  `;

  const matchRows = (data.matches || []).map(match => {
    const teamAScore = Number(match.teamA.score) || 0;
    const teamBScore = Number(match.teamB.score) || 0;
    const winningColor = teamAScore > teamBScore
      ? teamAColor
      : teamBScore > teamAScore
        ? teamBColor
        : '';
    const scoreBackground = winningColor || '#2a2f4a';
    const scoreTextColor = getReadableTextColor(scoreBackground);

    return `
      <tr>
        <td data-label="Tournament">
          <span class="team-pill">
            ${match.tournament_icon ? `<img src="${buildAssetPath(match.tournament_icon)}" alt="${match.tournament || ''}" class="team-icon">` : ''}
            <span>${match.tournament || 'Unknown'}</span>
          </span>
        </td>
        <td data-label="Date">${match.date ? new Date(match.date).toDateString() : ''}</td>
        <td data-label="Matchup">
          <div class="matchup-cell">
            <a href="/teams/${encodeURIComponent(match.teamA.name || '')}" class="team-pill">
              ${match.teamA.icon ? `<img src="${buildTeamIconPath(match.teamA.icon)}" alt="${match.teamA.name || ''}" class="team-icon">` : ''}
              <span>${match.teamA.name || ''}</span>
            </a>
            <span>vs</span>
            <a href="/teams/${encodeURIComponent(match.teamB.name || '')}" class="team-pill">
              ${match.teamB.icon ? `<img src="${buildTeamIconPath(match.teamB.icon)}" alt="${match.teamB.name || ''}" class="team-icon">` : ''}
              <span>${match.teamB.name || ''}</span>
            </a>
          </div>
        </td>
        <td data-label="Score"><span class="score-badge" style="background: ${scoreBackground}; color: ${scoreTextColor};">${teamAScore} - ${teamBScore}</span></td>
        <td data-label="Link">${match.ref_link ? `<a class="link-pill" href="${match.ref_link}" target="_blank" rel="noreferrer">↗</a>` : '<span class="table-empty">-</span>'}</td>
      </tr>
    `;
  }).join('');

  const matchesSection = `
    <section class="compare-section recent-section">
      <div class="match-section-header">
        <div>
          <h2>Recent Matches</h2>
        </div>
      </div>

      <div class="table-shell">
        <table class="matches-table">
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Date</th>
              <th>Matchup</th>
              <th>Score</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            ${matchRows || '<tr><td colspan="5" class="table-empty">No recent matches available.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  compareResults.innerHTML = `
    <div class="compare-grid">
      ${teamASummary}
      ${teamBSummary}
    </div>
    ${headToHead}
    ${mapComparison}
    ${bansSection}
    ${matchesSection}
  `;
}

function buildTeamOption(team) {
  return `<option value="${team.team_id}">${team.team_name}</option>`;
}

async function loadTeams() {
  try {
    const response = await fetch('/api/compare/teams');
    teams = await response.json();

    attachSearchHandlers(teamAInput, teamASuggestions, 'A');
    attachSearchHandlers(teamBInput, teamBSuggestions, 'B');
    await loadTournamentOptions();
  } catch (error) {
    console.error('Failed to load teams', error);
    compareResults.innerHTML = '<p class="error-message">Unable to load team list.</p>';
  }
}

async function compareTeams() {
  const teamA = selectedTeamAId || findTeamIdByName(teamAInput.value);
  const teamB = selectedTeamBId || findTeamIdByName(teamBInput.value);

  if (!teamA || !teamB || teamA === teamB) {
    compareResults.innerHTML = '<p class="error-message">Please choose two different teams from the search suggestions.</p>';
    return;
  }

  try {
    currentMapView = 'map';
    currentBanView = 'hero';
    mapSectionCollapsed = false;
    heroSectionCollapsed = false;
    const query = buildTournamentQuery();
    const response = await fetch(`/api/compare?teamA=${teamA}&teamB=${teamB}&${query}`);
    if (!response.ok) {
      const errorData = await response.json();
      compareResults.innerHTML = `<p class="error-message">${errorData.error || 'Failed to compare teams.'}</p>`;
      return;
    }

    const data = await response.json();
    renderComparison(data);
  } catch (error) {
    console.error('Failed to compare teams', error);
    compareResults.innerHTML = '<p class="error-message">Unable to fetch comparison data.</p>';
  }
}

compareButton.addEventListener('click', compareTeams);
window.addEventListener('DOMContentLoaded', loadTeams);

document.addEventListener('click', event => {
    const toggleButton = event.target.closest('#filterToggle');
    if (toggleButton) {
        toggleFilterPanel(event);
        return;
    }

    const panel = document.getElementById('filterPanel');
    if (panel && panel.classList.contains('is-open') && !panel.contains(event.target)) {
        setFilterPanelOpen(false);
    }

    if (event.target !== teamAInput && !teamASuggestions.contains(event.target)) {
        teamASuggestions.innerHTML = '';
    }
    if (event.target !== teamBInput && !teamBSuggestions.contains(event.target)) {
        teamBSuggestions.innerHTML = '';
    }

  const mapToggleButton = event.target.closest('[data-map-view]');
  if (mapToggleButton && lastComparisonData) {
    const nextView = mapToggleButton.dataset.mapView;
    if (nextView && nextView !== currentMapView) {
      currentMapView = nextView;
      renderComparison(lastComparisonData);
    }
  }

  const banToggleButton = event.target.closest('[data-ban-view]');
  if (banToggleButton && lastComparisonData) {
    const nextView = banToggleButton.dataset.banView;
    if (nextView && nextView !== currentBanView) {
      currentBanView = nextView;
      renderComparison(lastComparisonData);
    }
  }

  const mapCollapseButton = event.target.closest('[data-map-collapse-toggle]');
  if (mapCollapseButton && lastComparisonData) {
    mapSectionCollapsed = !mapSectionCollapsed;
    renderComparison(lastComparisonData);
  }

  const banCollapseButton = event.target.closest('[data-ban-collapse-toggle]');
  if (banCollapseButton && lastComparisonData) {
    heroSectionCollapsed = !heroSectionCollapsed;
    renderComparison(lastComparisonData);
  }
});
