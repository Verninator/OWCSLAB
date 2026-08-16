const teamContainer = document.getElementById('teamsContainer');
let currentCircuit = 'owcs';

function normalizeRegionForCircuit(region, circuit = currentCircuit) {
    const normalized = String(region || '').trim().toUpperCase();
    if (circuit !== 'owwc') return normalized || 'Unknown';

    if (normalized === 'EMEA') return 'EMEA';
    if (['NA', 'SA', 'AMERICAS'].includes(normalized)) return 'AMERICAS';
    if (['ASIA', 'CHINA', 'KOREA', 'JAPAN', 'PACIFIC'].includes(normalized)) return 'ASIA';
    return normalized || 'Unknown';
}

function groupByRegion(teams) {
    return teams.reduce((acc, team) => {
        const region = normalizeRegionForCircuit(team.region);
        if (!acc[region]) acc[region] = [];
        acc[region].push(team);
        return acc;
    }, {});
}

function renderRosterTable(team) {
    function getRoleIconPath(role) {
        const normalizedRole = String(role || '').trim();
        if (!normalizedRole) return '';

        if (normalizedRole.toLowerCase() === 'dps') {
            return '/content/images/roles/DPS.webp';
        }

        const titleCaseRole = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1).toLowerCase();
        return `/content/images/roles/${encodeURIComponent(titleCaseRole)}.webp`;
    }

    function renderRoleCell(role) {
        const label = String(role || '').trim();
        const iconPath = getRoleIconPath(label);

        if (!iconPath) return '';

        return `<img src="${iconPath}" alt="${label}" title="${label}" class="roster-role-icon" data-role="${label}" onerror="this.replaceWith(document.createTextNode(this.dataset.role || ''))">`;
    }

    function normalizeTeamIconPath(icon) {
        const value = String(icon || '').trim();
        if (!value) return '';
        if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
            return value;
        }
        return `/${value}`;
    }

    function getRelatedTeam(player) {
        if (currentCircuit === 'owwc') {
            return {
                name: player.primary_team_name || '',
                icon: player.primary_team_icon || ''
            };
        }

        return {
            name: player.national_team_name || '',
            icon: player.national_team_icon || ''
        };
    }

    function renderRelatedTeamCell(player) {
        const relatedTeam = getRelatedTeam(player);
        const teamName = String(relatedTeam.name || '').trim();
        const iconPath = normalizeTeamIconPath(relatedTeam.icon);

        if (!teamName && !iconPath) {
            return '<span class="related-team-empty">-</span>';
        }

        if (!iconPath) {
            return `<span class="related-team-text">${teamName || '-'}</span>`;
        }

        const href = teamName ? `/teams/${encodeURIComponent(teamName)}` : '#';
        const title = teamName || 'No related team';
        return `
            <a href="${href}" class="related-team-link" ${teamName ? '' : 'aria-disabled="true" tabindex="-1"'}>
                <img src="${iconPath}" alt="${title}" title="${title}" class="related-team-icon" data-fallback="${title}" onerror="this.replaceWith(document.createTextNode(this.dataset.fallback || '-'))">
            </a>
        `;
    }

    const rows = team.players.map(player => {
        return `
            <tr>
                <td class="role-cell">${renderRoleCell(player.role)}</td>
                <td><a href="/players/${encodeURIComponent(player.player_name)}">${player.player_name}</a></td>
                <td class="related-team-cell">${renderRelatedTeamCell(player)}</td>
            </tr>
        `;
    }).join('');

    if (!rows) {
        return `<div class="team-box-empty">No roster members available.</div>`;
    }

    return `
        <table class="team-roster">
            <thead>
                <tr>
                    <th>Role</th>
                    <th>Name</th>
                    <th>${currentCircuit === 'owwc' ? 'Team' : 'National Team'}</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function getRegionIcon(region) {
    if (currentCircuit === 'owwc') {
        const owwcRegion = normalizeRegionForCircuit(region, 'owwc');
        const supportedOwwc = ['EMEA', 'AMERICAS', 'ASIA', 'GLOBAL'];
        const owwcIcon = supportedOwwc.includes(owwcRegion) ? owwcRegion : 'GLOBAL';
        return `/content/images/regions/owwc/${owwcIcon}.webp`;
    }

    let normalized = String(region || 'GLOBAL').trim().toUpperCase();
    if (normalized === 'AMERICAS') {
        normalized = 'NA';
    }
    if (['KOREA', 'JAPAN', 'PACIFIC'].includes(normalized)) {
        normalized = 'ASIA';
    }
    const supported = ['ASIA', 'CHINA', 'EMEA', 'GLOBAL', 'NA', 'SA'];
    const iconName = supported.includes(normalized) ? normalized : 'GLOBAL';
    return `/content/images/regions/${iconName}.webp`;
}

function getRegionClass(region) {
    const normalized = String(region || '').trim().toUpperCase();
    if (normalized === 'EMEA') return 'region-emea';
    if (normalized === 'NA') return 'region-na';
    if (normalized === 'AMERICAS') return 'region-americas';
    if (normalized === 'ASIA') return 'region-asia';
    if (normalized === 'CHINA') return 'region-china';
    if (['KOREA', 'JAPAN', 'PACIFIC'].includes(normalized)) return 'region-eastasia';
    return 'region-default';
}

function renderInactiveSection(inactiveTeams) {
    const teamCards = inactiveTeams.map(team => {
        const displayRegion = normalizeRegionForCircuit(team.region);
        const teamClass = getRegionClass(displayRegion || 'INACTIVE');
        return `
            <article class="team-box ${teamClass}">
                <div class="team-box-header">
                    <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                    <div>
                        <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                        <div class="team-box-subtitle">${displayRegion || 'Unknown'}</div>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    return `
        <section class="region-group region-inactive">
            <div class="region-box-header">
                <img src="/content/images/regions/GLOBAL.webp" alt="Inactive" class="region-icon">
                <div class="region-heading">
                    <h2>Inactive</h2>
                    <span>${inactiveTeams.length} teams</span>
                </div>
            </div>
            <div class="team-box-grid">
                ${teamCards}
            </div>
        </section>
    `;
}

function setupRosterToggles() {
    const toggleButtons = teamContainer.querySelectorAll('[data-roster-toggle]');
    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const card = button.closest('.team-box');
            if (!card) return;

            const rosterContent = card.querySelector('[data-roster-content]');
            if (!rosterContent) return;

            const isHidden = rosterContent.classList.toggle('is-hidden');
            button.textContent = isHidden ? 'Show roster' : 'Hide roster';
            button.setAttribute('aria-expanded', String(!isHidden));
        });
    });
}

function renderTeams(teams) {
    const activeTeams = teams.filter(team => team.team_active);
    const inactiveTeams = teams.filter(team => !team.team_active);
    const grouped = groupByRegion(activeTeams);
    const preferredOrder = currentCircuit === 'owwc'
        ? ['EMEA', 'AMERICAS', 'ASIA']
        : ['EMEA', 'NA', 'KOREA', 'CHINA', 'JAPAN', 'PACIFIC', 'SA'];

    const regionSections = preferredOrder.reduce((sections, region) => {
        if (!grouped[region]) return sections;

        const regionTeams = grouped[region];
        const regionIcon = getRegionIcon(region);
        const regionClass = getRegionClass(region);
        const teamCards = regionTeams.map(team => {
            const displayRegion = normalizeRegionForCircuit(team.region);
            const teamClass = getRegionClass(displayRegion);
            return `
                <article class="team-box ${teamClass}">
                    <div class="team-box-header">
                        <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                        <div>
                            <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                            <div class="team-box-subtitle">${displayRegion}</div>
                        </div>
                    </div>
                    <button type="button" class="roster-toggle" data-roster-toggle aria-expanded="false">Show roster</button>
                    <div class="team-roster-content is-hidden" data-roster-content>
                        ${renderRosterTable(team)}
                    </div>
                </article>
            `;
        }).join('');

        sections.push(`
            <section class="region-group ${regionClass}">
                <div class="region-box-header">
                    <img src="${regionIcon}" alt="${region}" class="region-icon">
                    <div class="region-heading">
                        <h2>${region}</h2>
                        <span>${regionTeams.length} teams</span>
                    </div>
                </div>
                <div class="team-box-grid">
                    ${teamCards}
                </div>
            </section>
        `);

        delete grouped[region];
        return sections;
    }, []);

    const remainingSections = Object.entries(grouped).map(([region, regionTeams]) => {
        const regionIcon = getRegionIcon(region);
        const regionClass = getRegionClass(region);
        const teamCards = regionTeams.map(team => {
            const displayRegion = normalizeRegionForCircuit(team.region);
            const teamClass = getRegionClass(displayRegion);
            return `
                <article class="team-box ${teamClass}">
                    <div class="team-box-header">
                        <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                        <div>
                            <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                            <div class="team-box-subtitle">${displayRegion}</div>
                        </div>
                    </div>
                    <button type="button" class="roster-toggle" data-roster-toggle aria-expanded="false">Show roster</button>
                    <div class="team-roster-content is-hidden" data-roster-content>
                        ${renderRosterTable(team)}
                    </div>
                </article>
            `;
        }).join('');

        return `
            <section class="region-group ${regionClass}">
                <div class="region-box-header">
                    <img src="${regionIcon}" alt="${region}" class="region-icon">
                    <div class="region-heading">
                        <h2>${region}</h2>
                        <span>${regionTeams.length} teams</span>
                    </div>
                </div>
                <div class="team-box-grid">
                    ${teamCards}
                </div>
            </section>
        `;
    });

    const sections = [...regionSections, ...remainingSections];
    if (inactiveTeams.length) {
        sections.push(renderInactiveSection(inactiveTeams));
    }

    teamContainer.innerHTML = sections.join('');
    setupRosterToggles();
}

async function loadTeams() {
    try {
        const response = await fetch(`/api/teams?circuit=${encodeURIComponent(currentCircuit)}`);
        const teams = await response.json();
        const reduced = teams.reduce((acc, row) => {
            let team = acc.find(item => item.team_id === row.team_id);
            if (!team) {
                team = {
                    team_id: row.team_id,
                    team_name: row.team_name,
                    region: row.region,
                    team_icon: row.team_icon,
                    team_active: Boolean(row.team_active),
                    players: []
                };
                acc.push(team);
            }
            if (row.player_id) {
                const includePlayer = Boolean(row.player_active);
                if (includePlayer || currentCircuit == "owwc"){
                    team.players.push({
                        player_id: row.player_id,
                        player_name: row.player_name,
                        role: row.role,
                        primary_team_name: row.player_primary_team_name,
                        primary_team_icon: row.player_primary_team_icon,
                        national_team_name: row.player_national_team_name,
                        national_team_icon: row.player_national_team_icon
                    });
                }
            }
            return acc;
        }, []);

        renderTeams(reduced);
    } catch (error) {
        console.error('Failed to fetch teams', error);
        teamContainer.innerHTML = '<p class="error-message">Unable to load teams at this time.</p>';
    }
}

function setupCircuitTabs() {
    const tabs = document.querySelectorAll('[data-circuit]');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const selected = tab.dataset.circuit;
            if (!selected || selected === currentCircuit) return;
            currentCircuit = selected;

            tabs.forEach(item => {
                item.classList.toggle('is-active', item.dataset.circuit === currentCircuit);
            });

            loadTeams();
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    setupCircuitTabs();
    loadTeams();
});
