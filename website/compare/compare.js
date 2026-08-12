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

function buildMapRows(items, data, teamAColor, teamBColor) {
  const maxWins = Math.max(1, ...items.flatMap(item => [item.teamA.wins || 0, item.teamB.wins || 0]));
  const teamAIcon = buildTeamIcon(data.teamA, 'hover-team-icon');
  const teamBIcon = buildTeamIcon(data.teamB, 'hover-team-icon');

  return items.map(item => {
    const teamAWidth = Math.round(((item.teamA.wins || 0) / maxWins) * 100);
    const teamBWidth = Math.round(((item.teamB.wins || 0) / maxWins) * 100);
    const subtitle = `Played ${item.teamA.played || 0} · Draws ${item.teamA.draws || 0}`;

    return `
      <div class="hero-bar-row map-bar-row">
        <div class="hero-label map-label">
          <span>${item.map_name}</span>
          <small class="comparison-subtext">${subtitle}</small>
        </div>
        <div class="hero-bars">
          <div class="hero-bar-group" data-team-name="${data.teamA.name}">
            <span class="hero-bar-team-name" style="color: ${teamAColor};">${teamAIcon}</span>
            <div class="hero-bar-track">
              <div class="hero-bar-fill" style="width: ${teamAWidth}%; background: ${teamAColor};"></div>
            </div>
            <div class="hero-bar-value">${formatWinRate(item.teamA)}</div>
          </div>
          <div class="hero-bar-group" data-team-name="${data.teamB.name}">
            <span class="hero-bar-team-name" style="color: ${teamBColor};">${teamBIcon}</span>
            <div class="hero-bar-track">
              <div class="hero-bar-fill" style="width: ${teamBWidth}%; background: ${teamBColor};"></div>
            </div>
            <div class="hero-bar-value">${formatWinRate(item.teamB)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function groupMapsByMode(maps) {
  const grouped = maps.reduce((acc, map) => {
    const mode = map.map_mode || 'Unknown';
    if (!acc[mode]) {
      acc[mode] = {
        map_name: mode,
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
  const mapRows = buildMapRows(items, data, teamAColor, teamBColor);

  return `
    <section class="compare-section">
      <div class="compare-section-header">
        <h2>Map Results</h2>
        <div class="compare-view-toggle" role="group" aria-label="Map results grouping">
          <button type="button" class="compare-view-button ${currentMapView === 'map' ? 'is-active' : ''}" data-map-view="map">Map</button>
          <button type="button" class="compare-view-button ${currentMapView === 'mode' ? 'is-active' : ''}" data-map-view="mode">Mode</button>
        </div>
      </div>
      <div class="ban-chart map-chart">
        ${mapRows}
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

function buildCompareBanRows(items, heroNames, teamAColor, teamBColor) {
  const maxBanCount = Math.max(1, ...items.flatMap(item => [item.teamA, item.teamB]));
  const teamAIcon = buildTeamIcon(lastComparisonData.teamA, 'hover-team-icon');
  const teamBIcon = buildTeamIcon(lastComparisonData.teamB, 'hover-team-icon');

  return items.map(item => {
    const teamAWidth = Math.round((item.teamA / maxBanCount) * 100);
    const teamBWidth = Math.round((item.teamB / maxBanCount) * 100);
    const label = currentBanView === 'role'
      ? `<span>${item.hero_name}</span>`
      : `
        <img src="../${item.hero_icon}" alt="${item.hero_name}" class="hero-icon">
        <span>${item.hero_name}</span>
      `;

    return `
      <div class="hero-bar-row">
        <div class="hero-label${currentBanView === 'role' ? ' role-label' : ''}">
          ${label}
        </div>
        <div class="hero-bars">
          <div class="hero-bar-group" data-team-name="${heroNames.teamA}">
            <span class="hero-bar-team-name" style="color: ${teamAColor};">${teamAIcon}</span>
            <div class="hero-bar-track">
              <div class="hero-bar-fill" style="width: ${teamAWidth}%; background: ${teamAColor};"></div>
            </div>
            <div class="hero-bar-value">${item.teamA}</div>
          </div>
          <div class="hero-bar-group" data-team-name="${heroNames.teamB}">
            <span class="hero-bar-team-name" style="color: ${teamBColor};">${teamBIcon}</span>
            <div class="hero-bar-track">
              <div class="hero-bar-fill" style="width: ${teamBWidth}%; background: ${teamBColor};"></div>
            </div>
            <div class="hero-bar-value">${item.teamB}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderComparison(data) {
  lastComparisonData = data;
  const teamASummary = buildStatsCard(buildTeamTitle(data.teamA, 'Totals'), data.teamA.totals);
  const teamAAverages = buildStatsCard(buildTeamTitle(data.teamA, 'Average'), data.teamA.averages);
  const teamBSummary = buildStatsCard(buildTeamTitle(data.teamB, 'Totals'), data.teamB.totals);
  const teamBAverages = buildStatsCard(buildTeamTitle(data.teamB, 'Average'), data.teamB.averages);
  const teamAColor = data.teamA.colour || '#2ecc71';
  const teamBColor = data.teamB.colour || '#72f194';
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
  const banRows = buildCompareBanRows(banItems, heroNames, teamAColor, teamBColor);

  const bansSection = `
    <section class="compare-section compare-bans">
      <div class="compare-section-header">
        <h2>Ban Comparison</h2>
        <div class="compare-view-toggle" role="group" aria-label="Ban results grouping">
          <button type="button" class="compare-view-button ${currentBanView === 'hero' ? 'is-active' : ''}" data-ban-view="hero">Hero</button>
          <button type="button" class="compare-view-button ${currentBanView === 'role' ? 'is-active' : ''}" data-ban-view="role">Role</button>
        </div>
      </div>
      <div class="ban-chart">
        ${banRows}
      </div>
    </section>
  `;

  const matchRows = data.matches.map(match => `
    <tr>
      <td>${new Date(match.date).toLocaleDateString()}</td>
      <td>${match.tournament || 'N/A'}</td>
      <td>${buildTeamIcon(match.teamA, 'table-team-icon')}</td>
      <td>${match.teamA.score}:${match.teamB.score}</td>
      <td>${buildTeamIcon(match.teamB, 'table-team-icon')}</td>
      <td>${buildWinnerDisplay(match)}</td>
    </tr>
  `).join('');

  const matchesSection = `
    <section class="compare-section">
      <h2>Match History</h2>
      <div class="table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Tournament</th>
              <th colspan=3>Score</th>
              <th>Winner</th>
            </tr>
          </thead>
          <tbody>${matchRows}</tbody>
        </table>
      </div>
    </section>
  `;

  compareResults.innerHTML = `
    <div class="compare-grid">
      ${teamASummary}
      ${teamAAverages}
      ${teamBSummary}
      ${teamBAverages}
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
});
