const API_BASES = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info"
];

const audio = document.getElementById("audio");
const stationsEl = document.getElementById("stations");
const favoritesBarEl = document.getElementById("favoritesBar");
const mobileFavoritesBarEl = document.getElementById("mobileFavoritesBar");
const mobileFavoritesPanelEl = document.getElementById("mobileFavoritesPanel");
const bigPictureFavoritesEl = document.getElementById("bigPictureFavorites");
const stationNameEl = document.getElementById("stationName");
const stationMetaEl = document.getElementById("stationMeta");
const nowPlayingEl = document.getElementById("nowPlaying");
const streamStatusEl = document.getElementById("streamStatus");
const stationLogo = document.getElementById("stationLogo");
const stationLogoFallback = document.getElementById("stationLogoFallback");
const playerBackdrop = document.getElementById("playerBackdrop");
const resultCountEl = document.getElementById("resultCount");
const sectionTitleEl = document.getElementById("sectionTitle");
const connectionStatusEl = document.getElementById("connectionStatus");
const playBtn = document.getElementById("playBtn");
const playIconSvg = document.getElementById("playIconSvg");
const favoriteCurrentBtn = document.getElementById("favoriteCurrent");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDialog = document.getElementById("settingsDialog");
const settingsCloseBtn = document.getElementById("settingsClose");
const settingsColumnButtons = document.querySelectorAll("[data-columns]");
const settingsFavoriteColumnButtons = document.querySelectorAll("[data-favorites-columns]");
const themeColorInput = document.getElementById("themeColorInput");
const resetThemeBtn = document.getElementById("resetThemeBtn");
const categoryTabHeightInput = document.getElementById("categoryTabHeight");
const categoryTabHeightValue = document.getElementById("categoryTabHeightValue");
const bigPictureFavoriteBtn = document.getElementById("bigPictureFavorite");
const refreshBtn = document.getElementById("refreshBtn");
const bigPicture = document.getElementById("bigPicture");
const bigPictureBackdrop = document.getElementById("bigPictureBackdrop");
const bigPictureLogo = document.getElementById("bigPictureLogo");
const bigPictureLogoFallback = document.getElementById("bigPictureLogoFallback");
const bigPictureName = document.getElementById("bigPictureName");
const bigPictureMeta = document.getElementById("bigPictureMeta");
const bigPictureStatus = document.getElementById("bigPictureStatus");
const bigPicturePlayIcon = document.getElementById("bigPicturePlayIcon");

let stations = [];
let currentIndex = -1;
let currentPlayingUuid = null;
let currentStreamUrl = null;
let activeBase = null;
let currentTab = "poland";
let currentLimit = 50;
let reconnectEnabled = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let bufferWatchdog = null;

let favourites = JSON.parse(localStorage.getItem("carRadioFavorites") || "[]");
let stationCache = JSON.parse(localStorage.getItem("carRadioCache") || "{}");
let lastPlayedUuid = localStorage.getItem("carRadioLastPlayed") || null;
const BIG_PICTURE_STORAGE_KEY = "carRadioBigPicture";

let selectedTag = "music";
let selectedSort = "clickcount";
let selectedReverse = true;
const STATION_COLUMNS_STORAGE_KEY = "carRadioStationColumns";
const FAVORITE_COLUMNS_STORAGE_KEY = "carRadioFavoriteColumns";
const CATEGORY_TAB_HEIGHT_STORAGE_KEY = "carRadioCategoryTabHeight";
const THEME_COLOR_STORAGE_KEY = "carRadioThemeColor";
const DEFAULT_THEME_COLOR = "#0b0d10";

function hexToRgb(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  return match ? match.slice(1).map(value => parseInt(value, 16)) : null;
}

function blendHex(baseHex, tintRgb, strength) {
  const baseRgb = hexToRgb(baseHex);
  const blended = baseRgb.map((channel, index) =>
    Math.round(channel * (1 - strength) + tintRgb[index] * strength)
  );
  return `#${blended.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function applyThemeColor(color, persist = false) {
  const rgb = hexToRgb(color);
  if (!rgb) return;

  const linearRgb = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linearRgb[0] * 0.2126 + linearRgb[1] * 0.7152 + linearRgb[2] * 0.0722;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--accent", color);
  rootStyle.setProperty("--accent-contrast", luminance > 0.179 ? "#111" : "#fff");
  rootStyle.setProperty("--bg", blendHex("#0b0d10", rgb, 0.24));
  rootStyle.setProperty("--panel", blendHex("#141920", rgb, 0.28));
  rootStyle.setProperty("--panel2", blendHex("#1c232d", rgb, 0.34));
  rootStyle.setProperty("--line", blendHex("#28313d", rgb, 0.4));
  rootStyle.setProperty("--muted", blendHex("#9aa4b2", rgb, 0.12));
  themeColorInput.value = color;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) themeColorMeta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (persist) localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
}

function getDefaultStationColumns() {
  const columns = getComputedStyle(document.documentElement).getPropertyValue("--station-columns").trim();
  return Number(columns) || 3;
}

function updateStationColumnSelection() {
  const customColumns = document.documentElement.style.getPropertyValue("--station-columns-custom").trim();
  const currentColumns = Number(customColumns) || getDefaultStationColumns();
  settingsColumnButtons.forEach(button => {
    const active = Number(button.dataset.columns) === currentColumns;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setStationColumns(columns, persist = true) {
  if (![2, 3, 4, 5].includes(columns)) return;
  document.documentElement.style.setProperty("--station-columns-custom", String(columns));
  if (persist) localStorage.setItem(STATION_COLUMNS_STORAGE_KEY, String(columns));
  updateStationColumnSelection();
}

function updateFavoriteColumnSelection() {
  const customColumns = document.documentElement.style.getPropertyValue("--favorites-columns-custom").trim();
  const responsiveColumns = getComputedStyle(document.documentElement).getPropertyValue("--favorites-columns").trim();
  const currentColumns = Number(customColumns) || Number(responsiveColumns) || 3;
  settingsFavoriteColumnButtons.forEach(button => {
    const active = Number(button.dataset.favoritesColumns) === currentColumns;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setFavoriteColumns(columns, persist = true) {
  if (![2, 3, 4, 5].includes(columns)) return;
  document.documentElement.style.setProperty("--favorites-columns-custom", String(columns));
  if (persist) localStorage.setItem(FAVORITE_COLUMNS_STORAGE_KEY, String(columns));
  updateFavoriteColumnSelection();
}

function setCategoryTabHeight(height, persist = true) {
  const safeHeight = Math.max(36, Math.min(64, Number(height) || 46));
  document.documentElement.style.setProperty("--category-tab-height-custom", `${safeHeight}px`);
  categoryTabHeightInput.value = String(safeHeight);
  categoryTabHeightValue.value = `${safeHeight} px`;
  categoryTabHeightValue.textContent = `${safeHeight} px`;
  if (persist) localStorage.setItem(CATEGORY_TAB_HEIGHT_STORAGE_KEY, String(safeHeight));
}

function initializeSettings() {
  const savedColumns = Number(localStorage.getItem(STATION_COLUMNS_STORAGE_KEY));
  if ([2, 3, 4, 5].includes(savedColumns)) setStationColumns(savedColumns, false);
  else updateStationColumnSelection();

  const savedFavoriteColumns = Number(localStorage.getItem(FAVORITE_COLUMNS_STORAGE_KEY));
  if ([2, 3, 4, 5].includes(savedFavoriteColumns)) setFavoriteColumns(savedFavoriteColumns, false);
  else updateFavoriteColumnSelection();

  const savedTabHeight = Number(localStorage.getItem(CATEGORY_TAB_HEIGHT_STORAGE_KEY));
  setCategoryTabHeight(savedTabHeight || getComputedStyle(document.documentElement).getPropertyValue("--category-tab-height").replace("px", ""), false);

  const savedColor = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
  applyThemeColor(savedColor || themeColorInput.value);
}

function setPlayIcon(isPlaying) {
  const icon = isPlaying
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' 
    : '<path d="M8 5v14l11-7z"/>';
  playIconSvg.innerHTML = icon;
  bigPicturePlayIcon.innerHTML = icon;
}

function setBigPictureStatus(text) {
  bigPictureStatus.textContent = text;
}

function setBigPictureVisible(visible) {
  bigPicture.classList.toggle("hidden", !visible);
  bigPicture.setAttribute("aria-hidden", String(!visible));
  localStorage.setItem(BIG_PICTURE_STORAGE_KEY, String(visible));
}

function cancelReconnect() {
  reconnectEnabled = false;
  clearTimeout(reconnectTimer);
  clearTimeout(bufferWatchdog);
  reconnectTimer = null;
  bufferWatchdog = null;
}

function scheduleReconnect() {
  if (!reconnectEnabled || !currentStreamUrl || reconnectTimer) return;

  clearTimeout(bufferWatchdog);
  bufferWatchdog = null;
  const delay = Math.min(1000 * (2 ** reconnectAttempts), 30000);
  reconnectAttempts += 1;
  const seconds = Math.ceil(delay / 1000);
  const message = `Utracono połączenie. Ponawianie za ${seconds} s...`;
  streamStatusEl.textContent = `Ponawianie za ${seconds} s`;
  nowPlayingEl.textContent = message;
  setBigPictureStatus(message);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!reconnectEnabled || !currentStreamUrl) return;
    streamStatusEl.textContent = "Ponawianie połączenia...";
    nowPlayingEl.textContent = "Łączenie ze stacją...";
    setBigPictureStatus("Łączenie ze stacją...");
    audio.src = currentStreamUrl;
    audio.load();
    audio.play().catch(scheduleReconnect);
  }, delay);
}

function formatStationName(name) {
  const characters = Array.from(String(name || "Bez nazwy"));
  return characters.length > 40 ? `${characters.slice(0, 37).join("")}...` : characters.join("");
}

function syncBigPictureStation(station) {
  bigPictureName.textContent = formatStationName(station.name);
  bigPictureMeta.textContent = [station.countrycode, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""]
    .filter(Boolean).join(" • ") || "Radio internetowe";
  if (station.favicon) {
    playerBackdrop.src = station.favicon;
    playerBackdrop.classList.remove("hidden");
    bigPictureBackdrop.src = station.favicon;
    bigPictureBackdrop.classList.remove("hidden");
    bigPictureLogo.src = station.favicon;
    bigPictureLogo.classList.remove("hidden");
    bigPictureLogoFallback.classList.add("hidden");
  } else {
    playerBackdrop.removeAttribute("src");
    playerBackdrop.classList.add("hidden");
    bigPictureBackdrop.removeAttribute("src");
    bigPictureBackdrop.classList.add("hidden");
    bigPictureLogo.removeAttribute("src");
    bigPictureLogo.classList.add("hidden");
    bigPictureLogoFallback.classList.remove("hidden");
  }
}

playerBackdrop.addEventListener("error", () => playerBackdrop.classList.add("hidden"));
bigPictureBackdrop.addEventListener("error", () => bigPictureBackdrop.classList.add("hidden"));

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
    bigPictureFavoriteBtn.textContent = "♡";
    favoriteCurrentBtn.classList.remove("active");
    bigPictureFavoriteBtn.classList.remove("active");
    return;
  }
  const active = isFavorite(currentPlayingUuid);
  favoriteCurrentBtn.textContent = active ? "♥" : "♡";
  bigPictureFavoriteBtn.textContent = active ? "♥" : "♡";
  favoriteCurrentBtn.classList.toggle("active", active);
  bigPictureFavoriteBtn.classList.toggle("active", active);
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
    const emptyMessage = '<div style="color:var(--muted);font-size:12px;padding:4px;">Brak ulubionych</div>';
    favoritesBarEl.innerHTML = emptyMessage;
    mobileFavoritesBarEl.innerHTML = emptyMessage;
    bigPictureFavoritesEl.innerHTML = emptyMessage;
    return;
  }

  const html = favourites.map(uuid => {
    const station = stationCache[uuid];
    if (!station) {
      return `
        <div class="fav-chip" data-uuid="${escapeHtml(uuid)}" draggable="true" title="Ładowanie...">
          <div class="fav-logo-fallback-bg" aria-hidden="true"></div>
          <div class="fav-overlay"><div class="fav-name">Ładowanie...</div></div>
        </div>`;
    }
    
    const logoBg = station.favicon
      ? `<img class="fav-logo-bg" src="${escapeHtml(station.favicon)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="fav-logo-fallback-bg" style="display:none" aria-hidden="true"></div>`
      : `<div class="fav-logo-fallback-bg" aria-hidden="true"></div>`;
      
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
  mobileFavoritesBarEl.innerHTML = html;
  bigPictureFavoritesEl.innerHTML = html;
  mobileFavoritesBarEl.querySelectorAll(".fav-chip").forEach(chip => {
    chip.draggable = false;
  });
  bigPictureFavoritesEl.querySelectorAll(".fav-chip").forEach(chip => {
    chip.draggable = false;
  });
}

favoritesBarEl.onclick = (e) => {
  if (wasDragging) return;
  const chip = e.target.closest(".fav-chip");
  if (!chip) return;
  const uuid = chip.dataset.uuid;
  if (uuid) prepareFavoriteByUuid(uuid, true);
};

mobileFavoritesBarEl.onclick = (e) => {
  const chip = e.target.closest(".fav-chip");
  if (!chip) return;
  const uuid = chip.dataset.uuid;
  if (uuid) prepareFavoriteByUuid(uuid, true);
};

bigPictureFavoritesEl.onclick = (e) => {
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
    const active = s.stationuuid === currentPlayingUuid;
    
    const logoBg = s.favicon
      ? `<img class="card-logo-bg" src="${escapeHtml(s.favicon)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="card-logo-fallback-bg" style="display:none" aria-hidden="true"></div>`
      : `<div class="card-logo-fallback-bg" aria-hidden="true"></div>`;
      
    const meta = [
      s.codec ? `<span class="card-codec">${escapeHtml(s.codec)}</span>` : "",
      s.bitrate ? `<span class="card-bitrate">${escapeHtml(s.bitrate)} kbps</span>` : ""
    ].filter(Boolean).join('<span class="card-bitrate-separator"> • </span>');
    const stationMeta = meta || escapeHtml(s.countrycode || "Radio");
    
    return `
      <div class="station-card ${active ? "active" : ""}" data-index="${index}">
        ${logoBg}
        <div class="card-overlay">
          <div class="card-copy">
            <div class="card-name" title="${escapeHtml(s.name || "Bez nazwy")}">${escapeHtml(s.name || "Bez nazwy")}</div>
            <div class="card-sub">${stationMeta}</div>
          </div>
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

  cancelReconnect();
  reconnectAttempts = 0;
  currentStreamUrl = url;
  reconnectEnabled = autoPlay;
  localStorage.setItem("carRadioLastPlayed", station.stationuuid);
  stationNameEl.textContent = formatStationName(station.name);
  stationMetaEl.textContent = [station.countrycode, station.codec, station.bitrate ? `${station.bitrate} kbps` : ""]
    .filter(Boolean).join(" • ") || "Radio internetowe";
  
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
  setBigPictureStatus("Ładowanie strumienia...");
  syncBigPictureStation(station);

  audio.pause();
  audio.src = url;
  audio.load();

  if (autoPlay) {
    audio.play().then(() => {
      setPlayIcon(true);
      streamStatusEl.textContent = "Odtwarzanie";
      nowPlayingEl.textContent = "Na żywo";
      setBigPictureStatus("Na żywo");
      countClick(station);
      setupMediaSession(station);
    }).catch((err) => {
      setPlayIcon(false);
      if (reconnectEnabled) {
        scheduleReconnect();
      } else {
        streamStatusEl.textContent = "Zablokowane / Błąd HTTP";
        nowPlayingEl.textContent = "Kliknij Play, aby uruchomić";
        setBigPictureStatus("Kliknij Play, aby uruchomić");
      }
      console.error("Autoplay error:", err);
    });
  } else {
    setPlayIcon(false);
    streamStatusEl.textContent = "Gotowe";
    nowPlayingEl.textContent = "Naciśnij Play";
    setBigPictureStatus("Naciśnij Play");
  }
}

audio.addEventListener('waiting', () => {
  streamStatusEl.textContent = "Ładowanie / Buforowanie...";
  nowPlayingEl.textContent = "Pobieranie danych...";
  setBigPictureStatus("Buforowanie strumienia...");
  if (reconnectEnabled && !bufferWatchdog) {
    bufferWatchdog = setTimeout(() => {
      bufferWatchdog = null;
      if (reconnectEnabled && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        scheduleReconnect();
      }
    }, 15000);
  }
});

audio.addEventListener('playing', () => {
  clearTimeout(reconnectTimer);
  clearTimeout(bufferWatchdog);
  reconnectTimer = null;
  bufferWatchdog = null;
  reconnectAttempts = 0;
  setPlayIcon(true);
  streamStatusEl.textContent = "Odtwarzanie";
  nowPlayingEl.textContent = "Na żywo";
  setBigPictureStatus("Na żywo");
});

audio.addEventListener('error', () => {
  setPlayIcon(false);
  if (reconnectEnabled) {
    scheduleReconnect();
  } else {
    streamStatusEl.textContent = "Błąd strumienia";
    nowPlayingEl.textContent = "Stacja niedostępna";
    setBigPictureStatus("Stacja niedostępna");
  }
});

audio.addEventListener('ended', () => {
  if (reconnectEnabled) scheduleReconnect();
});

function setupMediaSession(station) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name || "Radio internetowe",
      artist: [station.countrycode, station.codec].filter(Boolean).join(" • ") || "Car Radio",
      album: "Internet Radio",
      artwork: station.favicon ? [{ src: station.favicon, sizes: '96x96 128x128 192x192 512x512', type: 'image/png' }] : []
    });

    navigator.mediaSession.setActionHandler('play', () => playBtn.click());
    navigator.mediaSession.setActionHandler('pause', () => {
      cancelReconnect();
      audio.pause();
      setPlayIcon(false);
    });
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

function playRandomStation() {
  if (!stations.length) {
    const message = "Brak stacji w bieżącej kategorii";
    streamStatusEl.textContent = message;
    nowPlayingEl.textContent = message;
    setBigPictureStatus(message);
    return;
  }

  const candidates = stations
    .map((station, index) => index)
    .filter(index => stations.length === 1 || stations[index].stationuuid !== currentPlayingUuid);
  const availableStations = candidates.length ? candidates : stations.map((station, index) => index);
  const randomIndex = availableStations[Math.floor(Math.random() * availableStations.length)];
  prepareStation(randomIndex, true);
}


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
  if (localStorage.getItem(BIG_PICTURE_STORAGE_KEY) === "true") {
    setBigPictureVisible(true);
  }

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
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectEnabled = true;
    reconnectAttempts = 0;
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
      }).catch(scheduleReconnect);
    });
  } else {
    cancelReconnect();
    audio.pause();
    setPlayIcon(false);
    streamStatusEl.textContent = "Wstrzymano";
  }
});

document.getElementById("stopBtn").addEventListener("click", () => {
  cancelReconnect();
  audio.pause();
  audio.currentTime = 0;
  setPlayIcon(false);
  streamStatusEl.textContent = "Zatrzymano";
  nowPlayingEl.textContent = "Gotowe do wznowienia";
  setBigPictureStatus("Zatrzymano");
});

document.getElementById("bigPictureBtn").addEventListener("click", () => {
  setBigPictureVisible(bigPicture.classList.contains("hidden"));
});

function closeBigPicture() {
  setBigPictureVisible(false);
}

document.getElementById("bigPicture").addEventListener("click", event => {
  if (event.target === bigPicture) closeBigPicture();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !bigPicture.classList.contains("hidden")) closeBigPicture();
});
document.getElementById("bigPicturePrev").addEventListener("click", () => playFavoriteOffset(-1));
document.getElementById("bigPicturePlay").addEventListener("click", () => playBtn.click());
document.getElementById("bigPictureNext").addEventListener("click", () => playFavoriteOffset(1));
document.getElementById("bigPictureStop").addEventListener("click", () => document.getElementById("stopBtn").click());
document.getElementById("randomBtn").addEventListener("click", playRandomStation);
document.getElementById("bigPictureRandom").addEventListener("click", playRandomStation);
document.getElementById("bigPictureRefresh").addEventListener("click", () => refreshBtn.click());
bigPictureFavoriteBtn.addEventListener("click", () => favoriteCurrentBtn.click());

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    streamStatusEl.textContent = "Odświeżanie...";
    location.reload();
  });
}

favoriteCurrentBtn.addEventListener("click", () => {
  if (currentPlayingUuid) toggleFavorite(currentPlayingUuid);
});

settingsBtn.addEventListener("click", () => {
  updateStationColumnSelection();
  updateFavoriteColumnSelection();
  settingsDialog.showModal();
});
settingsCloseBtn.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", event => {
  if (event.target === settingsDialog) settingsDialog.close();
});
settingsColumnButtons.forEach(button => {
  button.addEventListener("click", () => setStationColumns(Number(button.dataset.columns)));
});
settingsFavoriteColumnButtons.forEach(button => {
  button.addEventListener("click", () => setFavoriteColumns(Number(button.dataset.favoritesColumns)));
});
categoryTabHeightInput.addEventListener("input", () => setCategoryTabHeight(categoryTabHeightInput.value));
themeColorInput.addEventListener("input", () => applyThemeColor(themeColorInput.value, true));
resetThemeBtn.addEventListener("click", () => {
  localStorage.removeItem(THEME_COLOR_STORAGE_KEY);
  applyThemeColor(DEFAULT_THEME_COLOR);
});

document.querySelectorAll(".tabs .tab").forEach(tab => {
  if (tab.id === "refreshBtn" || tab.id === "settingsBtn") return;
  tab.addEventListener("click", async () => {
    document.querySelectorAll(".tabs .tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    document.querySelector(".right-panel").classList.toggle("filters-scroll", currentTab === "filters");
    
    document.getElementById("searchPanel").classList.toggle("hidden", currentTab !== "search");
    document.getElementById("filterPanel").classList.toggle("hidden", currentTab !== "filters");
    mobileFavoritesPanelEl.classList.toggle("hidden", currentTab !== "favorites");
    document.querySelector(".stations-head").classList.toggle("hidden", currentTab === "favorites");
    document.querySelector(".stations-container").classList.toggle("hidden", currentTab === "favorites");

    try {
      if (currentTab === "favorites") {
        return;
      } else if (currentTab === "search") {
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

let wasMobileLayout = window.matchMedia("(max-width: 800px)").matches;
window.addEventListener("resize", () => {
  const isMobileLayout = window.matchMedia("(max-width: 800px)").matches;
  updateStationColumnSelection();
  updateFavoriteColumnSelection();
  if (wasMobileLayout && !isMobileLayout && currentTab === "favorites") {
    document.querySelector('.tabs [data-tab="poland"]').click();
  }
  wasMobileLayout = isMobileLayout;
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

initializeSettings();
init();
