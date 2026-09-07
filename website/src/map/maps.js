const mapsContainer = document.getElementById('mapsContainer');

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

function createMapLink(map) {
  const encodedName = encodeURIComponent(map.map_name);
  return `/maps/${encodedName}`;
}

function buildMapCard(map) {
  const imageUrl = resolveAssetPath(map.image || map.icon || '/content/images/maps/default.png');
  const imageHtml = imageUrl
    ? `<img src="${imageUrl}" alt="${map.map_name}" loading="lazy">`
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
  const page = document.querySelector('.map-list-page');
  page?.classList.add('page-loading');
  if (page && !page.querySelector('.loading-placeholder')) {
    page.insertAdjacentHTML('afterbegin', '<div class="loading-placeholder" role="status" aria-label="Loading"><span class="loading-spinner" aria-hidden="true"></span></div>');
  }
  try {
    let response = await fetch('/api/maps');

    const maps = await response.json();
    renderMaps(maps);
    page?.classList.remove('page-loading');
    page?.querySelector('.loading-placeholder')?.remove();
  } catch (error) {
    console.error('Failed to load map list', error);
    mapsContainer.innerHTML = '<p class="error-message">Unable to load map list at this time.</p>';
    page?.classList.remove('page-loading');
    page?.querySelector('.loading-placeholder')?.remove();
  }
}

window.addEventListener('DOMContentLoaded', loadMaps);
