// Global chart instance
let statsChart = null;
let chartData = null;
let currentMapView = 'map';
let mapSectionCollapsed = false;
let playerMapData = [];
let tournamentOptions = [];
let selectedTournamentIds = [];
let tournamentMode = 'include';
let currentPlayerTeam = { name: '', icon: '' };
let recentMatches = [];
let recentMatchesPage = 0;
const RECENT_MATCHES_PAGE_SIZE = 10;

function formatCompactNumber(number) {
    if (!Number.isFinite(Number(number))) {
        return 0;
    }
    number = Number(number);
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

function resolveAssetPath(value) {
        const path = String(value || '').trim();
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
                return path;
        }
        return `/${path}`;
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
    let playerIdentifier = null;
    if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'players') {
        playerIdentifier = pathParts[1];
    } else {
        const params = new URLSearchParams(window.location.search);
        playerIdentifier = params.get('id');
    }

    const params = new URLSearchParams();
    if (playerIdentifier) {
        const numericIdentifier = Number(playerIdentifier);
        if (Number.isInteger(numericIdentifier) && numericIdentifier > 0) {
            params.set('playerId', String(numericIdentifier));
        } else {
            params.set('player', playerIdentifier);
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
            loadPlayerData();
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
    loadPlayerData();
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

function setMapSectionCollapsed(isCollapsed) {
    const section = document.querySelector('.map-graph-section');
    const toggle = document.querySelector('[data-map-collapse-toggle]');
    if (!section || !toggle) return;

    mapSectionCollapsed = isCollapsed;
    section.classList.toggle('is-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.textContent = isCollapsed ? 'Expand' : 'Collapse';
}

function toggleMapSection(event) {
    if (event) {
        event.stopPropagation();
    }
    setMapSectionCollapsed(!mapSectionCollapsed);
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

    const query = buildTournamentQuery();
    const data = await fetch(`/api/players/${encodeURIComponent(playerIdentifier)}?${query}`)
        .then(response => response.json())
        .then(data => { return data; })
        .catch(error => { alert(error); return null; });

    if (!data) return;

    const playerDetails = data.player_details || {};
    const primaryTeamName = String(playerDetails.team || '').trim();
    const primaryTeamIcon = String(playerDetails.team_icon || '').trim();

    window.top.document.title = playerDetails.name || 'Player Profile';


    // Update player name (always has a value)



    const playerNameEl = document.getElementById('playerName');
    if (playerNameEl) playerNameEl.textContent = playerDetails.name || 'Unknown Player';

    
    // Update role icon (always has a value)
    const roleIconEl = document.getElementById('roleIcon');
    if (roleIconEl) {
        if (playerDetails.role) {
            roleIconEl.src = `../content/images/roles/${playerDetails.role}.webp`;
            roleIconEl.style.display = '';
        } else {
            roleIconEl.removeAttribute('src');
            roleIconEl.style.display = 'none';
        }
    }
    
    // Update team name (can be missing)
    const teamNameEl = document.getElementById('teamName');
    if (teamNameEl) teamNameEl.textContent = primaryTeamName || 'No Team';
    
    // Update team logo (can be missing)
    const teamLogoEl = document.getElementById('teamLogo');
    if (teamLogoEl) {
        if (primaryTeamIcon) {
            teamLogoEl.src = resolveAssetPath(primaryTeamIcon);
            teamLogoEl.style.display = '';
        } else {
            teamLogoEl.removeAttribute('src');
            teamLogoEl.style.display = 'none';
        }
    }
    currentPlayerTeam = {
        name: primaryTeamName,
        icon: primaryTeamIcon
    };
    const owwcTeamContainerEl = document.getElementById('owwcTeamContainer');
    const owwcTeamLogoEl = document.getElementById('owwcTeamLogo');
    const owwcTeamLinkEl = document.getElementById('owwcTeamLink');
    const owwcTeamNameEl = document.getElementById('owwcTeamName');
    if (owwcTeamContainerEl && owwcTeamLogoEl && owwcTeamLinkEl && owwcTeamNameEl) {
        const owwcIcon = playerDetails.owwc_team_icon;
        const owwcTeamName = playerDetails.owwc_team_name;
        if (owwcIcon && owwcTeamName) {
            owwcTeamLogoEl.src = resolveAssetPath(owwcIcon);
            owwcTeamNameEl.textContent = owwcTeamName;
            owwcTeamLinkEl.href = `/teams/${encodeURIComponent(owwcTeamName)}`;
            owwcTeamContainerEl.classList.remove('is-hidden');
        } else {
            owwcTeamLogoEl.removeAttribute('src');
            owwcTeamNameEl.textContent = 'OWWC Team';
            owwcTeamLinkEl.href = '#';
            owwcTeamContainerEl.classList.add('is-hidden');
        }
    }

    // Make team logo/name link to the team page
    const teamLinkEl = document.getElementById('teamLink');
    if (teamLinkEl) {
        if (primaryTeamName) {
            teamLinkEl.href = `/teams/${encodeURIComponent(primaryTeamName)}`;
        } else {
            teamLinkEl.href = '#';
        }
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
    
    const totalData = data.total || {};
    totalStatIds.forEach((id, index) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCompactNumber(totalData[totalStatKeys[index]]);
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

    const avgData = data.avg || {};
    avgStatIds.forEach((id, index) => {
        const el = document.getElementById(id);
        const statValue = Number(avgData[avgStatKeys[index]]);
        if (el) el.textContent = Number.isFinite(statValue)
            ? formatCompactNumber(Number(statValue.toFixed(1)))
            : 0;
    });
    
    // Update preferred heroes (can be empty)
    const heroesContainer = document.getElementById('heroesContainer');
    if (heroesContainer) {
        heroesContainer.innerHTML = ''; // Clear existing heroes

        const heroes = Array.isArray(data.heroes)
            ? data.heroes.filter(hero => hero && (hero.name || hero.icon))
            : [];

        if (!heroes.length) {
            heroesContainer.innerHTML = '<div class="empty-chart-message">No preferred heroes available.</div>';
        }

        heroes.forEach(hero => {
            const heroCard = document.createElement('div');
            heroCard.className = 'hero-card';
            heroCard.innerHTML = `
                <img src="${resolveAssetPath(hero.icon)}" alt="${hero.name || 'Hero'}" class="hero-image">
                <div class="hero-name">${hero.name || 'Unknown Hero'}</div>
            `;
            heroesContainer.appendChild(heroCard);
        });
    }
    // Update recent matches table
    renderRecentMatches(data.matches || [], true);
    
    // Initialize chart with match history
    initializeStatChart(data.stats);
    initializeMapChart(data.maps);
}

function renderRecentMatches(matches, resetPage = false) {
    const tbody = document.getElementById('recentMatchesBody');
    if (!tbody) return;

    recentMatches = Array.isArray(matches) ? matches : [];
    if (resetPage) {
        recentMatchesPage = 0;
    }

    const pagination = document.getElementById('recentMatchesPagination');
    if (pagination) {
        pagination.remove();
    }

    if (!recentMatches.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No recent matches available.</td></tr>';
        return;
    }

    const startIndex = recentMatchesPage * RECENT_MATCHES_PAGE_SIZE;
    const pageMatches = recentMatches.slice(startIndex, startIndex + RECENT_MATCHES_PAGE_SIZE);

    tbody.innerHTML = pageMatches.map(match => {
        const date = match.date ? new Date(match.date) : null;
        const teamScore = Number(match.team_score);
        const opponentScore = Number(match.opponent_score);
        const matchTeamName = match.team_name || currentPlayerTeam.name || 'Team';
        const matchTeamIcon = match.team_icon || currentPlayerTeam.icon || '';
        const scoreClass = Number.isFinite(teamScore) && Number.isFinite(opponentScore)
            ? (teamScore > opponentScore ? 'score-badge is-win' : teamScore < opponentScore ? 'score-badge is-loss' : 'score-badge')
            : 'score-badge';
        const matchup = `
            <div class="matchup-cell">
                <a href="/teams/${encodeURIComponent(matchTeamName)}" class="team-pill">
                    ${matchTeamIcon ? `<img src="${resolveAssetPath(matchTeamIcon)}" alt="${matchTeamName}" class="team-icon">` : ''}
                    <span>${matchTeamName}</span>
                </a>
                <span>vs</span>
                <a href="/teams/${encodeURIComponent(match.opponent || '')}" class="team-pill">
                    ${match.opponent_icon ? `<img src="${resolveAssetPath(match.opponent_icon)}" alt="${match.opponent || 'Opponent'}" class="team-icon">` : ''}
                    <span>${match.opponent || ''}</span>
                </a>
            </div>
        `;

        return `
            <tr>
                <td data-label="Tournament">
                    <span class="team-pill">
                        ${match.tournament_icon ? `<img src="${resolveAssetPath(match.tournament_icon)}" alt="${match.tournament || ''}" class="team-icon">` : ''}
                        <span>${match.tournament || 'Unknown'}</span>
                    </span>
                </td>
                <td data-label="Date">${date ? date.toDateString() : ''}</td>
                <td data-label="Matchup">${matchup}</td>
                <td data-label="Score"><span class="${scoreClass}">${match.team_score || 0} - ${match.opponent_score || 0}</span></td>
                <td data-label="Link">
                    ${match.ref_link ? `<a class="link-pill" href="${match.ref_link}" target="_blank" rel="noreferrer">↗</a>` : '<span class="table-empty">-</span>'}
                </td>
            </tr>
        `;
    }).join('');

    renderRecentMatchesPagination();
}

function renderRecentMatchesPagination() {
    const existing = document.getElementById('recentMatchesPagination');
    if (existing) {
        existing.remove();
    }

    const totalPages = Math.ceil(recentMatches.length / RECENT_MATCHES_PAGE_SIZE);
    if (totalPages <= 1) {
        return;
    }

    const container = document.createElement('div');
    container.id = 'recentMatchesPagination';
    container.className = 'pagination';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'page-button';
    prevButton.textContent = '‹';
    prevButton.disabled = recentMatchesPage === 0;
    prevButton.addEventListener('click', () => {
        if (recentMatchesPage > 0) {
            recentMatchesPage -= 1;
            renderRecentMatches(recentMatches, false);
        }
    });

    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `${recentMatchesPage + 1} / ${totalPages}`;

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'page-button';
    nextButton.textContent = '›';
    nextButton.disabled = recentMatchesPage >= totalPages - 1;
    nextButton.addEventListener('click', () => {
        if (recentMatchesPage < totalPages - 1) {
            recentMatchesPage += 1;
            renderRecentMatches(recentMatches, false);
        }
    });

    container.appendChild(prevButton);
    container.appendChild(pageInfo);
    container.appendChild(nextButton);

    const tableShell = document.querySelector('.recent-section .table-shell');
    if (tableShell) {
        tableShell.insertAdjacentElement('afterend', container);
    }
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

function getWinRate(map) {
    return map.played ? map.won / map.played : 0;
}

function parseMapValue(value) {
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

        acc[mode].played += parseMapValue(map.played);
        acc[mode].won += parseMapValue(map.won);
        acc[mode].drawn += parseMapValue(map.drawn);
        acc[mode].lost += parseMapValue(map.lost);
        return acc;
    }, {});

    return sortMapsByWinRate(Object.values(grouped));
}

function renderMapResults() {
    const container = document.getElementById('mapChart');
    if (!container) return;

    if (!playerMapData.length) {
        container.innerHTML = '<p class="empty-chart-message">No map data available</p>';
        return;
    }

    const mapsToRender = currentMapView === 'mode'
        ? groupMapsByMode(playerMapData)
        : sortMapsByWinRate(playerMapData);

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

// Initialize and render the stats chart
function initializeMapChart(maps) {
    playerMapData = (maps || [])
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

// Load data when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadTournamentOptions();
    setFilterPanelOpen(false);
    setMapSectionCollapsed(false);

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
        const toggle = event.target.closest('[data-map-collapse-toggle]');
        if (!toggle) return;
        toggleMapSection(event);
    });

    loadPlayerData();
    setupChartSelector();
});
