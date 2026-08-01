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
  initializeTeamStatsChart(data.summary || {});
  initializeMapChart(data.maps || []);
  initializeBanChart(data.bans);
  setupChartSelector();
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

function initializeTeamStatsChart(summary) {
  const ctx = document.getElementById('teamStatsChart');
  if (!ctx) return;
  const wins = summary.wins || 0;
  const losses = summary.losses || 0;
  const draws = summary.draws || 0;

  if (teamStatsChart) teamStatsChart.destroy();

  teamStatsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins','Losses','Draws'],
      datasets: [{
        data: [wins, losses, draws],
        backgroundColor: ['#00a429','#a52700','#e7e294']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#ffffff' } }, tooltip: { backgroundColor: '#1a1f3a', titleColor: '#fff', bodyColor: '#fff' } }
    }
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
        { label: 'Won', data: wonData, backgroundColor: '#00a429' },
        { label: 'Draw', data: drawData, backgroundColor: '#e7e294' },
        { label: 'Lost', data: lostData, backgroundColor: '#a52700' }
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
        { label: 'By', data: forData, backgroundColor: '#00a429' },
        { label: 'Against', data: againstData, backgroundColor: '#a52700' }
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
