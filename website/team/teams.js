const teamContainer = document.getElementById('teamsContainer');

function groupByRegion(teams) {
    return teams.reduce((acc, team) => {
        const region = team.region || 'Unknown';
        if (!acc[region]) acc[region] = [];
        acc[region].push(team);
        return acc;
    }, {});
}

function renderRosterTable(team) {
    const rows = team.players.map(player => {
        return `
            <tr>
                <td>${player.role}</td>
                <td><a href="/players/${encodeURIComponent(player.player_name)}">${player.player_name}</a></td>
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
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function getRegionIcon(region) {
    let normalized = String(region || 'GLOBAL').trim().toUpperCase();
    if (['KOREA', 'JAPAN', 'PACIFIC'].includes(normalized)){
        normalized = 'ASIA'
    }
    const supported = ['ASIA', 'CHINA', 'EMEA', 'GLOBAL', 'NA', 'SA'];
    const iconName = supported.includes(normalized) ? normalized : 'GLOBAL';
    return `/content/images/regions/${iconName}.webp`;
}

function getRegionClass(region) {
    const normalized = String(region || '').trim().toUpperCase();
    if (normalized === 'EMEA') return 'region-emea';
    if (normalized === 'NA') return 'region-na';
    if (normalized === 'CHINA') return 'region-china';
    if (['KOREA', 'JAPAN', 'PACIFIC'].includes(normalized)) return 'region-eastasia';
    return 'region-default';
}

function renderInactiveSection(inactiveTeams) {
    const teamCards = inactiveTeams.map(team => {
        const teamClass = getRegionClass(team.region || 'INACTIVE');
        return `
            <article class="team-box ${teamClass}">
                <div class="team-box-header">
                    <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                    <div>
                        <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                        <div class="team-box-subtitle">${team.region || 'Unknown'}</div>
                    </div>
                </div>
                ${renderRosterTable(team)}
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

function renderTeams(teams) {
    const activeTeams = teams.filter(team => team.team_active);
    const inactiveTeams = teams.filter(team => !team.team_active);
    const grouped = groupByRegion(activeTeams);
    const preferredOrder = ['EMEA', 'NA', 'KOREA', 'CHINA', 'JAPAN', 'PACIFIC', 'SA'];

    const regionSections = preferredOrder.reduce((sections, region) => {
        if (!grouped[region]) return sections;

        const regionTeams = grouped[region];
        const regionIcon = getRegionIcon(region);
        const regionClass = getRegionClass(region);
        const teamCards = regionTeams.map(team => {
            const teamClass = getRegionClass(team.region);
            return `
                <article class="team-box ${teamClass}">
                    <div class="team-box-header">
                        <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                        <div>
                            <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                            <div class="team-box-subtitle">${team.region}</div>
                        </div>
                    </div>
                    ${renderRosterTable(team)}
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
            const teamClass = getRegionClass(team.region);
            return `
                <article class="team-box ${teamClass}">
                    <div class="team-box-header">
                        <img src="../${team.team_icon || '/content/images/teams/default.png'}" alt="${team.team_name}">
                        <div>
                            <div class="team-box-title"><a href="/teams/${encodeURIComponent(team.team_name)}">${team.team_name}</a></div>
                            <div class="team-box-subtitle">${team.region}</div>
                        </div>
                    </div>
                    ${renderRosterTable(team)}
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
}

async function loadTeams() {
    try {
        const response = await fetch('/api/teams');
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
                const includePlayer = team.team_active ? Boolean(row.player_active) : true;
                if (includePlayer) {
                    team.players.push({
                        player_id: row.player_id,
                        player_name: row.player_name,
                        role: row.role
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

window.addEventListener('DOMContentLoaded', loadTeams);
