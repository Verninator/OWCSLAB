const columns = [
    { key: 'name', label: 'Player' },
    { key: 'role', label: 'Role' },
    { key: 'team', label: 'Team' },
    { key: 'eliminations', label: 'Eliminations' },
    { key: 'assists', label: 'Assists' },
    { key: 'deaths', label: 'Deaths' },
    { key: 'damage', label: 'Damage' },
    { key: 'healing', label: 'Healing' },
    { key: 'mitigation', label: 'Mitigation' }
];

const state = {
    total: { data: [], page: 1, sortKey: 'name', sortOrder: 'asc', pageSize: 20, searchTerm: '' },
    avg: { data: [], page: 1, sortKey: 'name', sortOrder: 'asc', pageSize: 20, searchTerm: '' }
};

function getRoleIconPath(role) {
    const normalizedRole = String(role || '').trim();
    if (!normalizedRole) return '';

    if (normalizedRole.toLowerCase() === 'dps') {
        return '/content/images/roles/DPS.webp';
    }

    const titleCaseRole = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1).toLowerCase();
    return `/content/images/roles/${encodeURIComponent(titleCaseRole)}.webp`;
}

function renderRoleCell(td, role) {
    const label = String(role || '').trim();
    const iconPath = getRoleIconPath(label);

    td.classList.add('role-cell');
    if (!iconPath) {
        td.textContent = label;
        return;
    }

    const icon = document.createElement('img');
    icon.src = iconPath;
    icon.alt = label;
    icon.title = label;
    icon.className = 'role-icon-cell';
    icon.addEventListener('error', () => {
        icon.replaceWith(document.createTextNode(label));
    });
    td.appendChild(icon);
}

function buildHeaderRow(container, datasetKey) {
    container.innerHTML = '';
    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column.label;
        th.dataset.key = column.key;
        th.classList.add('sortable');
        th.addEventListener('click', () => {
            const dataset = state[datasetKey];
            if (dataset.sortKey === column.key) {
                dataset.sortOrder = dataset.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                dataset.sortKey = column.key;
                dataset.sortOrder = 'asc';
            }
            renderTable(datasetKey);
        });
        const arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        if (state[datasetKey].sortKey === column.key) {
            arrow.textContent = state[datasetKey].sortOrder === 'asc' ? ' ▲' : ' ▼';
        }
        th.appendChild(arrow);
        container.appendChild(th);
    });
}

function compareValues(a, b, key, order) {
    const leftNumeric = Number(a[key]);
    const rightNumeric = Number(b[key]);
    const isNumeric = Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && a[key] !== '' && b[key] !== '';
    if (!isNumeric) {
        return order === 'asc' ? String(a[key]).localeCompare(String(b[key])) : String(b[key]).localeCompare(String(a[key]));
    }
    return order === 'asc' ? leftNumeric - rightNumeric : rightNumeric - leftNumeric;
}

function matchesSearch(row, searchTerm) {
    if (!searchTerm) return true;
    const term = searchTerm.trim().toLowerCase();
    return columns.some(column => {
        const value = row[column.key];
        return value != null && String(value).toLowerCase().includes(term);
    });
}

function renderTable(datasetKey) {
    const { data, page, pageSize, sortKey, sortOrder, searchTerm } = state[datasetKey];
    const filtered = data.filter(row => matchesSearch(row, searchTerm));
    const sorted = [...filtered].sort((a, b) => compareValues(a, b, sortKey, sortOrder));
    const start = (page - 1) * pageSize;
    const pageData = sorted.slice(start, start + pageSize);
    const body = document.getElementById(`${datasetKey}StatsBody`);
    body.innerHTML = '';
    pageData.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(column => {
            const td = document.createElement('td');
            if (column.key === 'name') {
                const link = document.createElement('a');
                link.href = `/players/${encodeURIComponent(row.name)}`;
                link.textContent = row.name;
                link.className = 'player-link';
                td.appendChild(link);
            } else if (column.key === 'role') {
                renderRoleCell(td, row.role);
            } else if (column.key === 'team') {
                const link = document.createElement('a');
                link.href = `/teams/${encodeURIComponent(row.team)}`;
                link.title = row.team;
                link.className = 'player-link team-icon-link';
                if (row.team_icon) {
                    const icon = document.createElement('img');
                    icon.src = "../" + row.team_icon;
                    icon.alt = row.team;
                    icon.className = 'team-icon-cell';
                    link.appendChild(icon);
                } else {
                    link.textContent = row.team;
                }
                td.appendChild(link);
            } else {
                td.textContent = row[column.key] ?? '';
            }
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
    renderPagination(datasetKey, filtered.length);
    buildHeaderRow(document.getElementById(`${datasetKey}StatsHeader`), `${datasetKey}`);
}

function renderPagination(datasetKey, filteredLength) {
    const { page, pageSize } = state[datasetKey];
    const container = document.getElementById(`${datasetKey}Pagination`);
    const pageCount = Math.max(1, Math.ceil(filteredLength / pageSize));
    let currentPage = page;
    if (currentPage > pageCount) currentPage = pageCount;
    state[datasetKey].page = currentPage;
    container.innerHTML = '';
    const createButton = (label, targetPage, disabled) => {
        const button = document.createElement('button');
        button.textContent = label;
        button.disabled = disabled;
        button.className = 'page-button';
        button.addEventListener('click', () => {
            state[datasetKey].page = targetPage;
            renderTable(datasetKey);
        });
        return button;
    };
    container.appendChild(createButton('Previous', Math.max(1, currentPage - 1), currentPage === 1));
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `Page ${currentPage} of ${pageCount}`;
    container.appendChild(pageInfo);
    container.appendChild(createButton('Next', Math.min(pageCount, page + 1), page === pageCount));
}

async function loadPlayers() {
    try {
        const response = await fetch('/api/players');
        const players = await response.json();
        state.total.data = players.map(player => ({
            name: player.name,
            role: player.role,
            team: player.team,
            team_icon: player.team_icon || '',
            eliminations: Number(player.total_eliminations) || 0,
            assists: Number(player.total_assists) || 0,
            deaths: Number(player.total_deaths) || 0,
            damage: Number(player.total_damage) || 0,
            healing: Number(player.total_healing) || 0,
            mitigation: Number(player.total_mitigation) || 0
        }));
        state.avg.data = players.map(player => ({
            name: player.name,
            role: player.role,
            team: player.team,
            team_icon: player.team_icon || '',
            eliminations: Number(player.avg_eliminations).toFixed(1) || 0,
            assists: Number(player.avg_assists).toFixed(1) || 0,
            deaths: Number(player.avg_deaths).toFixed(1) || 0,
            damage: Number(player.avg_damage).toFixed(1) || 0,
            healing: Number(player.avg_healing).toFixed(1) || 0,
            mitigation: Number(player.avg_mitigation).toFixed(1) || 0
        }));
        document.getElementById('totalMeta').textContent = `${players.length} players loaded`;
        document.getElementById('avgMeta').textContent = `${players.length} players loaded`;
        renderTable('total');
        renderTable('avg');
    } catch (error) {
        console.error('Failed to load players', error);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    buildHeaderRow(document.getElementById('totalStatsHeader'), 'total');
    buildHeaderRow(document.getElementById('avgStatsHeader'), 'avg');

    document.getElementById('totalSearch').addEventListener('input', event => {
        state.total.searchTerm = event.target.value;
        state.total.page = 1;
        renderTable('total');
    });

    document.getElementById('avgSearch').addEventListener('input', event => {
        state.avg.searchTerm = event.target.value;
        state.avg.page = 1;
        renderTable('avg');
    });

    loadPlayers();
});
