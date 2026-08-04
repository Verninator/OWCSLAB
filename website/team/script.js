// Team page script: fetch team data and render roster, matches, maps and bans
let teamStatsChart = null;
let mapChart = null;
let banChart = null;

function formatCompactNumber(number) {
  if (number === null || number === undefined) return 0;
  if (number < 1000) return number;
  if (number < 1000000) return (number / 1000).toFixed(1) + 'K';
  if (number < 1000000000) return (number / 1000000).toFixed(1) + 'M';
  return number;
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
    const res = await fetch(`/api/teams/${encodeURIComponent(teamIdentifier)}`);
    data = await res.json();
  } catch (e) {
    console.warn('Failed to fetch team data', e);
    data = {};
  }

  if (data.team_details) {
    document.title = data.team_details.name || 'Team Profile';
    const teamNameEl = document.getElementById('teamName');
    if (teamNameEl) teamNameEl.textContent = data.team_details.name;
    const teamLogoEl = document.getElementById('teamLogo');
    if (teamLogoEl && data.team_details.icon) teamLogoEl.src = '../' + data.team_details.icon;
  }

  populateRoster(data.roster || []);
  populateMatchesTable(data.matches || []);
  populateTournaments(data.tournaments || []);
  initializeMapChart(data.maps || []);
  initializeBanChart(data.bans);
  setupChartSelector();
}

function populateTournaments(tournaments) {
  const tbody = document.getElementById('tournamentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!tournaments || tournaments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px">No recent tournament data available</td></tr>';
    return;
  }

  tournaments.forEach(tournament => {
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
}

function populateRoster(roster) {
  const tbody = document.getElementById('rosterTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!roster || roster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px">No roster data</td></tr>';
    return;
  }

  roster.forEach(player => {
    const tr = document.createElement('tr');
    if (player.role == 'Tank'){
        player.role_icon = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/c/c8/Role_Tank_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105320";
    } else if (player.role == 'Dps'){
        player.role_icon = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/8/80/Role_Damage_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105011";
    }
    else if (player.role == 'Support'){
        player.role_icon = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/9/93/Role_Support_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105200";
    }
    tr.innerHTML = `
      <td class="icon-column"><img src="${player.role_icon || 'https://static.wikia.nocookie.net/overwatch_gamepedia/images/c/c8/Role_Tank_Circle.svg'}" class="roster-icon"></td>
      <td>${player.name || ''}</td>
      <td><a href="../players/${player.name}">🔗</a></td>
    `;
    tbody.appendChild(tr);
  });
}

function populateMatchesTable(matches) {
  const tbody = document.getElementById('matchesTableBody');
  const tfoot = document.getElementById('matchesTableFoot');
  if (!tbody || !tfoot) return;
  tbody.innerHTML = '';
  tfoot.innerHTML = '';
  if (!matches || matches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No match data available</td></tr>';
    return;
  }

  matches.forEach((match, index) => {
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
}


function initializeMapChart(maps) {
  const ctx = document.getElementById('mapChart');
  if (!ctx || !maps || maps.length === 0) return;
  const labels = [];
  const wonData = [];
  const lostData = [];
  const drawData = [];

  maps.forEach(m => {
    labels.push(m.map || 'Unknown');
    wonData.push(m.won || 0);
    drawData.push(m.drawn || 0);
    lostData.push(m.lost || 0);
  });

  if (mapChart) mapChart.destroy();

  mapChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Won', data: wonData, backgroundColor: '#2ecc71' },
        { label: 'Draw', data: drawData, backgroundColor: 'rgb(231, 226, 148)' },
        { label: 'Lost', data: lostData, backgroundColor: '#e74c3c' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1f3a', titleColor: '#fff', bodyColor: '#fff' }
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { color: '#fff' } }
      }
    }
  });
}

function initializeBanChart(bans) {
  const ctx = document.getElementById('banChart');
  if (!ctx || !bans || bans.length === 0) return;
  const labels = [];
  const forData = [];
  const againstData = [];

  bans.forEach(b => {
    labels.push(b.hero || 'Unknown');
    forData.push(b.bansFor || 0);
    againstData.push(b.bansAgainst || 0);
  });

  if (banChart) banChart.destroy();

  banChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'By', data: forData, backgroundColor: '#2ecc71' },
        { label: 'Against', data: againstData, backgroundColor: '#e74c3c' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1f3a', titleColor: '#fff', bodyColor: '#fff' }
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          ticks: {
            color: '#fff'
          },
          grid: { display: false }
        }
      }
    }
  });
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
  loadTeamData();
});
