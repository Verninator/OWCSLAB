const mapsContainer = document.getElementById('mapsContainer');

function createMapLink(map) {
  const encodedName = encodeURIComponent(map.map_name);
  return `/maps/${encodedName}`;
}

function buildMapCard(map) {
  const imageUrl = map.image || map.icon || '/content/images/maps/default.png';
  const imageHtml = imageUrl
    ? `<img src="../${imageUrl}" alt="${map.map_name}" loading="lazy">`
    : '<div class="map-image-missing">Image unavailable</div>';

  return `
    <a class="map-card-link" href="${createMapLink(map)}">
      <section class="map-list-card">
        <div class="map-card-meta">
          <div class="map-card-image">
            ${imageHtml}
            <div class="map-card-label">
              <h2>${map.map_name}</h2>
              <span>${map.mode}</span>
            </div>
          </div>
        </div>
      </section>
    </a>
  `;
}

function renderMaps(maps) {
  const grouped = maps.reduce((acc, map) => {
    const mode = map.mode || 'Unknown';
    if (!acc[mode]) acc[mode] = [];
    acc[mode].push(map);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([mode, modeMaps]) => {
    const cards = modeMaps.map(buildMapCard).join('');
    return `
      <section class="map-mode-group">
        <div class="map-mode-header">
          <h2>${mode}</h2>
          <span>${modeMaps.length} maps</span>
        </div>
        <div class="map-card-grid">${cards}</div>
      </section>
    `;
  }).join('');

  mapsContainer.innerHTML = sections;
}

async function loadMaps() {
  try {
    let response = await fetch('/api/maps');

    const maps = await response.json();
    renderMaps(maps);
  } catch (error) {
    console.error('Failed to load map list', error);
    mapsContainer.innerHTML = '<p class="error-message">Unable to load map list at this time.</p>';
  }
}

window.addEventListener('DOMContentLoaded', loadMaps);
