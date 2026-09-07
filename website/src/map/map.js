const mapDetailContainer = document.getElementById('mapDetailContainer');
const TEAM_PAGE_SIZE = 10;
let tournamentOptions = [];
let selectedTournamentIds = [];
let tournamentMode = 'include';
let activeTeamPage = 1;

function getMapSlug() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  return pathParts[pathParts.length - 1];
}

function resolveAssetPath(value) {
  const path = String(value || '').trim();
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!normalizedPath.toLowerCase().startsWith('/content/images/')) {
    return normalizedPath;
  }

  return normalizedPath.toLowerCase();
}

function buildBanPill(ban) {
  const heroIcon = resolveAssetPath(ban.hero_icon || '/content/images/heroes/default.png');
  return `
    <div class="ban-pill">
      <img src="${heroIcon}" alt="${ban.hero_name}" loading="lazy">
      <div>
        <span>${ban.hero_name}</span>
        <strong>${ban.bans} bans</strong>
      </div>
    </div>
  `;
}

function buildTeamRow(team) {
  const teamIcon = resolveAssetPath(team.team_icon || '/content/images/teams/default.png');
  return `
    <tr>
        <td><a href="/teams/${team.team_name}"><img src="${teamIcon}" alt="${team.team_name}" class="team-icon" /></a></td>
        <td><span>${team.team_name}</span></td>
        <td>${team.played}</td>
        <td>${team.wins}</td>
        <td>${team.losses}</td>
        <td>${team.draws}</td>
        <td>${team.win_rate}%</td>
    </tr>
  `;
}

function buildTournamentQuery() {
  const params = new URLSearchParams({
    tournaments: selectedTournamentIds.join(','),
    tournamentMode
  });
  return params.toString();
}

async function loadTournamentOptions() {
  try {
    const params = new URLSearchParams({ map: getMapSlug() });
    const res = await fetch(`/api/tournaments?${params.toString()}`);
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
      loadMapDetails();
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
  loadMapDetails();
}

function setFilterPanelOpen(isOpen) {
  const panel = document.getElementById('filterPanel');
  const toggle = document.getElementById('filterToggle');
  if (!panel || !toggle) return;
  panel.classList.toggle('is-open', isOpen);
  panel.classList.toggle('is-collapsed', !isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.textContent = isOpen ? 'Close' : 'Filter';
}

function toggleFilterPanel(event) {
  if (event) {
    event.stopPropagation();
  }
  const panel = document.getElementById('filterPanel');
  if (!panel) return;
  setFilterPanelOpen(!panel.classList.contains('is-open'));
}

function buildTeamTablePagination(map) {
  const totalTeams = map.teams.length;
  const totalPages = Math.max(1, Math.ceil(totalTeams / TEAM_PAGE_SIZE));
  if (totalTeams <= TEAM_PAGE_SIZE) return '';

  activeTeamPage = Math.min(activeTeamPage, totalPages);

  return `
    <div class="team-table-pagination">
      <button
        type="button"
        class="team-page-button"
        data-direction="prev"
        ${activeTeamPage === 1 ? 'disabled' : ''}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span class="team-page-status">Page ${activeTeamPage} of ${totalPages}</span>
      <button
        type="button"
        class="team-page-button"
        data-direction="next"
        ${activeTeamPage >= totalPages ? 'disabled' : ''}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  `;
}

function bindTeamTablePaginationHandlers(map) {
  const buttons = document.querySelectorAll('.team-page-button');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.direction;
      const totalPages = Math.max(1, Math.ceil(map.teams.length / TEAM_PAGE_SIZE));

      if (direction === 'prev') {
        activeTeamPage = Math.max(1, activeTeamPage - 1);
      } else if (direction === 'next') {
        activeTeamPage = Math.min(totalPages, activeTeamPage + 1);
      }

      mapDetailContainer.innerHTML = renderMapDetails(map);
      bindTeamTablePaginationHandlers(map);
    });
  });
}

function renderMapDetails(map) {
  const mapImage = resolveAssetPath(map.image);
  const imageHtml = map.image
    ? `<img src="${mapImage}" alt="${map.map_name}" loading="lazy">`
    : '<div class="map-image-missing">Image unavailable</div>';

  const banCards = map.bans.length
    ? map.bans.map(buildBanPill).join('')
    : '<div class="no-bans">No bans available.</div>';

  const totalPages = Math.max(1, Math.ceil(map.teams.length / TEAM_PAGE_SIZE));
  activeTeamPage = Math.min(activeTeamPage, totalPages);
  const startIndex = (activeTeamPage - 1) * TEAM_PAGE_SIZE;
  const visibleTeams = map.teams.slice(startIndex, startIndex + TEAM_PAGE_SIZE);

  const teamRows = visibleTeams.length
    ? visibleTeams.map(buildTeamRow).join('')
    : '<tr><td colspan="7">No active team stats available.</td></tr>';

  return `
    <section class="map-card-group">
      <div class="map-card-meta">
        <div class="map-card-image">
          ${imageHtml}
          <div class="map-card-label">
            <h2>${map.map_name}</h2>
            <span>${map.mode}</span>
          </div>
        </div>
      </div>
      <div class="map-detail-grid">
        <div class="map-detail-section">
          <div class="map-detail-header">
            <h3>Top Banned Heroes</h3>
            <span>${map.bans.length} heroes</span>
          </div>
          <div class="ban-pill-grid">
            ${banCards}
          </div>
        </div>
        <div class="map-detail-section">
          <div class="map-detail-header">
            <h3>Active Team Winrates</h3>
            <span>${map.teams.length} teams</span>
          </div>
          <div class="map-team-table-wrap">
            <table class="map-team-table">
              <thead>
                <tr>
                  <th colspan=2>Team</th>
                  <th>Played</th>
                  <th>W</th>
                  <th>L</th>
                  <th>D</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                ${teamRows}
              </tbody>
            </table>
          </div>
          ${buildTeamTablePagination(map)}
        </div>
      </div>
    </section>
  `;
}

async function loadMapDetails() {
  const slug = getMapSlug();
  activeTeamPage = 1;
  const page = document.querySelector('.map-list-page');
  page?.classList.add('page-loading');
  if (page && !page.querySelector('.loading-placeholder')) {
    page.insertAdjacentHTML('afterbegin', '<div class="loading-placeholder" role="status" aria-label="Loading"><span class="loading-spinner" aria-hidden="true"></span></div>');
  }

  try {
    const query = buildTournamentQuery();
    const response = await fetch(`/api/maps/${encodeURIComponent(slug)}?${query}`);
    if (!response.ok) {
      throw new Error('Map not found');
    }

    const map = await response.json();
    document.getElementById('mapTitle').textContent = map.map_name;
    document.getElementById('mapDescription').textContent = `Detailed stats for ${map.map_name} (${map.mode}).`;
    mapDetailContainer.innerHTML = renderMapDetails(map);
    bindTeamTablePaginationHandlers(map);
    page?.classList.remove('page-loading');
    page?.querySelector('.loading-placeholder')?.remove();
  } catch (error) {
    console.error('Failed to load map details', error);
    mapDetailContainer.innerHTML = '<p class="error-message">Unable to load map details at this time.</p>';
    page?.classList.remove('page-loading');
    page?.querySelector('.loading-placeholder')?.remove();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('filterToggle');
  if (toggle) {
    toggle.addEventListener('click', toggleFilterPanel);
  }

  document.addEventListener('click', (event) => {
    const panel = document.getElementById('filterPanel');
    if (!panel || panel.classList.contains('is-collapsed')) return;
    if (!panel.contains(event.target)) {
      setFilterPanelOpen(false);
    }
  });

  loadTournamentOptions();
  loadMapDetails();
});
