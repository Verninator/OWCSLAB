// Team page script: fetch team data and render roster, matches, maps and bans
let teamStatsChart = null;
let mapChart = null;
let banChart = null;
let currentMapView = 'map';
let currentBanView = 'hero';
let teamMapData = [];
let teamBanData = [];
let tournamentOptions = [];
let selectedTournamentIds = [];
let tournamentMode = 'include';

function formatCompactNumber(number) {
  if (number === null || number === undefined) return 0;
  if (number < 1000) return number;
  if (number < 1000000) return (number / 1000).toFixed(1) + 'K';
  if (number < 1000000000) return (number / 1000000).toFixed(1) + 'M';
  return number;
}

function buildTournamentQuery() {
  const params = new URLSearchParams({
    tournaments: selectedTournamentIds.join(','),
    tournamentMode
  });
  return params.toString();
}

function buildTournamentApiUrl() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let teamIdentifier = null;
  if (pathParts.length >= 2 && (pathParts[0].toLowerCase() === 'team' || pathParts[0].toLowerCase() === 'teams')) {
    teamIdentifier = pathParts[1];
  } else {
    const params = new URLSearchParams(window.location.search);
    teamIdentifier = params.get('name') || params.get('id');
  }

  const params = new URLSearchParams();
  if (teamIdentifier) {
    const numericIdentifier = Number(teamIdentifier);
    if (Number.isInteger(numericIdentifier) && numericIdentifier > 0) {
      params.set('teamId', String(numericIdentifier));
    } else {
      params.set('team', teamIdentifier);
    }
  }

  const query = params.toString();
  return query ? `/api/tournaments?${query}` : '/api/tournaments';
}

async function loadTournamentOptions() {
  try {
    const res = await fetch(buildTournamentApiUrl());
    const data = await res.json();
    tournamentOptions = Array.isArray(data) ? data : [];
    renderTournamentFilters();
  } catch (error) {
    console.warn('Failed to load tournament options', error);
  }
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
      loadTeamData();
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
  loadTeamData();
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

async function loadTeamData() {
  // Determine team identifier from path (`/team/:name` or `/teams/:name`) or `?name=`/`?id=` query
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let teamIdentifier = null;
  if (pathParts.length >= 2 && (pathParts[0].toLowerCase() === 'team' || pathParts[0].toLowerCase() === 'teams')) {
    teamIdentifier = pathParts[1];
  } else {
    const params = new URLSearchParams(window.location.search);
    teamIdentifier = params.get('name') || params.get('id');
  }

  if (!teamIdentifier) {
    alert('No team specified in URL');
    return;
  }

  let data = {};
  try {
    const query = buildTournamentQuery();
    const res = await fetch(`/api/teams/${encodeURIComponent(teamIdentifier)}?${query}`);
    data = await res.json();
  } catch (e) {
    console.warn('Failed to fetch team data', e);
    data = {};
  }

  if (data.team_details) {
    document.title = data.team_details.name || 'Team Profile';
    const teamNameEl = document.getElementById('teamName');
    if (teamNameEl){
      teamNameEl.textContent = data.team_details.name;
      teamNameEl.style.color = data.team_details.colour || "#00ff41";
    }
    const teamLogoEl = document.getElementById('teamLogo');
    if (teamLogoEl && data.team_details.icon) teamLogoEl.src = '../' + data.team_details.icon;
  }

  populateRoster(data.roster || [], data.team_details || {});
  populateMatchesTable(data.matches || []);
  populateTournaments(data.tournaments || []);
  initializeMapChart(data.maps || []);
  initializeBanChart(data.bans);
  setupChartSelector();
}

let allTournaments = [];
let tournamentsPage = 0;
const TOURNAMENTS_PAGE_SIZE = 5;

function populateTournaments(tournaments) {
  allTournaments = tournaments || [];
  tournamentsPage = 0;
  renderTournamentsPage();
}

function renderTournamentsPage() {
  const tbody = document.getElementById('tournamentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!allTournaments.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">No recent tournament data available</td></tr>';
    renderTournamentsPagination();
    return;
  }

  const start = tournamentsPage * TOURNAMENTS_PAGE_SIZE;
  const pageItems = allTournaments.slice(start, start + TOURNAMENTS_PAGE_SIZE);

  pageItems.forEach(tournament => {
    const row = document.createElement('tr');
    const startDate = tournament.start_date ? new Date(tournament.start_date) : null;
    const endDate = tournament.end_date ? new Date(tournament.end_date) : null;
    const placement = tournament.placement || '';
    const normalizedPlacement = placement.toString().toLowerCase();
    let placementClass = '';
    if (normalizedPlacement.includes('gold') || normalizedPlacement.includes('1st') || /^1$/.test(normalizedPlacement)) {
      placementClass = 'gold';
    } else if (normalizedPlacement.includes('silver') || normalizedPlacement.includes('2nd') || /^2$/.test(normalizedPlacement)) {
      placementClass = 'silver';
    } else if (normalizedPlacement.includes('bronze') || normalizedPlacement.includes('3rd') || /^3$/.test(normalizedPlacement)) {
      placementClass = 'bronze';
    }

    row.className = placementClass;
    row.innerHTML = `
      <td class="icon-column"><img src="${tournament.icon ? '../' + tournament.icon : ''}" class="match-icon"></td>
      <td>${tournament.name || ''}</td>
      <td>${startDate ? startDate.toDateString() : ''}</td>
      <td>${endDate ? endDate.toDateString() : ''}</td>
      <td>${placement}</td>
    `;
    tbody.appendChild(row);
  });

  renderTournamentsPagination();
}

function renderTournamentsPagination() {
  const existing = document.getElementById('tournamentsPagination');
  if (existing) existing.remove();

  const totalPages = Math.ceil(allTournaments.length / TOURNAMENTS_PAGE_SIZE);
  if (totalPages <= 1) return;

  const container = document.createElement('div');
  container.id = 'tournamentsPagination';
  container.className = 'table-pagination';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '\u2039';
  prevBtn.className = 'page-btn';
  prevBtn.disabled = tournamentsPage === 0;
  prevBtn.addEventListener('click', () => { tournamentsPage--; renderTournamentsPage(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `${tournamentsPage + 1} / ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '\u203a';
  nextBtn.className = 'page-btn';
  nextBtn.disabled = tournamentsPage >= totalPages - 1;
  nextBtn.addEventListener('click', () => { tournamentsPage++; renderTournamentsPage(); });

  container.appendChild(prevBtn);
  container.appendChild(info);
  container.appendChild(nextBtn);

  const table = document.getElementById('tournamentsTable');
  table.insertAdjacentElement('afterend', container);
}

function populateRoster(roster, teamDetails = {}) {
  const container = document.getElementById('rosterContent');
  if (!container) return;
  if (!roster || roster.length === 0) {
    container.innerHTML = '<div class="team-box-empty">No roster members available.</div>';
    return;
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

  function renderRoleCell(role) {
    const label = String(role || '').trim();
    const iconPath = getRoleIconPath(label);

    if (!iconPath) return '';

    return `<img src="${iconPath}" alt="${label}" title="${label}" class="roster-role-icon" data-role="${label}" onerror="this.replaceWith(document.createTextNode(this.dataset.role || ''))">`;
  }

  function normalizeTeamIconPath(icon) {
    const value = String(icon || '').trim();
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
      return value;
    }
    return `/${value}`;
  }

  function getRelatedTeam(player) {
    const isOwwcTeam = String(teamDetails.circuit || '').toLowerCase() === 'owwc';
    if (isOwwcTeam) {
      return {
        name: player.primary_team_name || '',
        icon: player.primary_team_icon || ''
      };
    }

    return {
      name: player.national_team_name || '',
      icon: player.national_team_icon || ''
    };
  }

  function renderRelatedTeamCell(player) {
    const relatedTeam = getRelatedTeam(player);
    const teamName = String(relatedTeam.name || '').trim();
    const iconPath = normalizeTeamIconPath(relatedTeam.icon);

    if (!teamName && !iconPath) {
      return '<span class="related-team-empty">-</span>';
    }

    if (!iconPath) {
      return `<span class="related-team-text">${teamName || '-'}</span>`;
    }

    const href = teamName ? `/teams/${encodeURIComponent(teamName)}` : '#';
    const title = teamName || 'No related team';
    return `
      <a href="${href}" class="related-team-link" ${teamName ? '' : 'aria-disabled="true" tabindex="-1"'}>
        <img src="${iconPath}" alt="${title}" title="${title}" class="related-team-icon" data-fallback="${title}" onerror="this.replaceWith(document.createTextNode(this.dataset.fallback || '-'))">
      </a>
    `;
  }

  const isOwwcTeam = String(teamDetails.circuit || '').toLowerCase() === 'owwc';

  const rows = roster.map(player => `
    <tr>
      <td class="role-cell">${renderRoleCell(player.role)}</td>
      <td><a href="/players/${encodeURIComponent(player.name || '')}">${player.name || ''}</a></td>
      <td class="related-team-cell">${renderRelatedTeamCell(player)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="team-roster">
      <thead>
        <tr>
          <th>Role</th>
          <th>Name</th>
          <th>${isOwwcTeam ? 'Team' : 'National Team'}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

let allMatches = [];
let matchesPage = 0;
const MATCHES_PAGE_SIZE = 10;

function populateMatchesTable(matches) {
  allMatches = matches || [];
  matchesPage = 0;
  renderMatchesPage();
}

function renderMatchesPage() {
  const tbody = document.getElementById('matchesTableBody');
  const tfoot = document.getElementById('matchesTableFoot');
  if (!tbody || !tfoot) return;
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  if (!allMatches.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No match data available</td></tr>';
    renderMatchesPagination();
    return;
  }

  const start = matchesPage * MATCHES_PAGE_SIZE;
  const pageItems = allMatches.slice(start, start + MATCHES_PAGE_SIZE);

  pageItems.forEach(match => {
    const row = document.createElement('tr');
    const teamScore = Number(match.team_score);
    const opponentScore = Number(match.opponent_score);
    if (!Number.isNaN(teamScore) && !Number.isNaN(opponentScore)) {
      if (teamScore > opponentScore) {
        row.classList.add('match-win');
      } else if (teamScore < opponentScore) {
        row.classList.add('match-loss');
      }
    }
    let date = match.date ? new Date(match.date) : null;
    row.innerHTML = `
      <td class="icon-column"><img src="${match.tournament_icon ? '../' + match.tournament_icon : ''}" class="match-icon"></td>
      <td>${match.tournament || ''}</td>
      <td><time datetime="${match.date || ''}">${date ? date.toDateString() : ''}</time></td>
      <td class="icon-column"><a href="./${match.opponent}"><img src="${match.opponent_icon ? '../' + match.opponent_icon : ''}" class="match-icon"></a></td>
      <td>${match.opponent || ''}</td>
      <td>${match.team_score || 0}:${match.opponent_score || 0}</td>
      <td>${match.ref_link ? ('<a href="' + match.ref_link + '">🔗</a>') : ''}</td>
    `;
    tbody.appendChild(row);
  });

  renderMatchesPagination();
}

function renderMatchesPagination() {
  const existing = document.getElementById('matchesPagination');
  if (existing) existing.remove();

  const totalPages = Math.ceil(allMatches.length / MATCHES_PAGE_SIZE);
  if (totalPages <= 1) return;

  const container = document.createElement('div');
  container.id = 'matchesPagination';
  container.className = 'table-pagination';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '\u2039';
  prevBtn.className = 'page-btn';
  prevBtn.disabled = matchesPage === 0;
  prevBtn.addEventListener('click', () => { matchesPage--; renderMatchesPage(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `${matchesPage + 1} / ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '\u203a';
  nextBtn.className = 'page-btn';
  nextBtn.disabled = matchesPage >= totalPages - 1;
  nextBtn.addEventListener('click', () => { matchesPage++; renderMatchesPage(); });

  container.appendChild(prevBtn);
  container.appendChild(info);
  container.appendChild(nextBtn);

  const table = document.getElementById('matchesTable');
  table.insertAdjacentElement('afterend', container);
}

function getWinRate(map) {
  return map.played ? map.won / map.played : 0;
}

function parseGroupValue(value) {
  return Number.parseInt(value, 10) || 0;
}

function sortMapsByWinRate(maps) {
  return [...maps].sort((left, right) => {
    const rateDiff = getWinRate(right) - getWinRate(left);
    if (rateDiff !== 0) return rateDiff;
    const playedDiff = right.played - left.played;
    if (playedDiff !== 0) return playedDiff;
    return left.map.localeCompare(right.map);
  });
}

function groupMapsByMode(maps) {
  const grouped = maps.reduce((acc, map) => {
    const mode = map.mode || 'Unknown';
    if (!acc[mode]) {
      acc[mode] = { map: mode, mode, played: 0, won: 0, drawn: 0, lost: 0 };
    }

    acc[mode].played += parseGroupValue(map.played);
    acc[mode].won += parseGroupValue(map.won);
    acc[mode].drawn += parseGroupValue(map.drawn);
    acc[mode].lost += parseGroupValue(map.lost);
    return acc;
  }, {});

  return sortMapsByWinRate(Object.values(grouped));
}

function renderMapResults() {
  const container = document.getElementById('mapChart');
  if (!container) return;
  if (!teamMapData.length) {
    container.innerHTML = '<p class="empty-chart-message">No map data available</p>';
    return;
  }

  const mapsToRender = currentMapView === 'mode'
    ? groupMapsByMode(teamMapData)
    : sortMapsByWinRate(teamMapData);

  const maxValue = Math.max(1, ...mapsToRender.flatMap(map => [map.won, map.drawn, map.lost]));
  const resultTypes = [
    { key: 'won', label: 'Won', color: '#2ecc71' },
    { key: 'drawn', label: 'Draw', color: '#e7e294' },
    { key: 'lost', label: 'Lost', color: '#e74c3c' }
  ];

  container.innerHTML = mapsToRender.map(map => {
    const winRate = map.played ? Math.round((map.won / map.played) * 100) : 0;
    const bars = resultTypes
      .filter(result => result.key !== 'drawn' || map.drawn > 0)
      .map(result => {
      const value = map[result.key];
      const width = Math.round((value / maxValue) * 100);

      return `
        <div class="map-result-bar-group" data-result-type="${result.label}">
          <span class="map-result-bar-name" style="color: ${result.color};">${result.label}</span>
          <div class="map-result-bar-track">
            <div class="map-result-bar-fill" style="width: ${width}%; background: ${result.color};"></div>
          </div>
          <div class="map-result-bar-value">${value}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="map-result-row">
        <div class="map-result-label">
          <span>${map.map}</span>
          <small class="comparison-subtext">Played ${map.played} · Win Rate ${winRate}%</small>
        </div>
        <div class="map-result-bars">
          ${bars}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-map-view]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mapView === currentMapView);
  });
}

function groupTeamBansByRole(bans) {
  const grouped = bans.reduce((acc, ban) => {
    const role = ban.heroRole || 'Unknown';
    if (!acc[role]) {
      acc[role] = { hero: role, heroIcon: '', heroRole: role, bansFor: 0, bansAgainst: 0 };
    }

    acc[role].bansFor += parseGroupValue(ban.bansFor);
    acc[role].bansAgainst += parseGroupValue(ban.bansAgainst);
    return acc;
  }, {});

  return Object.values(grouped).sort((left, right) => (right.bansFor + right.bansAgainst) - (left.bansFor + left.bansAgainst));
}

function renderBanResults() {
  const container = document.getElementById('banChart');
  if (!container) return;
  if (!teamBanData.length) {
    container.innerHTML = '<p class="empty-chart-message">No ban data available</p>';
    return;
  }

  const items = currentBanView === 'role' ? groupTeamBansByRole(teamBanData) : teamBanData;
  const maxValue = Math.max(1, ...items.flatMap(ban => [ban.bansFor, ban.bansAgainst]));
  const resultTypes = [
    { key: 'bansFor', label: 'By', color: '#2ecc71' },
    { key: 'bansAgainst', label: 'Against', color: '#e74c3c' }
  ];

  container.innerHTML = items.map(ban => {
    const bars = resultTypes.map(result => {
      const value = ban[result.key];
      const width = Math.round((value / maxValue) * 100);

      return `
        <div class="hero-bar-group" data-team-name="${result.label}">
          <span class="hero-bar-team-name" style="color: ${result.color};">${result.label}</span>
          <div class="hero-bar-track">
            <div class="hero-bar-fill" style="width: ${width}%; background: ${result.color};"></div>
          </div>
          <div class="hero-bar-value">${value}</div>
        </div>
      `;
    }).join('');

    const label = currentBanView === 'role'
      ? `<span>${ban.hero}</span>`
      : `
        <img src="../${ban.heroIcon}" alt="${ban.hero}" class="hero-icon">
        <span>${ban.hero}</span>
      `;

    return `
      <div class="hero-bar-row">
        <div class="hero-label${currentBanView === 'role' ? ' role-label' : ''}">
          ${label}
        </div>
        <div class="hero-bars">
          ${bars}
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-ban-view]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.banView === currentBanView);
  });
}


function initializeMapChart(maps) {
  teamMapData = (maps || [])
    .map((map, index) => ({
      map: map.map || `Map ${index + 1}`,
      mode: map.mode || 'Unknown',
      played: Number.parseInt(map.played, 10) || 0,
      won: Number.parseInt(map.won, 10) || 0,
      drawn: Number.parseInt(map.drawn, 10) || 0,
      lost: Number.parseInt(map.lost, 10) || 0
    }))
    .filter(map => map.won + map.drawn + map.lost > 0);

  renderMapResults();
}

function initializeBanChart(bans) {
  teamBanData = (bans || [])
    .map(ban => ({
      hero: ban.hero || 'Unknown',
      heroIcon: ban.hero_icon || '',
      heroRole: ban.hero_role || 'Unknown',
      bansFor: Number.parseInt(ban.bansFor, 10) || 0,
      bansAgainst: Number.parseInt(ban.bansAgainst, 10) || 0
    }))
    .sort((left, right) => (right.bansFor + right.bansAgainst) - (left.bansFor + left.bansAgainst));

  renderBanResults();
}

function setupChartSelector() {
  const sel = document.getElementById('statSelect');
  if (!sel) return;
  sel.addEventListener('change', (e) => {
    // for now we only show the same donut; could re-render based on selection
    // placeholder: no-op
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadTournamentOptions();
  setFilterPanelOpen(false);

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
    const toggle = event.target.closest('[data-map-view]');
    if (!toggle) return;
    const nextView = toggle.dataset.mapView;
    if (!nextView || nextView === currentMapView) return;
    currentMapView = nextView;
    renderMapResults();
  });

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-ban-view]');
    if (!toggle) return;
    const nextView = toggle.dataset.banView;
    if (!nextView || nextView === currentBanView) return;
    currentBanView = nextView;
    renderBanResults();
  });

  loadTeamData();
});
