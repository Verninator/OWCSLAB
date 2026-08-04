const mapDetailContainer = document.getElementById('mapDetailContainer');

function getMapSlug() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  return pathParts[pathParts.length - 1];
}

function buildBanPill(ban) {
  return `
    <div class="ban-pill">
      <img src="../${ban.hero_icon || '/content/images/heroes/default.png'}" alt="${ban.hero_name}" loading="lazy">
      <div>
        <span>${ban.hero_name}</span>
        <strong>${ban.bans} bans</strong>
      </div>
    </div>
  `;
}

function buildTeamRow(team) {
  return `
    <tr>
        <td><img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}" class="team-icon" /></td>
        <td><span>${team.team_name}</span></td>
        <td>${team.played}</td>
        <td>${team.wins}</td>
        <td>${team.losses}</td>
        <td>${team.draws}</td>
        <td>${team.win_rate}%</td>
    </tr>
  `;
}

function renderMapDetails(map) {
  const imageHtml = map.image
    ? `<img src="../${map.image}" alt="${map.map_name}" loading="lazy">`
    : '<div class="map-image-missing">Image unavailable</div>';

  const banCards = map.bans.length
    ? map.bans.map(buildBanPill).join('')
    : '<div class="no-bans">No bans available.</div>';

  const teamRows = map.teams.length
    ? map.teams.map(buildTeamRow).join('')
    : '<tr><td colspan="6">No active team stats available.</td></tr>';

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
        </div>
      </div>
    </section>
  `;
}

async function loadMapDetails() {
  const slug = getMapSlug();

  try {
    const response = await fetch(`/api/maps/${encodeURIComponent(slug)}`);
    if (!response.ok) {
      throw new Error('Map not found');
    }

    const map = await response.json();
    document.getElementById('mapTitle').textContent = map.map_name;
    document.getElementById('mapDescription').textContent = `Detailed stats for ${map.map_name} (${map.mode}).`;
    mapDetailContainer.innerHTML = renderMapDetails(map);
  } catch (error) {
    console.error('Failed to load map details', error);
    mapDetailContainer.innerHTML = '<p class="error-message">Unable to load map details at this time.</p>';
  }
}

window.addEventListener('DOMContentLoaded', loadMapDetails);
