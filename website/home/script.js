function formatNumber(value) {
    const number = Number(value) || 0;
    return new Intl.NumberFormat('en-US').format(number);
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function resolveAssetPath(value) {
    const path = String(value || '').trim();
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
        return path;
    }
    return `/${path}`;
}

function renderRecentMatches(matches) {
    const tbody = document.getElementById('recentMatchesBody');
    if (!tbody) return;

    if (!matches.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No recent matches available.</td></tr>';
        return;
    }

    tbody.innerHTML = matches.map(match => {
        const matchup = `
            <div class="matchup-cell">
                <a href="/teams/${encodeURIComponent(match.team_1_name)}" class="team-pill">
                    ${match.team_1_icon ? `<img src="${resolveAssetPath(match.team_1_icon)}" alt="${match.team_1_name}" class="team-icon">` : ''}
                    <span>${match.team_1_name}</span>
                </a>
                <span>vs</span>
                <a href="/teams/${encodeURIComponent(match.team_2_name)}" class="team-pill">
                    ${match.team_2_icon ? `<img src="${resolveAssetPath(match.team_2_icon)}" alt="${match.team_2_name}" class="team-icon">` : ''}
                    <span>${match.team_2_name}</span>
                </a>
            </div>
        `;

        return `
            <tr>
                <td data-label="Tournament">
                    <span class="team-pill">
                        ${match.tournament_icon ? `<img src="${resolveAssetPath(match.tournament_icon)}" alt="${match.tournament}" class="team-icon">` : ''}
                        <span>${match.tournament || 'Unknown'}</span>
                    </span>
                </td>
                <td data-label="Date">${formatDate(match.date)}</td>
                <td data-label="Matchup">${matchup}</td>
                <td data-label="Score"><span class="score-badge">${match.team_1_score} - ${match.team_2_score}</span></td>
                <td data-label="Link">
                    ${match.ref_link ? `<a class="link-pill" href="${match.ref_link}" target="_blank" rel="noreferrer">↗</a>` : '<span class="table-empty">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

async function loadHomePage() {
    const matchesBody = document.getElementById('recentMatchesBody');

    try {
        const response = await fetch('/api/home');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        document.getElementById('totalMatches').textContent = formatNumber(data.totalMatches);
        document.getElementById('totalPlayerStats').textContent = formatNumber(data.totalPlayerStats);
        renderRecentMatches(Array.isArray(data.recentMatches) ? data.recentMatches : []);
    } catch (error) {
        console.warn('Failed to load homepage data', error);
        document.getElementById('totalMatches').textContent = '0';
        document.getElementById('totalPlayerStats').textContent = '0';
        if (matchesBody) {
            matchesBody.innerHTML = '<tr><td colspan="5" class="table-empty">Unable to load recent matches.</td></tr>';
        }
    }
}

document.addEventListener('DOMContentLoaded', loadHomePage);
