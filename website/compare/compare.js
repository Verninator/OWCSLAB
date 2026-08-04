const teamASelect = document.getElementById('teamA');
const teamBSelect = document.getElementById('teamB');
const compareButton = document.getElementById('compareButton');
const compareResults = document.getElementById('compareResults');

function capitalizeFirstLetter(val) {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
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

function renderComparison(data) {
  const teamASummary = buildStatsCard(`${data.teamA.team_name} Totals`, data.teamA.totals);
  const teamAAverages = buildStatsCard(`${data.teamA.team_name} Average`, data.teamA.averages);
  const teamBSummary = buildStatsCard(`${data.teamB.team_name} Totals`, data.teamB.totals);
  const teamBAverages = buildStatsCard(`${data.teamB.team_name} Average`, data.teamB.averages);

  const headToHead = `
    <section class="compare-section">
      <h2>Head to Head</h2>
      <div class="headtohead-grid">
        <div class="head-card">
          <strong>Maps Played</strong>
          <span>${data.headToHead.played}</span>
        </div>
        <div class="head-card">
          <strong>${data.teamA.team_name} Wins</strong>
          <span>${data.headToHead.teamA_wins}</span>
        </div>
        <div class="head-card">
          <strong>${data.teamB.team_name} Wins</strong>
          <span>${data.headToHead.teamB_wins}</span>
        </div>
        <div class="head-card">
          <strong>Draws</strong>
          <span>${data.headToHead.draws}</span>
        </div>
      </div>
    </section>
  `;

  const mapRows = data.maps.map(map => `
    <tr>
      <td>${map.map_name}</td>
      <td>${map.teamA.played}</td>
      <td>${map.teamA.wins}</td>
      <td>${map.teamA.losses}</td>
      <td>${map.teamA.draws}</td>
    </tr>
  `).join('');

  const mapComparison = `
    <section class="compare-section">
      <h2>Map Results</h2>
      <div class="table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Map</th>
              <th>Played</th>
              <th>${data.teamA.team_name}</th>
              <th>${data.teamB.team_name}</th>
              <th>Draws</th>
            </tr>
          </thead>
          <tbody>${mapRows}</tbody>
        </table>
      </div>
    </section>
  `;

  const heroMap = {};

  data.bans.teamA.forEach(ban => {
    heroMap[ban.hero_id] = {
      hero_id: ban.hero_id,
      hero_name: ban.hero_name,
      hero_icon: ban.hero_icon,
      [data.teamA.team_name]: ban.bans_for || 0,
      [data.teamB.team_name]: 0
    };
  });

  data.bans.teamB.forEach(ban => {
    if (!heroMap[ban.hero_id]) {
      heroMap[ban.hero_id] = {
        hero_id: ban.hero_id,
        hero_name: ban.hero_name,
        hero_icon: ban.hero_icon,
        [data.teamA.team_name]: 0,
        [data.teamB.team_name]: ban.bans_for || 0
      };
    } else {
      heroMap[ban.hero_id][data.teamB.team_name] = ban.bans_for || 0;
    }
  });

  const banRows = Object.values(heroMap).map(ban => `
    <tr>
      <td><img src="../${ban.hero_icon || '/content/images/heroes/default.png'}" alt="${ban.hero_name}" class="hero-icon"></td>
      <td>${ban.hero_name}</td>
      <td>${ban[data.teamA.team_name] || 0}</td>
      <td>${ban[data.teamB.team_name] || 0}</td>
    </tr>
  `).join('');

  const bansSection = `
    <section class="compare-section compare-bans">
      <h2>Ban Comparison</h2>
      <div class="table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Hero</th>
              <th>Name</th>
              <th>${data.teamA.team_name}</th>
              <th>${data.teamB.team_name}</th>
            </tr>
          </thead>
          <tbody>${banRows}</tbody>
        </table>
      </div>
    </section>
  `;

  const matchRows = data.matches.map(match => `
    <tr>
      <td>${new Date(match.date).toLocaleDateString()}</td>
      <td>${match.tournament || 'N/A'}</td>
      <td>${match.teamA.name}</td>
      <td>${match.teamA.score}:${match.teamB.score}</td>
      <td>${match.teamB.name}</td>
      <td>${determineWinner(match)}</td>
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
    const teams = await response.json();

    teamASelect.innerHTML = teams.map(buildTeamOption).join('');
    teamBSelect.innerHTML = teams.map(buildTeamOption).join('');
  } catch (error) {
    console.error('Failed to load teams', error);
    compareResults.innerHTML = '<p class="error-message">Unable to load team list.</p>';
  }
}

async function compareTeams() {
  const teamA = teamASelect.value;
  const teamB = teamBSelect.value;

  if (!teamA || !teamB || teamA === teamB) {
    compareResults.innerHTML = '<p class="error-message">Please select two different teams.</p>';
    return;
  }

  try {
    const response = await fetch(`/api/compare?teamA=${teamA}&teamB=${teamB}`);
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
