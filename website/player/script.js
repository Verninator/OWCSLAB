// Global chart instance
let statsChart = null;
let chartData = null;

function formatCompactNumber(number) {
  if (number < 1000) {
    return number;
  } else if (number >= 1000 && number < 1_000_000) {
    return (number / 1000).toFixed(1) + "K";
  } else if (number >= 1_000_000 && number < 1_000_000_000) {
    return (number / 1_000_000).toFixed(1) + "M";
  } else if (number >= 1_000_000_000 && number < 1_000_000_000_000) {
    return (number / 1_000_000_000).toFixed(1) + "B";
  } else if (number >= 1_000_000_000_000 && number < 1_000_000_000_000_000) {
    return (number / 1_000_000_000_000).toFixed(1) + "T";
  }
}

// Fetch player data from API and populate the page
async function loadPlayerData() {
    // Determine player identifier from path (`/players/:id` or `/players/:name`) or `?id=` query
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    let playerIdentifier = null;
    if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'players') {
        playerIdentifier = pathParts[1];
    } else {
        const params = new URLSearchParams(window.location.search);
        playerIdentifier = params.get('id');
    }

    if (!playerIdentifier) {
        alert('No player specified in URL');
        return;
    }

    const data = await fetch(`/api/players/${encodeURIComponent(playerIdentifier)}`)
        .then(response => response.json())
        .then(data => { return data; })
        .catch(error => { alert(error); return null; });

    if (!data) return;


    window.top.document.title  = data.player_details.name


    // Update player name (always has a value)



    const playerNameEl = document.getElementById('playerName');
    if (playerNameEl) playerNameEl.textContent = data.player_details.name;

    
    // Update role icon (always has a value)
    const roleIconEl = document.getElementById('roleIcon');
    let roleIconSrc;
    if (data.player_details.role == 'Tank'){
        roleIconSrc = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/c/c8/Role_Tank_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105320";
    } else if (data.player_details.role == 'Dps'){
        roleIconSrc = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/8/80/Role_Damage_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105011";
    }
    else if (data.player_details.role == 'Support'){
        roleIconSrc = "https://static.wikia.nocookie.net/overwatch_gamepedia/images/9/93/Role_Support_Circle.svg/revision/latest/scale-to-width-down/120?cb=20250727105200";
    }
    
    if (roleIconEl) roleIconEl.src = roleIconSrc;
    
    // Update team name (always has a value)
    const teamNameEl = document.getElementById('teamName');
    if (teamNameEl) teamNameEl.textContent = data.player_details.team;
    
    // Update team logo (always has a value)
    const teamLogoEl = document.getElementById('teamLogo');
    if (teamLogoEl) teamLogoEl.src = "../" + data.player_details.team_icon;
    // Make team logo/name link to the team page
    const teamLinkEl = document.getElementById('teamLink');
    if (teamLinkEl && data.player_details.team) {
        teamLinkEl.href = `/teams/${encodeURIComponent(data.player_details.team)}`;
    }
    
    
    // Update total stats (all have values)
    const totalStatIds = [
        'totalEliminations',
        'totalAssists',
        'totalDeaths',
        'totalDamage',
        'totalHealing',
        'totalMitigation'
    ];
    const totalStatKeys = ['eliminations', 'assists', 'deaths', 'damage', 'healing', 'mitigation'];
    
    totalStatIds.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCompactNumber(data.total[totalStatKeys[index]]) ;
    });
    
    // Update average stats (all have values)
    const avgStatIds = [
        'avgEliminations',
        'avgAssists',
        'avgDeaths',
        'avgDamage',
        'avgHealing',
        'avgMitigation'
    ];
    const avgStatKeys = ['eliminations', 'assists', 'deaths', 'damage', 'healing', 'mitigation'];
    
    avgStatIds.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCompactNumber(parseFloat(data.avg[avgStatKeys[index]]).toFixed(1));
    });
    
    // Update preferred heroes (always has 3 heroes)
    const heroesContainer = document.getElementById('heroesContainer');
    if (heroesContainer) {
        heroesContainer.innerHTML = ''; // Clear existing heroes
        
        data.heroes.forEach(hero => {
            const heroCard = document.createElement('div');
            heroCard.className = 'hero-card';
            heroCard.innerHTML = `
                <img src="../${hero.icon}" alt="${hero.name}" class="hero-image">
                <div class="hero-name">${hero.name}</div>
            `;
            heroesContainer.appendChild(heroCard);
        });
    }
    // Update match history table
    populateMatchesTable(data.matches);
    
    // Initialize chart with match history
    initializeStatChart(data.stats);
    initializeMapChart(data.maps);
}

// Populate matches table with data
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
    
    // Populate match rows
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
        let date = new Date(match.date)
        row.innerHTML = `
            <td class="icon-column"><img src="../${match.tournament_icon}" class="match-icon"></td>
            <td>${match.tournament}</td>
            <td><time datetime="${date.toISOString()}">${date.toDateString()}</time></td>
            <td class="icon-column"><a href="../teams/${match.opponent}"><img src="${match.opponent_icon ? '../' + match.opponent_icon : ''}" class="match-icon"></a></td>
            <td>${match.opponent}</td>
            <td>${match.team_score}:${match.opponent_score}</td>
            <td><a href="${match.ref_link}">🔗</a></td>
        `;
        tbody.appendChild(row);
    });
    
}


      


// Initialize and render the stats chart
function initializeStatChart(matches) {
    const ctx = document.getElementById('statsChart');
    if (!ctx || !matches || matches.length === 0) return;
    
    statChartData = matches;
    renderStatChart('eliminations');
}

// Render chart for selected stat
function renderStatChart(statName) {
    if (!statChartData || statChartData.length === 0) return;
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;
    
    // Calculate cumulative totals and running averages
    const labels = [];
    const Data = [];
    
    statChartData.forEach((match, index) => {
        labels.push(match.opponent || `Match ${index + 1}`);
        
        // Get stat value (parse if it's a string like "45.2k")
        let statValue = match[statName];
        if (typeof statValue === 'string') {
            statValue = parseFloat(statValue) * (statValue.includes('k') ? 1000 : 1);
        }
        statValue = statValue || 0;
        
        Data.push(statValue);
    });
    
    // Destroy existing chart if it exists
    if (statsChart) {
        statsChart.destroy();
    }
    
    // Create new chart
    statsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `${statName.charAt(0).toUpperCase() + statName.slice(1)}`,
                    data: Data,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.22)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2ecc71',
                    pointBorderColor: '#2ecc71',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: '#1a1f3a',
                    borderColor: '#00ff41',
                    borderWidth: 2,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 12 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 11 }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 11 }
                    },
                    display: false
                }
            }
        }
    });
}

// Setup chart stat selector
function setupChartSelector() {
    const statSelect = document.getElementById('statSelect');
    if (statSelect) {
        statSelect.addEventListener('change', (e) => {
            renderStatChart(e.target.value);
        });
    }
}

// Initialize and render the stats chart
function initializeMapChart(maps) {
    const ctx = document.getElementById('mapChart');
    if (!ctx || !maps || maps.length === 0) return;
    
    mapChartData = maps;
    renderMapChart();
}

// Render chart for selected stat
function renderMapChart() {
    if (!mapChartData || mapChartData.length === 0) return;
    
    const ctx = document.getElementById('mapChart');
    if (!ctx) return;
    
    // Calculate cumulative totals and running averages
    const labels = [];
    const lostData = [];
    const wonData = [];
    const drawData = [];
    
    mapChartData.forEach((map, index) => {   
        let lost = map.lost;
        let won = map.won;
        let draw = map.drawn;
        if (typeof lost === 'string') {
            lost = parseInt(lost);
        }
        if (typeof won === 'string') {
            won = parseInt(won);
        }
        if (typeof draw === 'string') {
            draw = parseInt(draw);
        }
        won = won || 0;
        lost = lost || 0;
        draw = draw || 0;

        if (won + lost + draw > 0){
            labels.push(map.map || `Map ${index + 1}`);  
            lostData.push(lost);
            wonData.push(won);
            drawData.push(draw);
        }
        
    });
    
    // Create new chart
    mapChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Won`,
                    data: wonData,
                    backgroundColor: '#2ecc71',
                    stack: 'Stack 0'
                },
                {
                    label: `Draw`,
                    data: drawData,
                    backgroundColor: '#e7e294',
                    stack: 'Stack 0'
                },
                {
                    label: `Lost`,
                    data: lostData,
                    backgroundColor: '#e74c3c',
                    stack: 'Stack 0'
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    backgroundColor: '#1a1f3a',
                    borderColor: '#00ff41',
                    borderWidth: 2,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 12 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 255, 65, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 11 }
                    },
                    stacked : true
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        color: '#ffffff',
                        font: { size: 11 }
                    },
                    stacked : true
                }
            }
        }
    });
}

// Load data when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("Hello World");
    loadPlayerData();
    setupChartSelector();
});
