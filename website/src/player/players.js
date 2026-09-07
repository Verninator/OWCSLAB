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
    avg: { data: [], page: 1, sortKey: 'name', sortOrder: 'asc', pageSize: 20, searchTerm: '' },
    activeView: 'total',
    filters: {
        tournamentIds: [],
        stages: [],
        regions: [],
        teamIds: [],
        roles: [],
        circuits: []
    },
    filterOptions: {
        tournaments: [],
        stages: [],
        regions: [],
        teams: [],
        roles: [],
        facets: [],
        circuits: []
    }
};

const filterDefinitions = [
    { key: 'tournamentIds', recordKey: 'tournament_id', containerId: 'tournamentFilterOptions', getValue: option => String(option.tournament_id), getLabel: option => option.name },
    { key: 'stages', recordKey: 'stage', containerId: 'stageFilterOptions', getValue: option => String(option), getLabel: option => `Stage ${option}` },
    { key: 'regions', recordKey: 'region', containerId: 'regionFilterOptions', getValue: option => String(option), getLabel: option => String(option) },
    { key: 'teamIds', recordKey: 'team_id', containerId: 'teamFilterOptions', getValue: option => String(option.team_id), getLabel: option => option.name },
    { key: 'roles', recordKey: 'role', containerId: 'roleFilterOptions', getValue: option => String(option), getLabel: option => String(option) },
    { key: 'circuits', recordKey: 'circuit', containerId: 'circuitFilterOptions', getValue: option => String(option), getLabel: option => String(option) }
];

function getViewLabel(datasetKey) {
    return datasetKey === 'avg' ? 'average' : 'total';
}

function setFilterPanelOpen(isOpen) {
    const panel = document.getElementById('statsFilterPanel');
    const toggle = document.getElementById('statsFilterToggle');
    if (!panel || !toggle) return;

    panel.classList.toggle('is-open', isOpen);
    panel.classList.toggle('is-collapsed', !isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.classList.toggle('is-active', isOpen);
    document.body.classList.toggle('filters-overlay-open', isOpen);
}

function toggleFilterPanel(event) {
    if (event) {
        event.stopPropagation();
    }
    const panel = document.getElementById('statsFilterPanel');
    if (!panel) return;
    setFilterPanelOpen(!panel.classList.contains('is-open'));
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

function getRoleIconPath(role) {
    const normalizedRole = String(role || '').trim();
    if (!normalizedRole) return '';

    return `/content/images/roles/${encodeURIComponent(normalizedRole.toLowerCase())}.webp`;
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
    const visibleMatch = columns.some(column => {
        const value = row[column.key];
        return value != null && String(value).toLowerCase().includes(term);
    });
    if (visibleMatch) return true;
    if (row.role_search != null) {
        const roleSearch = row.role_search;
        if (String(roleSearch).toLowerCase().includes(term))
            return String(roleSearch).toLowerCase().includes(term)
    }

    const teamSearch = row.team_search;
    return teamSearch != null && String(teamSearch).toLowerCase().includes(term);
}

function renderTable(datasetKey) {
    const { data, page, pageSize, sortKey, sortOrder, searchTerm } = state[datasetKey];
    const filtered = data.filter(row => matchesSearch(row, searchTerm));
    const sorted = [...filtered].sort((a, b) => compareValues(a, b, sortKey, sortOrder));
    const start = (page - 1) * pageSize;
    const pageData = sorted.slice(start, start + pageSize);
    const body = document.getElementById('statsBody');
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
                    icon.src = resolveAssetPath(row.team_icon);
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
    buildHeaderRow(document.getElementById('statsHeader'), datasetKey);
}



function renderPagination(datasetKey, filteredLength) {
    const { page, pageSize } = state[datasetKey];
    const container = document.getElementById('statsPagination');
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
    container.appendChild(createButton('Next', Math.min(pageCount, currentPage + 1), currentPage === pageCount));
}

function setActiveView(datasetKey) {
    state.activeView = datasetKey;
    const label = getViewLabel(datasetKey);

    document.getElementById('statsTitle').textContent = `${label.charAt(0).toUpperCase()}${label.slice(1)} Stats`;
    document.getElementById('statsSearchLabel').textContent = `Search ${label} stats`;

    const searchInput = document.getElementById('statsSearch');
    searchInput.value = state[datasetKey].searchTerm;

    document.querySelectorAll('.view-toggle-button[data-view]').forEach(button => {
        const isActive = button.dataset.view === datasetKey;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    renderTable(datasetKey);
}

function buildPlayersQueryString() {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length) {
            params.set(key, value.join(','));
        }
    });
    return params.toString();
}

function renderFilterOptions() {
    const matchesFiltersExcludingKey = (record, excludedFilterKey) => {
        return filterDefinitions.every(definition => {
            if (definition.key === excludedFilterKey) {
                return true
            }

            const selected = state.filters[definition.key] || [];
            if (!selected.length) return true;

            const recordValue = String(record[definition.recordKey] ?? '');
            return selected.includes(recordValue);
        });
    };

    const getAvailableValuesForKey = (filterKey) => {
        const definition = filterDefinitions.find(entry => entry.key === filterKey);
        if (!definition) return new Set();

        const matches = state.filterOptions.facets.filter(record => matchesFiltersExcludingKey(record, filterKey));
        return new Set(matches.map(record => String(record[definition.recordKey] ?? '')).filter(Boolean));
    };

    const renderCheckboxGroup = (containerId, filterKey, options, mapOption) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!options.length) {
            container.innerHTML = '<div class="empty-chart-message">No options available</div>';
            return;
        }

        const selected = new Set(state.filters[filterKey] || []);
        const availableValues = getAvailableValuesForKey(filterKey);
        container.innerHTML = '';
        options.forEach(option => {
            const mapped = mapOption(option);
            const value = String(mapped.value);
            const isChecked = selected.has(value);
            const isAvailable = availableValues.has(value);
            if (!isAvailable && !isChecked) {
                return;
            }

            const label = document.createElement('label');
            label.className = `filter-option${isChecked ? ' is-active' : ''}`;
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.filterKey = filterKey;
            input.value = value;
            input.checked = isChecked;

            const text = document.createElement('span');
            text.textContent = mapped.label;

            label.appendChild(input);
            label.appendChild(text);
            container.appendChild(label);
        });

        if (!container.children.length) {
            container.innerHTML = '<div class="empty-chart-message">No options available</div>';
        }
    };

    renderCheckboxGroup('tournamentFilterOptions', 'tournamentIds', state.filterOptions.tournaments, option => ({ value: option.tournament_id, label: option.name }));
    renderCheckboxGroup('stageFilterOptions', 'stages', state.filterOptions.stages, option => ({ value: option, label: `Stage ${option}` }));
    renderCheckboxGroup('regionFilterOptions', 'regions', state.filterOptions.regions, option => ({ value: option, label: option }));
    renderCheckboxGroup('teamFilterOptions', 'teamIds', state.filterOptions.teams, option => ({ value: option.team_id, label: option.name }));
    renderCheckboxGroup('roleFilterOptions', 'roles', state.filterOptions.roles, option => ({ value: option, label: option }));
    renderCheckboxGroup('circuitFilterOptions', 'circuits', state.filterOptions.circuits, option => ({ value: option, label: option }));
}

async function loadFilterOptions() {
    try {
        const response = await fetch('/api/players/filters');
        const options = await response.json();
        state.filterOptions.tournaments = Array.isArray(options.tournaments) ? options.tournaments : [];
        state.filterOptions.stages = Array.isArray(options.stages) ? options.stages : [];
        state.filterOptions.regions = Array.isArray(options.regions) ? options.regions : [];
        state.filterOptions.teams = Array.isArray(options.teams) ? options.teams : [];
        state.filterOptions.roles = Array.isArray(options.roles) ? options.roles : [];
        state.filterOptions.circuits = Array.isArray(options.circuits) ? options.circuits : [];
        state.filterOptions.facets = Array.isArray(options.facets) ? options.facets : [];
        renderFilterOptions();
    } catch (error) {
        console.error('Failed to load player filter options', error);
    }
}

async function loadPlayers() {
    const page = document.querySelector('.page-content');
    page?.classList.add('page-loading');
    if (page && !page.querySelector('.loading-placeholder')) {
            page.insertAdjacentHTML('afterbegin', '<div class="loading-placeholder" role="status" aria-label="Loading"><span class="loading-spinner" aria-hidden="true"></span></div>');
    }
    try {
        const query = buildPlayersQueryString();
        const response = await fetch(query ? `/api/players?${query}` : '/api/players');
        const players = await response.json();
        state.total.data = players.map(player => ({
            name: player.name,
            role: player.role,
            role_search: (player.role === 'Dps') ? 'Damage' : null,
            team: player.team,
            team_icon: player.team_icon || '',
            team_search: [player.team, player.primary_team_name, player.national_team_name].filter(Boolean).join(' '),
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
            role_search: (player.role === 'Dps') ? ['Dps', 'Damage'].filter(Boolean).join(' ') : null,            
            team: player.team,
            team_icon: player.team_icon || '',
            team_search: [player.team, player.primary_team_name, player.national_team_name].filter(Boolean).join(' '),
            eliminations: Number(player.avg_eliminations).toFixed(1) || 0,
            assists: Number(player.avg_assists).toFixed(1) || 0,
            deaths: Number(player.avg_deaths).toFixed(1) || 0,
            damage: Number(player.avg_damage).toFixed(1) || 0,
            healing: Number(player.avg_healing).toFixed(1) || 0,
            mitigation: Number(player.avg_mitigation).toFixed(1) || 0
        }));
        state.total.page = 1;
        state.avg.page = 1;
        document.getElementById('statsMeta').textContent = `${players.length} players loaded`;
        setActiveView(state.activeView);
        page?.classList.remove('page-loading');
        page?.querySelector('.loading-placeholder')?.remove();
    } catch (error) {
        console.error('Failed to load players', error);
        page?.classList.remove('page-loading');
        page?.querySelector('.loading-placeholder')?.remove();
        document.getElementById('statsBody').innerHTML = '<tr><td colspan="8" class="table-empty">Unable to load player data.</td></tr>';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    buildHeaderRow(document.getElementById('statsHeader'), state.activeView);

    const filterToggle = document.getElementById('statsFilterToggle');
    if (filterToggle) {
        filterToggle.addEventListener('click', event => {
            toggleFilterPanel(event);
        });
    }

    const statsFilters = document.getElementById('statsFilters');
    if (statsFilters) {
        statsFilters.addEventListener('change', event => {
            if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'checkbox') {
                return;
            }

            const filterKey = event.target.dataset.filterKey;
            if (!filterKey || !Array.isArray(state.filters[filterKey])) return;

            const value = String(event.target.value);
            const selected = new Set(state.filters[filterKey]);
            if (event.target.checked) {
                selected.add(value);
            } else {
                selected.delete(value);
            }

            state.filters[filterKey] = [...selected];
            renderFilterOptions();
            loadPlayers();
        });
    }

    document.querySelectorAll('.filter-section-toggle').forEach(button => {
        const field = button.closest('.filter-field');
        if (!field) return;

        button.addEventListener('click', event => {
            event.stopPropagation();
            const isCollapsed = field.classList.contains('is-collapsed');
            field.classList.toggle('is-collapsed', !isCollapsed);
            button.setAttribute('aria-expanded', String(isCollapsed));
        });
    });

    if (statsFilters) {
        statsFilters.addEventListener('click', event => {
            event.stopPropagation();
        });
    }

    document.getElementById('clearFiltersButton').addEventListener('click', () => {
        state.filters = {
            tournamentIds: [],
            stages: [],
            regions: [],
            teamIds: [],
            roles: [],
            circuits: []
        };
        renderFilterOptions();
        loadPlayers();
    });

    document.addEventListener('click', event => {
        const panel = document.getElementById('statsFilterPanel');
        if (!panel || !panel.classList.contains('is-open')) return;
        if (!panel.contains(event.target)) {
            setFilterPanelOpen(false);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            setFilterPanelOpen(false);
        }
    });

    document.querySelectorAll('.view-toggle-button[data-view]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.view === state.activeView));
        button.addEventListener('click', () => {
            setActiveView(button.dataset.view);
        });
    });

    document.getElementById('statsSearch').addEventListener('input', event => {
        const datasetKey = state.activeView;
        state[datasetKey].searchTerm = event.target.value;
        state[datasetKey].page = 1;
        renderTable(datasetKey);
    });

    loadFilterOptions().then(() => loadPlayers());
});
