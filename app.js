const API_BASES = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

const audio = document.getElementById("audio");
const stationsEl = document.getElementById("stations");
const favoritesBarEl = document.getElementById("favoritesBar");
const stationNameEl = document.getElementById("stationName");
const stationMetaEl = document.getElementById("stationMeta");
const nowPlayingEl = document.getElementById("nowPlaying");
const streamStatusEl = document.getElementById("streamStatus");
const stationLogo = document.getElementById("stationLogo");
const stationLogoFallback = document.getElementById("stationLogoFallback");
const resultCountEl = document.getElementById("resultCount");
const sectionTitleEl = document.getElementById("sectionTitle");
const connectionStatusEl = document.getElementById("connectionStatus");
const playBtn = document.getElementById("playBtn");
const playIconSvg = document.getElementById("playIconSvg");
const favoriteCurrentBtn = document.getElementById("favoriteCurrent");

let stations = [];
let currentIndex = -1;
let activeBase = null;
let currentTab = "poland";
let favourites = JSON.parse(localStorage.getItem("carRadioFavorites") || "[]");
let stationCache = JSON.parse(localStorage.getItem("carRadioCache") || "{}");
let lastPlayedUuid = localStorage.getItem("carRadioLastPlayed") || null;

let selectedTag = "music";
let selectedSort = "clickcount";
let selectedReverse = true;

function setPlayIcon(isPlaying) {
  playIconSvg.innerHTML = isPlaying 
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' 
    : '<path d="M8 5v14l11-7z"/>';
}

function setStatus(text, good = false) {
  connectionStatusEl.textContent = text;
  connectionStatusEl.style.color = good ? "var(--good)" : "";
}

function saveCache() {
  try {
    localStorage.setItem("carRadioCache", JSON.stringify(stationCache));
  } catch (e) {
    console.warn("Cache storage quota exceeded", e);
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("carRadioFavorites", JSON.stringify(favourites));
  } catch (e) {
    console.warn("Favorites storage quota exceeded", e);
  }
}

function isFavorite(uuid) {
  return favourites.includes(uuid);
}

function toggleFavorite(uuid) {
  if (isFavorite(uuid)) {
    favourites = favourites.filter(x => x !== uuid);
  } else {
    favourites.push(uuid);
    const found = stations.find(s => s.stationuuid === uuid);
    if (found) {
      stationCache[uuid] = found;
      saveCache();
    }
  }
  saveFavorites();
  renderFavoritesBar();
  renderStations();
  updateCurrentFavorite();
}

function updateCurrentFavorite() {
  if (currentIndex < 0 || !stations[currentIndex]) {
    favoriteCurrentBtn.textContent = "♡";
    favoriteCurrentBtn.classList.remove("active");
    return;
  }
  const active = isFavorite(stations[currentIndex].stationuuid);
  favoriteCurrentBtn.textContent = active ? "♥" : "♡";
  favoriteCurrentBtn.classList.toggle("active", active);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function fetchFromApi(path) {
  let lastError = null;
  const shuffled = [...API_BASES].sort(() => Math.random() - 0.5);
  for (const base of shuffled) {
    try {
      const res = await fetch(base + path, {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      activeBase = base;
      setStatus(`Połączono: ${base.replace("https://", "")}`, true);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  setStatus("Brak połączenia z API");
  throw lastError || new Error("API unavailable");
}

function buildSearchPath(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  return "/json/stations/search?" + q.toString();
}

async function loadPoland() {
  sectionTitleEl.textContent = "Stacje z Polski";
  const data = await fetchFromApi(buildSearchPath({
    countrycode: "PL",
    hidebroken: true,
    order: "clickcount",
    reverse: true,
    limit: 50
  }));
  stations = (Array.isArray(data) ? data : []).filter(s => s.lastcheckok !== 0 && (s.url_resolved || s.url));
  renderStations();
}

async function loadPopular() {
  sectionTitleEl.textContent = "Popularne (Europa)";
  const data = await fetchFromApi(buildSearchPath({
    tag: "music",
    continent: "Europe",
    hidebroken: true,
    order: "clickcount",
    reverse: true,
    limit: 50
  }));
  stations = (Array.isArray(data) ? data : []).filter(s => s.lastcheckok !== 0 && (s.url_resolved || s.url));
  renderStations();
}

async function loadFilteredStations() {
  sectionTitleEl.textContent = `Filtry: ${selectedTag.toUpperCase()}`;
  const data = await fetchFromApi(buildSearchPath({
    tag: selectedTag,
    hidebroken: true,
    order: selectedSort,
    reverse: selectedReverse,
    limit: 50
  }));
  stations = (Array.isArray(data) ? data : []).filter(s => s.lastcheckok !== 0 && (s.url_resolved || s.url));
  renderStations();
}

async function searchStations() {
  const term = document.getElementById("searchInput").value.trim();
  if (!term) return;
  sectionTitleEl.textContent = `Wyniki: ${term}`;
  const data = await fetchFromApi(buildSearchPath({
    name: term,
    hidebroken: true,
    order: "clickcount",
    reverse: true,
    limit: 50
  }));
  stations = (Array.isArray(data) ? data : []).filter(s => s.lastcheckok !== 0 && (s.url_resolved || s.url));
  renderStations();
}

function renderFavoritesBar() {
  if (!favourites.length) {
    favoritesBarEl.innerHTML = '<div style="color:var(--muted);font-size:12px;display:flex;align-items:center;padding:0 4px;">Brak ulubionych</div>';
    return;
  }

  const html = favourites.map(uuid => {
    const station = stationCache[uuid];
    if (!station) return `<div class="fav-chip" data-uuid="${escapeHtml(uuid)}" title="Ładowanie..."><span class="fav-chip-fallback">♪</span></div>`;
    
    const logo = station.favicon
      ? `<img src="${escapeHtml(station.favicon)}" alt="" onerror="this.outerHTML='<span class=&quot;fav-chip-fallback&quot;>♪</span>'">`
      : `<span class="fav-chip-fallback">♪</span>`;
      
    const isActive = currentIndex >= 0 && stations[currentIndex]?.stationuuid === uuid;

    return `
      <div class="fav-chip ${isActive ? "active" : ""}" data-uuid="${escapeHtml(uuid)}" title="${escapeHtml(station.name || "Stacja")}">
        ${logo}
      </div>`;
  }).join("");

  favoritesBarEl.innerHTML = html;
}

favoritesBarEl.onclick = (e) => {
  const chip = e.target.closest(".fav-chip");
  if (!chip) return;
  const uuid = chip.dataset.uuid;
  if (uuid) prepareFavoriteByUuid(uuid, true);
};

function renderStations() {
  stations.forEach(s => {
    if (s.stationuuid) stationCache[s.stationuuid] = s;
  });
  saveCache();
  renderFavoritesBar();

  resultCountEl.textContent = stations.length;
  if (!stations.length) {
    stationsEl.innerHTML = '<div class="empty">Brak stacji spełniających kryteria.</div>';
    return;
  }

  const html = stations.map((s, index) => {
    const fav = isFavorite(s.stationuuid);
    const active = currentIndex === index;
    const logo = s.favicon
      ? `<img class="card-logo" src="${escapeHtml(s.favicon)}" alt="" onerror="this.outerHTML='<div class=&quot;card-logo-fallback&quot;>♪</div>'">`
      : `<div class="card-logo-fallback">♪</div>`;
    const meta = [s.countrycode, s.codec, s.bitrate ? `${s.bitrate} kbps` : ""].filter(Boolean).join(" • ");
    return `
      <div class="station-card ${active ? "active" : ""}" data-index="${index}">
        ${logo}
        <div class="card-copy">
          <div class="card-name">${escapeHtml(s.name || "Bez nazwy")}</div>
          <div class="card-sub">${escapeHtml(meta || s.tags || "Radio internetowe")}</div>
        </div>
        <div class="card-actions">
          <button class="card-fav ${fav ? "active" : ""}" data-fav="${escapeHtml(s.stationuuid)}" title="Ulubione">${fav ? "♥" : "♡"}</button>
        </div>
      </div>`;
  }).join("");

  stationsEl.innerHTML = html;
}

stationsEl.onclick = (e) => {
  const favBtn = e.target.closest(".card-fav");
  if (favBtn) {
    e.stopPropagation();
    toggleFavorite(favBtn.dataset.fav);
    return;
  }

  const card = e.target.closest(".station-card");
  if (card) {
    prepareStation(Number(card.dataset.index), true);
  }
};

async function countClick(station) {
  if (!activeBase || !station?.stationuuid) return;
  try {
    fetch(`${activeBase}/json/url/${encodeURIComponent(station.stationuuid)}`, {
      headers: { "Accept": "application/json" }
    }).catch(() => {});
  } catch {}
}

function prepareStation(index, autoPlay = false) {
  if (!stations[index]) return;
  currentIndex = index;
  prepareStationObject(stations[index], autoPlay);
}

function prepareFavoriteByUuid(uuid, autoPlay = false) {
  const station = stationCache[uuid];
  if (!station) return;
  
  let idx = stations.findIndex(s => s.stationuuid === uuid);
  if (idx !== -1) {
    currentIndex = idx;
  } else {
    stations.unshift(station);
    currentIndex = 0;
  }
  prepareStationObject(station, autoPlay);
}

function prepareStationObject(station, autoPlay = false) {
  const url = station.url_resolved || station.url;
  if (!url) {
    nowPlayingEl.textContent = "Brak poprawnego adresu streamu";
    return;
  }

  localStorage.setItem("carRadioLastPlayed", station.stationuuid);
  stationNameEl.textContent = station.name || "Bez nazwy";
  stationMetaEl.textContent = [station.countrycode, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" • ");
  updateLogo(station.favicon);
  updateCurrentFavorite();
  renderStations();

  audio.pause();
  audio.src = url;
  audio.load();

  if (autoPlay) {
    audio.play().then(() => {
      setPlayIcon(true);
      streamStatusEl.textContent = "Odtwarzanie";
      nowPlayingEl.textContent = "Na żywo";
      countClick(station);
      setupMediaSession(station);
    }).catch(() => {
      setPlayIcon(false);
      streamStatusEl.textContent = "Wstrzymano";
      nowPlayingEl.textContent = "Gotowe do odtwarzania";
    });
  } else {
    setPlayIcon(false);
    streamStatusEl.textContent = "Gotowe do startu";
    nowPlayingEl.textContent = "Gotowe do odtwarzania";
  }
}

function setupMediaSession(station) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name || "Radio internetowe",
      artist: [station.countrycode, station.codec].filter(Boolean).join(" • ") || "Car Radio",
      album: "Internet Radio",
      artwork: station.favicon ? [{ src: station.favicon, sizes: '96x96 128x128 192x192 512x512', type: 'image/png' }] : []
    });

    navigator.mediaSession.setActionHandler('play', () => { audio.play(); setPlayIcon(true); streamStatusEl.textContent = "Odtwarzanie"; });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setPlayIcon(false); streamStatusEl.textContent = "Wstrzymano"; });
    navigator.mediaSession.setActionHandler('previoustrack', () => playFavoriteOffset(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => playFavoriteOffset(1));
  }
}

function updateLogo(url) {
  if (!url) {
    stationLogo.style.display = "none";
    stationLogoFallback.style.display = "flex";
    return;
  }
  stationLogo.src = url;
  stationLogo.onload = () => {
    stationLogo.style.display = "block";
    stationLogoFallback.style.display = "none";
  };
  stationLogo.onerror = () => {
    stationLogo.style.display = "none";
    stationLogoFallback.style.display = "flex";
  };
}

function playFavoriteOffset(offset) {
  if (!favourites.length) return;
  
  let currentUuid = null;
  if (currentIndex >= 0 && stations[currentIndex]) {
    currentUuid = stations[currentIndex].stationuuid;
  }
  
  let favIndex = favourites.indexOf(currentUuid);
  if (favIndex === -1) {
    favIndex = 0;
  } else {
    favIndex = (favIndex + offset + favourites.length) % favourites.length;
  }
  
  prepareFavoriteByUuid(favourites[favIndex], true);
}

async function init() {
  audio.volume = 0.9;
  renderFavoritesBar();

  try {
    await loadPoland();
  } catch (e) {
    stationsEl.innerHTML = '<div class="empty">Nie udało się pobrać stacji. Sprawdź internet i spróbuj ponownie.</div>';
  }

  if (lastPlayedUuid) {
    if (stationCache[lastPlayedUuid]) {
      prepareFavoriteByUuid(lastPlayedUuid, false);
    } else {
      fetchFromApi(`/json/stations/byuuid?uuids=${lastPlayedUuid}`).then(data => {
        if (Array.isArray(data) && data.length > 0) {
          stationCache[lastPlayedUuid] = data[0];
          saveCache();
          prepareFavoriteByUuid(lastPlayedUuid, false);
        }
      }).catch(() => {});
    }
  } else if (favourites.length > 0 && stationCache[favourites[0]]) {
    prepareFavoriteByUuid(favourites[0], false);
  }

  if (favourites.length > 0) {
    const missingUuids = favourites.filter(uuid => !stationCache[uuid]);
    if (missingUuids.length > 0) {
      fetchFromApi(`/json/stations/byuuid?uuids=${missingUuids.join(",")}`).then(data => {
        if (Array.isArray(data)) {
          data.forEach(s => stationCache[s.stationuuid] = s);
          saveCache();
          renderFavoritesBar();
        }
      }).catch(() => {});
    }
  }
}

playBtn.addEventListener("click", () => {
  if (!audio.src) {
    if (favourites.length > 0) {
      prepareFavoriteByUuid(favourites[0], true);
    } else if (stations.length > 0) {
      prepareStation(0, true);
    }
    return;
  }
  if (audio.paused) {
    audio.play().then(() => {
      setPlayIcon(true);
      streamStatusEl.textContent = "Odtwarzanie";
      if (currentIndex >= 0 && stations[currentIndex]) {
        countClick(stations[currentIndex]);
      }
    }).catch(() => {});
  } else {
    audio.pause();
    setPlayIcon(false);
    streamStatusEl.textContent = "Wstrzymano";
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  setPlayIcon(false);
  streamStatusEl.textContent = "Zatrzymano";
  nowPlayingEl.textContent = "Gotowe do odtwarzania";
});

document.getElementById("nextBtn").addEventListener("click", () => playFavoriteOffset(1));
document.getElementById("prevBtn").addEventListener("click", () => playFavoriteOffset(-1));

favoriteCurrentBtn.addEventListener("click", () => {
  if (currentIndex >= 0 && stations[currentIndex]) toggleFavorite(stations[currentIndex].stationuuid);
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    
    document.getElementById("searchPanel").classList.toggle("hidden", currentTab !== "search");
    document.getElementById("filterPanel").classList.toggle("hidden", currentTab !== "filters");

    try {
      if (currentTab === "poland") await loadPoland();
      if (currentTab === "popular") await loadPopular();
      if (currentTab === "filters") await loadFilteredStations();
      if (currentTab === "search") {
        sectionTitleEl.textContent = "Wyszukaj stację";
        stationsEl.innerHTML = '<div class="empty">Wpisz nazwę stacji powyżej.</div>';
        resultCountEl.textContent = "0";
      }
    } catch {
      stationsEl.innerHTML = '<div class="empty">Błąd pobierania danych.</div>';
    }
  });
});

document.querySelectorAll("#tagFilters .filter-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("#tagFilters .filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTag = btn.dataset.tag;
    if (currentTab === "filters") {
      try { await loadFilteredStations(); } catch {}
    }
  });
});

document.querySelectorAll("#popularityFilters .filter-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll("#popularityFilters .filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedSort = btn.dataset.sort;
    selectedReverse = btn.dataset.reverse === "true";
    if (currentTab === "filters") {
      try { await loadFilteredStations(); } catch {}
    }
  });
});

document.getElementById("searchBtn").addEventListener("click", searchStations);
document.getElementById("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") searchStations();
});

init();