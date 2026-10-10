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
const refreshBtn = document.getElementById("refreshBtn");

let stations = [];
let currentIndex = -1;
let currentPlayingUuid = null;
let activeBase = null;
let currentTab = "poland";
let currentLimit = 50;

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
  } catch (e) {}
}

function saveFavorites() {
  try {
    localStorage.setItem("carRadioFavorites", JSON.stringify(favourites));
  } catch (e) {}
}

function isFavorite(uuid) {
  return favourites.includes(uuid);
}

function toggleFavorite(uuid) {
  if (isFavorite(uuid)) {
    favourites = favourites.filter(x => x !== uuid);
  } else {
    favourites.push(uuid);
    const found = stations.find(s => s.stationuuid === uuid) || stationCache[uuid];
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
  if (!currentPlayingUuid) {
    favoriteCurrentBtn.textContent = "♡";
    favoriteCurrentBtn.classList.remove("active");
    return;
  }
  const active = isFavorite(currentPlayingUuid);
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

async function loadStationsData(append = false) {
  if (!append) {
    currentLimit = 50;
  }

  let data = [];
  if (currentTab === "poland") {
    sectionTitleEl.textContent = "Stacje z Polski";
    data = await fetchFromApi(buildSearchPath({
      countrycode: "PL",
      hidebroken: true,
      order: "clickcount",
      reverse: true,
      limit: currentLimit
    }));
  } else if (currentTab === "popular") {
    sectionTitleEl.textContent = "Popularne (Europa)";
    data = await fetchFromApi(buildSearchPath({
      tag: "music",
      continent: "Europe",
      hidebroken: true,
      order: "clickcount",
      reverse: true,
      limit: currentLimit
    }));
  } else if (currentTab === "filters") {
    sectionTitleEl.textContent = `Filtry: ${selectedTag.toUpperCase()}`;
    data = await fetchFromApi(buildSearchPath({
      tag: selectedTag,
      hidebroken: true,
      order: selectedSort,
      reverse: selectedReverse,
      limit: currentLimit
    }));
  } else if (currentTab === "search") {
    const term = document.getElementById("searchInput").value.trim();
    if (!term) return;
    sectionTitleEl.textContent = `Wyniki: ${term}`;
    data = await fetchFromApi(buildSearchPath({
      name: term,
      hidebroken: true,
      order: "clickcount",
      reverse: true,
      limit: currentLimit
    }));
  }

  stations = (Array.isArray(data) ? data : [])
    .filter(s => s.lastcheckok !== 0 && (s.url_resolved || s.url))
    .slice(0, currentLimit);
    
  renderStations();
}

function renderFavoritesBar() {
  if (!favourites.length) {
    favoritesBarEl.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:4px;">Brak ulubionych</div>';
    return;
  }

  const html = favourites.map(uuid => {
    const station = stationCache[uuid];
    if (!station) {
      return `
        <div class="fav-chip" data-uuid="${escapeHtml(uuid)}" draggable="true" title="Ładowanie...">
          <div class="fav-logo-fallback-bg">♪</div>
          <div class="fav-overlay"><div class="fav-name">Ładowanie...</div></div>
        </div>`;
    }
    
    const logoBg = station.favicon
      ? `<img class="fav-logo-bg" src="${escapeHtml(station.favicon)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="fav-logo-fallback-bg" style="display:none">♪</div>`
      : `<div class="fav-logo-fallback-bg">♪</div>`;
      
    const isActive = station.stationuuid === currentPlayingUuid;
    const name = station.name || "Stacja";

    return `
      <div class="fav-chip ${isActive ? "active" : ""}" data-uuid="${escapeHtml(uuid)}" draggable="true" title="${escapeHtml(name)}">
        ${logoBg}
        <div class="fav-overlay">
          <div class="fav-name">${escapeHtml(name)}</div>
        </div>
      </div>`;
  }).join("");

  favoritesBarEl.innerHTML = html;
}

favoritesBarEl.onclick = (e) => {
  if (wasDragging) return;
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

  let html = stations.map((s, index) => {
    const fav = isFavorite(s.stationuuid);
    const active = s.stationuuid === currentPlayingUuid;
    
    const logoBg = s.favicon
      ? `<img class="card-logo-bg" src="${escapeHtml(s.favicon)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="card-logo-fallback-bg" style="display:none">♪</div>`
      : `<div class="card-logo-fallback-bg">♪</div>`;
      
    const meta = [s.codec, s.bitrate ? `${s.bitrate} kbps` : ""].filter(Boolean).join(" • ");
    
    return `
      <div class="station-card ${active ? "active" : ""}" data-index="${index}">
        ${logoBg}
        <div class="card-overlay">
          <div class="card-copy">
            <div class="card-name" title="${escapeHtml(s.name || "Bez nazwy")}">${escapeHtml(s.name || "Bez nazwy")}</div>
            <div class="card-sub">${escapeHtml(meta || s.countrycode || "Radio")}</div>
          </div>
          <button class="card-fav ${fav ? "active" : ""}" data-fav="${escapeHtml(s.stationuuid)}" title="Ulubione">${fav ? "♥" : "♡"}</button>
        </div>
      </div>`;
  }).join("");

  html += `<button id="loadMoreBtn" class="load-more-btn">Załaduj kolejne 20 stacji (aktualnie: ${stations.length})</button>`;
  stationsEl.innerHTML = html;

  document.getElementById("loadMoreBtn").addEventListener("click", async () => {
    currentLimit += 20;
    const btn = document.getElementById("loadMoreBtn");
    btn.textContent = "Ładowanie...";
    try {
      await loadStationsData(true);
    } catch {
      btn.textContent = "Błąd pobierania. Spróbuj ponownie.";
    }
  });
}

stationsEl.onclick = (e) => {
  if (e.target.closest("#loadMoreBtn")) return;

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
  currentPlayingUuid = stations[index].stationuuid;
  prepareStationObject(stations[index], autoPlay);
}

function prepareFavoriteByUuid(uuid, autoPlay = false) {
  const station = stationCache[uuid];
  if (!station) return;
  
  currentPlayingUuid = uuid;
  let idx = stations.findIndex(s => s.stationuuid === uuid);
  if (idx !== -1) {
    currentIndex = idx;
  } else {
    currentIndex = -1;
  }
  prepareStationObject(station, autoPlay);
}

function prepareStationObject(station, autoPlay = false) {
  const url = station.url_resolved || station.url;
  if (!url) {
    nowPlayingEl.textContent = "Brak poprawnego adresu streamu";
    streamStatusEl.textContent = "Błąd adresu";
    return;
  }

  localStorage.setItem("carRadioLastPlayed", station.stationuuid);
  stationNameEl.textContent = station.name || "Bez nazwy";
  stationMetaEl.textContent = [station.countrycode, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""].filter(Boolean).join(" • ");
  
  if (station.favicon) {
    stationLogo.style.display = "block";
    stationLogo.src = station.favicon;
    stationLogoFallback.style.display = "none";
  } else {
    stationLogo.style.display = "none";
    stationLogoFallback.style.display = "flex";
  }

  updateCurrentFavorite();
  renderFavoritesBar();
  renderStations();

  streamStatusEl.textContent = "Ładowanie...";
  nowPlayingEl.textContent = "Ładowanie strumienia...";

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
    }).catch((err) => {
      setPlayIcon(false);
      streamStatusEl.textContent = "Zablokowane / Błąd HTTP";
      nowPlayingEl.textContent = "Kliknij Play, aby uruchomić";
      console.error("Autoplay error:", err);
    });
  } else {
    setPlayIcon(false);
    streamStatusEl.textContent = "Gotowe";
    nowPlayingEl.textContent = "Naciśnij Play";
  }
}

audio.addEventListener('waiting', () => {
  streamStatusEl.textContent = "Ładowanie / Buforowanie...";
  nowPlayingEl.textContent = "Pobieranie danych...";
});

audio.addEventListener('playing', () => {
  setPlayIcon(true);
  streamStatusEl.textContent = "Odtwarzanie";
  nowPlayingEl.textContent = "Na żywo";
});

audio.addEventListener('error', () => {
  setPlayIcon(false);
  streamStatusEl.textContent = "Błąd strumienia";
  nowPlayingEl.textContent = "Stacja niedostępna";
});

function setupMediaSession(station) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name || "Radio internetowe",
      artist: [station.countrycode, station.codec].filter(Boolean).join(" • ") || "Car Radio",
      album: "Internet Radio",
      artwork: station.favicon ? [{ src: station.favicon, sizes: '96x96 128x128 192x192 512x512', type: 'image/png' }] : []
    });

    navigator.mediaSession.setActionHandler('play', () => { audio.play(); setPlayIcon(true); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setPlayIcon(false); });
    navigator.mediaSession.setActionHandler('previoustrack', () => playFavoriteOffset(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => playFavoriteOffset(1));
  }
}

function playFavoriteOffset(offset) {
  if (!favourites.length) return;
  let favIndex = favourites.indexOf(currentPlayingUuid);
  if (favIndex === -1) {
    favIndex = 0;
  } else {
    favIndex = (favIndex + offset + favourites.length) % favourites.length;
  }
  prepareFavoriteByUuid(favourites[favIndex], true);
}

// ---- OBSŁUGA PRZECIĄGANIA I PRZEWIJANIA ULUBIONYCH ----
let draggedUuid = null;
let wasDragging = false;

favoritesBarEl.addEventListener("dragstart", (e) => {
  const chip = e.target.closest(".fav-chip");
  if (!chip) return;
  draggedUuid = chip.dataset.uuid;
  wasDragging = true;
  chip.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});

favoritesBarEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const targetChip = e.target.closest(".fav-chip");
  if (!targetChip || !draggedUuid) return;

  const targetUuid = targetChip.dataset.uuid;
  if (targetUuid === draggedUuid) return;

  const oldIndex = favourites.indexOf(draggedUuid);
  const newIndex = favourites.indexOf(targetUuid);

  if (oldIndex !== -1 && newIndex !== -1) {
    favourites.splice(oldIndex, 1);
    favourites.splice(newIndex, 0, draggedUuid);
    saveFavorites();
    renderFavoritesBar();
  }
});

favoritesBarEl.addEventListener("dragend", (e) => {
  const chip = e.target.closest(".fav-chip");
  if (chip) chip.classList.remove("dragging");
  draggedUuid = null;
  setTimeout(() => {
    wasDragging = false;
  }, 150);
});
// ------------------------------------------------------------------------

async function init() {
  audio.volume = 0.9;
  renderFavoritesBar();

  try {
    await loadStationsData(false);
  } catch (e) {
    stationsEl.innerHTML = '<div class="empty">Nie udało się pobrać stacji. Sprawdź internet.</div>';
  }

  if (lastPlayedUuid) {
    currentPlayingUuid = lastPlayedUuid;
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
  if (!audio.src || audio.src === window.location.href) {
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
      nowPlayingEl.textContent = "Na żywo";
      if (currentPlayingUuid && stationCache[currentPlayingUuid]) {
        countClick(stationCache[currentPlayingUuid]);
      }
    }).catch(() => {
      audio.load();
      audio.play().then(() => {
        setPlayIcon(true);
        streamStatusEl.textContent = "Odtwarzanie";
      }).catch(() => {});
    });
  } else {
    audio.pause();
    setPlayIcon(false);
    streamStatusEl.textContent = "Wstrzymano";
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  audio.pause();
  audio.currentTime = 0;
  setPlayIcon(false);
  streamStatusEl.textContent = "Zatrzymano";
  nowPlayingEl.textContent = "Gotowe do wznowienia";
});

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    streamStatusEl.textContent = "Odświeżanie...";
    location.reload();
  });
}

document.getElementById("nextBtn").addEventListener("click", () => playFavoriteOffset(1));
document.getElementById("prevBtn").addEventListener("click", () => playFavoriteOffset(-1));

favoriteCurrentBtn.addEventListener("click", () => {
  if (currentPlayingUuid) toggleFavorite(currentPlayingUuid);
});

document.querySelectorAll(".tabs .tab").forEach(tab => {
  if (tab.id === "refreshBtn") return;
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tabs .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    
    document.getElementById("searchPanel").classList.toggle("hidden", currentTab !== "search");
    document.getElementById("filterPanel").classList.toggle("hidden", currentTab !== "filters");

    try {
      if (currentTab === "search") {
        sectionTitleEl.textContent = "Wyszukaj stację";
        stationsEl.innerHTML = '<div class="empty">Wpisz nazwę stacji powyżej.</div>';
        resultCountEl.textContent = "0";
      } else {
        await loadStationsData(false);
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
      try { await loadStationsData(false); } catch {}
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
      try { await loadStationsData(false); } catch {}
    }
  });
});

document.getElementById("searchBtn").addEventListener("click", () => loadStationsData(false));
document.getElementById("searchInput").addEventListener("keydown", e => {
  if (e.key === "Enter") loadStationsData(false);
});

init();
