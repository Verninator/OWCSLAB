// Global chart instance
let statsChart = null;
let chartData = null;

// Default placeholder data (fail safes)
const DEFAULT_PLAYER_DATA = {
    playerName: 'FunnyAstro',
    roleIcon: 'https://static.wikia.nocookie.net/overwatch_gamepedia/images/f/f7/New_Support_Icon.png/revision/latest?cb=20180626222808',
    teamName: 'Twisted Minds',
    teamLogo: 'https://liquipedia.net/commons/images/thumb/2/24/Twisted_Minds_2023_allmode.png/107px-Twisted_Minds_2023_allmode.png',
    avatarUrl: 'https://liquipedia.net/commons/images/thumb/2/2f/FunnyAstro_OWCS_Finals_2024.jpeg/900px-FunnyAstro_OWCS_Finals_2024.jpeg',
    stats: {
        total: {
            eliminations: '0',
            assists: '0',
            deaths: '0',
            damage: '0k',
            healing: '0k',
            mitigation: '0'
        },
        average: {
            eliminations: '0',
            assists: '0',
            deaths: '0',
            damage: '0k',
            healing: '0k',
            mitigation: '0'
        }
    },
    preferredHeroes: [
        { name: 'Lucio', imageUrl: 'https://liquipedia.net/commons/images/thumb/c/cd/Lucio_OW2_mini_portrait.png/225px-Lucio_OW2_mini_portrait.png' },
        { name: 'Juno', imageUrl: 'https://liquipedia.net/commons/images/thumb/6/60/Juno_mini_portrait.png/225px-Juno_mini_portrait.png' },
        { name: 'Jetpack Cat', imageUrl: 'https://liquipedia.net/commons/images/thumb/4/43/Jetpack_Cat_mini_portrait.png/225px-Jetpack_Cat_mini_portrait.png' }
    ],
    teamHistory: [
        { name: 'Twisted Minds', imageUrl: 'https://liquipedia.net/commons/images/thumb/2/24/Twisted_Minds_2023_allmode.png/107px-Twisted_Minds_2023_allmode.png' },
        { name: 'SpaceStation Gaming', imageUrl: 'https://liquipedia.net/commons/images/thumb/1/1a/Spacestation_Gaming_2023_allmode.png/61px-Spacestation_Gaming_2023_allmode.png' },
        { name: 'La Gladiators', imageUrl: 'https://liquipedia.net/commons/images/thumb/f/f2/Los_Angeles_Gladiators_2021_darkmode.png/76px-Los_Angeles_Gladiators_2021_darkmode.png' }
    ],
    statHistory: [
        {match: "Al Qadsiah",eliminations: "47", assists: "65", deaths: "19", damage: "11213", healing: "43780", mitigation: "1319"},
        {match: "Virtus Pro",eliminations: "32", assists: "46", deaths: "6", damage: "6115", healing: "32622", mitigation: "944"},
        {match: "Anyone's Legend",eliminations: "44", assists: "56", deaths: "9", damage: "11897", healing: "20295", mitigation: "3766"},
        {match: "Team Peps",eliminations: "50", assists: "48", deaths: "11", damage: "12749", healing: "24854", mitigation: "6305"},
        {match: "Geekay Esports",eliminations: "50", assists: "50", deaths: "15", damage: "12537", healing: "23674", mitigation: "3675"},
        {match: "Virtus Pro",eliminations: "12", assists: "15", deaths: "16", damage: "7635", healing: "27137", mitigation: "1001"},
        {match: "Telacy ",eliminations: "70", assists: "96", deaths: "24", damage: "19955", healing: "44679", mitigation: "4245"},
        {match: "Geekay Esports",eliminations: "77", assists: "94", deaths: "28", damage: "21386", healing: "53663", mitigation: "8106"},
        {match: "Al Qadsiah",eliminations: "63", assists: "77", deaths: "16", damage: "12943", healing: "22489", mitigation: "3293"},
        {match: "Geekay Esports",eliminations: "63", assists: "76", deaths: "22", damage: "15506", healing: "36721", mitigation: "3678"},
        {match: "Geekay Esports",eliminations: "55", assists: "64", deaths: "15", damage: "12329", healing: "22841", mitigation: "6924"},
        {match: "Al Qadsiah",eliminations: "40", assists: "55", deaths: "14", damage: "8162", healing: "20080", mitigation: "4059"},
    ],
    matchHistory: [
        {tournament: "Placeholder", tournament_icon:null, date: "1970-01-01T00:00:00", opponent: "N/A", team_score: 0, opponent_score: 0, ref_link:null},
    ],
    mapHistory: [
        {map: "Horizon Lunar Colony", won: 3, lost: 2},
        {map: "Lijiang Tower", won: 1, lost: 2},
        {map: "Nepal", won: 2, lost: 2},
        {map: "Horizon Lunar Colony", won: 3, lost: 2},
        {map: "Lijiang Tower", won: 1, lost: 2},
        {map: "Nepal", won: 2, lost: 2},
        {map: "Horizon Lunar Colony", won: 3, lost: 2},
        {map: "Lijiang Tower", won: 1, lost: 2},
        {map: "Nepal", won: 2, lost: 2},
        {map: "Horizon Lunar Colony", won: 3, lost: 2},
        {map: "Lijiang Tower", won: 1, lost: 2},
        {map: "Nepal", won: 2, lost: 2},
        {map: "Horizon Lunar Colony", won: 3, lost: 2},
        {map: "Lijiang Tower", won: 1, lost: 2},
        {map: "Nepal", won: 2, lost: 2}
    ]
};

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


// Deep merge function to combine API data with defaults
function mergeWithDefaults(data, defaults) {
    if (!data || typeof data !== 'object') return defaults;
    
    const merged = { ...defaults };
    
    if (data.playerName) merged.playerName = data.playerName;
    if (data.roleIcon) merged.roleIcon = data.roleIcon;
    if (data.teamName) merged.teamName = data.teamName;
    if (data.teamLogo) merged.teamLogo = data.teamLogo;
    if (data.avatarUrl) merged.avatarUrl = data.avatarUrl;
    
    if (data.stats) {
        if (data.stats.total) {
            merged.stats.total = { ...defaults.stats.total, ...data.stats.total };
        }
        if (data.stats.average) {
            merged.stats.average = { ...defaults.stats.average, ...data.stats.average };
        }
    }
    
    if (data.preferredHeroes && Array.isArray(data.preferredHeroes) && data.preferredHeroes.length > 0) {
        merged.preferredHeroes = data.preferredHeroes;
    }
    
    if (data.matchHistory && Array.isArray(data.matchHistory) && data.matchHistory.length > 0) {
        merged.matchHistory = data.matchHistory;
    }
    
    return merged;
}


// Fetch player data from API and populate the page
async function loadPlayerData() {
    console.log(window.location)
    let playerData = { ...DEFAULT_PLAYER_DATA };
    const data = await fetch("http://localhost:3000/api/players/18")
    .then(response => response.json())
    .then(data => {return data;})
    .catch(error => alert(error));

    playerData.matchHistory = data.matches
    console.log(playerData.matchHistory);
    playerData.statHistory = data.stats
    playerData.stats.total = data.total
    playerData.stats.average = data.avg
    console.log(playerData.stats)
    // Update player name (always has a value)
    const playerNameEl = document.getElementById('playerName');
    if (playerNameEl) playerNameEl.textContent = data.player_details.name;
    console.log(data.player_details.name)
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
    if (teamLogoEl) teamLogoEl.src = data.player_details.team_icon;
    
    
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
        if (el) el.textContent = formatCompactNumber(playerData.stats.total[totalStatKeys[index]]) ;
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
        if (el) el.textContent = formatCompactNumber(parseFloat(playerData.stats.average[avgStatKeys[index]]).toFixed(1));
    });
    
    // Update preferred heroes (always has 3 heroes)
    const heroesContainer = document.getElementById('heroesContainer');
    if (heroesContainer) {
        heroesContainer.innerHTML = ''; // Clear existing heroes
        
        data.heroes.forEach(hero => {
            const heroCard = document.createElement('div');
            heroCard.className = 'hero-card';
            heroCard.innerHTML = `
                <img src="${hero.icon}" alt="${hero.name}" class="hero-image">
                <div class="hero-name">${hero.name}</div>
            `;
            heroesContainer.appendChild(heroCard);
        });
    }

    const teamsContainer = document.getElementById('teamsContainer');
    if (teamsContainer) {
        teamsContainer.innerHTML = ''; // Clear existing heroes
        
        playerData.teamHistory.forEach(team => {
            const teamCard = document.createElement('div');
            teamCard.className = 'team-card';
            teamCard.innerHTML = `
                <img src="${team.imageUrl}" alt="${team.name}" class="team-image">
                <div class="team-name">${team.name}</div>
            `;
            teamsContainer.appendChild(teamCard);
        });
    }
    
    // Update match history table
    populateMatchesTable(playerData.matchHistory);
    
    // Initialize chart with match history
    initializeStatChart(playerData.statHistory);
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
        let date = new Date(match.date)
        console.log(match.tournament_icon)
        row.innerHTML = `
            
            <td class="icon-column"><img src=${match.tournament_icon} class="match-icon"></td>
            <td>${match.tournament}</td>
            <td><time datetime=${date}>${date.toDateString()}</time></td>
            <td class="icon-column"><img src=${match.opponent_icon} alt=${match.opponent} class="match-icon"></td>
            <td>${match.opponent}</td>
            <td>${match.team_score}:${match.opponent_score}</td>
            <td><a href=${match.ref_link}>🔗</a></td>
        `;
        console.log(match.tournament);
        tbody.appendChild(row);
    });
    
}


      


// Initialize and render the stats chart
function initializeStatChart(matches) {
    const ctx = document.getElementById('statsChart');
    if (!ctx || !matches || matches.length === 0) return;
    
    statChartData = matches;
    console.log(matches)
    renderStatChart('eliminations');
}

// Render chart for selected stat
function renderStatChart(statName) {
    console.log(`Rendering chart for stat: ${statName}`);
    if (!statChartData || statChartData.length === 0) return;
    console.log(statChartData[0].eliminations)
    const ctx = document.getElementById('statsChart');
    if (!ctx) return;
    
    // Calculate cumulative totals and running averages
    const labels = [];
    const Data = [];
    
    statChartData.forEach((match, index) => {
        labels.push(match.opponent || `Match ${index + 1}`);
        
        // Get stat value (parse if it's a string like "45.2k")
        let statValue = match[statName];
        console.log(statValue)
        console.log(`Match ${index + 1} - ${statName}:`, statValue);
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
                    borderColor: '#00ff41',
                    backgroundColor: 'rgba(0, 255, 65, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#00ff41',
                    pointBorderColor: '#00ff41',
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
    console.log(statSelect ? "Stat selector found" : "Stat selector not found");
    if (statSelect) {
        statSelect.addEventListener('change', (e) => {
            console.log(`Stat selected: ${e.target.value}`);
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
    console.log("hi"); 
    
    // Create new chart
    mapChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Won`,
                    data: wonData,
                    backgroundColor: '#00a429',
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
                    backgroundColor: '#a52700',
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
