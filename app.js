
const $ = (id) => document.getElementById(id);

const DEFAULT_PLACE = {
  id: "current-location",
  name: "Locating…",
  admin: "",
  countryCode: "LOC",
  latitude: null,
  longitude: null,
  isAirport: false,
  kind: "city",
  isCurrentLocation: true
};

const state = {
  settings: JSON.parse(localStorage.getItem("atmos-settings")) || {
    temperatureUnit: "fahrenheit",
    speedUnit: "mph",
    measurementSystem: "imperial",
    personalizedOutfits: true,
    alerts: true
  },
  places: JSON.parse(localStorage.getItem("atmos-places")) || [DEFAULT_PLACE],
  selectedPlaceId: localStorage.getItem("atmos-selected-place"),
  weather: null,
  searchTimer: null,
  testPreset: null,
  customPresets: JSON.parse(localStorage.getItem("atmos-custom-presets")) || [],
  nearby: { airports: [], beaches: [] },
  marine: null,
  beachReviews: JSON.parse(localStorage.getItem("atmos-beach-reviews")) || {},
  beachReviewLoading: {},
  theme: localStorage.getItem("atmos-theme") || "atmos",
  accent: localStorage.getItem("atmos-accent") || "#5AA8FF"
};

function migrateLocationState() {
  const staleDefault = state.places.length === 1 && state.places[0]?.name === "Boca Raton" && !state.places[0]?.isCurrentLocation;
  if (staleDefault) state.places = [DEFAULT_PLACE];
  let current = state.places.find(p => p.isCurrentLocation || p.countryCode === "LOC");
  if (!current) {
    current = {...DEFAULT_PLACE};
    state.places.unshift(current);
  }
  current.id = "current-location";
  current.isCurrentLocation = true;
  current.countryCode = "LOC";
  state.selectedPlaceId = current.id;
}

migrateLocationState();

if (!state.selectedPlaceId || !state.places.some(p => p.id === state.selectedPlaceId)) {
  state.selectedPlaceId = state.places[0].id;
}

let cloudSaveTimer=null;
function saveState() {
  localStorage.setItem("atmos-settings", JSON.stringify(state.settings));
  localStorage.setItem("atmos-places", JSON.stringify(state.places));
  localStorage.setItem("atmos-selected-place", state.selectedPlaceId);
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(()=>window.AtmosBackend?.savePlaces?.(state.places).catch(e=>console.warn("Cloud save failed",e)),700);
}

function selectedPlace() {
  return state.places.find(p => p.id === state.selectedPlaceId) || state.places[0];
}

function temp(c) {
  const value = state.settings.temperatureUnit === "fahrenheit" ? c * 9 / 5 + 32 : c;
  return `${Math.round(value)}°`;
}

function alternateTemp(c) {
  if (state.settings.temperatureUnit === "fahrenheit") {
    return `${Math.round(c)}°C`;
  }
  return `${Math.round(c * 9 / 5 + 32)}°F`;
}

function speed(kmh) {
  const value = state.settings.speedUnit === "mph" ? kmh * 0.621371 : kmh;
  return `${Math.round(value)} ${state.settings.speedUnit === "mph" ? "mph" : "km/h"}`;
}

function distance(meters) {
  return state.settings.measurementSystem === "imperial"
    ? `${(meters / 1609.344).toFixed(1)} mi`
    : `${(meters / 1000).toFixed(1)} km`;
}

function precipitation(mm) {
  return state.settings.measurementSystem === "imperial"
    ? `${(mm / 25.4).toFixed(2)} in`
    : `${mm.toFixed(1)} mm`;
}

function pressure(hpa) {
  return state.settings.measurementSystem === "imperial"
    ? `${(hpa * 0.0295299830714).toFixed(2)} inHg`
    : `${Math.round(hpa)} hPa`;
}

function weatherVisual(code) {
  if (code === 0) return { title: "Clear", icon: "☀️", type: "clear" };
  if ([1,2].includes(code)) return { title: "Partly cloudy", icon: "🌤️", type: "partly" };
  if (code === 3) return { title: "Cloudy", icon: "☁️", type: "cloudy" };
  if ([45,48].includes(code)) return { title: "Foggy", icon: "🌫️", type: "fog" };
  if ([51,53,55,56,57].includes(code)) return { title: "Drizzle", icon: "🌦️", type: "drizzle" };
  if ([61,63,65,66,67,80,81,82].includes(code)) return { title: "Rain", icon: "🌧️", type: "rain" };
  if ([71,73,75,77,85,86].includes(code)) return { title: "Snow", icon: "🌨️", type: "snow" };
  if ([95,96,99].includes(code)) return { title: "Thunderstorms", icon: "⛈️", type: "storm" };
  return { title: "Cloudy", icon: "☁️", type: "cloudy" };
}

function parseLocalISO(value) {
  return new Date(value);
}



function hexToRgb(hex) {
  const clean=hex.replace("#","");
  const value=parseInt(clean.length===3?clean.split("").map(x=>x+x).join(""):clean,16);
  return `${(value>>16)&255},${(value>>8)&255},${value&255}`;
}

function applyTheme() {
  document.body.classList.remove("theme-atmos","theme-black-accent","theme-mono");
  document.body.classList.add(`theme-${state.theme}`);
  document.documentElement.style.setProperty("--accent",state.accent);
  document.documentElement.style.setProperty("--accent-rgb",hexToRgb(state.accent));

  document.querySelectorAll(".theme-choice").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.theme===state.theme);
  });
  document.querySelectorAll(".accent-swatches button").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.accent.toLowerCase()===state.accent.toLowerCase());
  });
  $("accentControl")?.classList.toggle("hidden",state.theme==="mono");
}

function setTheme(theme) {
  state.theme=theme;
  localStorage.setItem("atmos-theme",theme);
  applyTheme();
  applyLivingWorld();
  showToast(theme==="atmos"?"Atmos mode":theme==="black-accent"?"Black + Accent mode":"Black & White mode");
}

function setAccent(accent) {
  state.accent=accent;
  localStorage.setItem("atmos-accent",accent);
  applyTheme();
  if (state.theme!=="black-accent") setTheme("black-accent");
  else showToast("Accent updated");
}

function placeKind(place) {
  return place.kind || (place.isAirport ? "airport" : "city");
}

function haversineKm(aLat,aLon,bLat,bLon) {
  const R=6371, dLat=(bLat-aLat)*Math.PI/180, dLon=(bLon-aLon)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function displayDistance(km) {
  return state.settings.measurementSystem === "imperial"
    ? `${Math.round(km * 0.621371)} mi`
    : `${Math.round(km)} km`;
}

function sceneType() {
  if (state.testPreset) return state.testPreset.type;
  const c = state.weather?.current;
  if (!c) return "clear";
  const visual = weatherVisual(c.weather_code);
  if (c.wind_speed_10m >= 28 && !["storm","rain","snow"].includes(visual.type)) return "windy";
  if (visual.type === "clear" && !c.is_day && c.temperature_2m <= 7) return "clear";
  if (visual.type === "clear" && c.is_day && c.relative_humidity_2m <= 35 && c.temperature_2m >= 28) return "dry-sun";
  if (visual.type === "clear" && c.is_day && c.relative_humidity_2m >= 70) return "humid-sun";
  if (visual.type === "rain" && c.is_day && c.cloud_cover < 55) return "sunshower";
  if (visual.type === "clear" && !c.is_day) return "night-clear";
  return visual.type;
}

function applyLivingWorld() {
  const bg = document.querySelector(".background");
  const all = [...bg.classList].filter(c => c.startsWith("world-") || c.startsWith("place-"));
  bg.classList.remove(...all);

  const type=sceneType();
  bg.classList.add(`world-${type}`);
  bg.classList.add(`place-${placeKind(selectedPlace())}`);

  const c=state.weather?.current;
  if (c && !c.is_day && c.temperature_2m<=7 && ["clear","night-clear"].includes(type)) {
    bg.classList.add("world-cold-night");
  }
  if (c && c.is_day && c.precipitation===0 && c.cloud_cover<45 && state.weather?.hourly?.precipitation?.slice(0,3).some(v=>v>0)) {
    bg.classList.add("world-after-rain");
  }
}

const NEARBY_FALLBACK_PLACES = [
  {name:"Boca Raton Airport",code:"BCT",area:"Boca Raton",latitude:26.3785,longitude:-80.1077,kind:"airport"},
  {name:"Fort Lauderdale Executive Airport",code:"FXE",area:"Fort Lauderdale",latitude:26.1973,longitude:-80.1707,kind:"airport"},
  {name:"Palm Beach International Airport",code:"PBI",area:"West Palm Beach",latitude:26.6832,longitude:-80.0956,kind:"airport"},
  {name:"Fort Lauderdale–Hollywood International Airport",code:"FLL",area:"Fort Lauderdale",latitude:26.0726,longitude:-80.1527,kind:"airport"},
  {name:"Miami–Opa Locka Executive Airport",code:"OPF",area:"Opa-locka",latitude:25.9070,longitude:-80.2784,kind:"airport"},
  {name:"Miami International Airport",code:"MIA",area:"Miami",latitude:25.7959,longitude:-80.2870,kind:"airport"},
  {name:"Miami Executive Airport",code:"TMB",area:"Miami",latitude:25.6479,longitude:-80.4328,kind:"airport"},
  {name:"South Inlet Park Beach",area:"Boca Raton",latitude:26.3247,longitude:-80.0755,kind:"beach"},
  {name:"Red Reef Park Beach",area:"Boca Raton",latitude:26.3619,longitude:-80.0691,kind:"beach"},
  {name:"South Beach Park",area:"Boca Raton",latitude:26.3382,longitude:-80.0718,kind:"beach"},
  {name:"Spanish River Park Beach",area:"Boca Raton",latitude:26.3874,longitude:-80.0685,kind:"beach"},
  {name:"Deerfield Beach",area:"Deerfield Beach",latitude:26.3166,longitude:-80.0770,kind:"beach"},
  {name:"Hillsboro Beach",area:"Hillsboro Beach",latitude:26.2937,longitude:-80.0780,kind:"beach"},
  {name:"Pompano Beach",area:"Pompano Beach",latitude:26.2379,longitude:-80.0890,kind:"beach"},
  {name:"Delray Municipal Beach",area:"Delray Beach",latitude:26.4615,longitude:-80.0587,kind:"beach"},
  {name:"Fort Lauderdale Beach",area:"Fort Lauderdale",latitude:26.1224,longitude:-80.1041,kind:"beach"},
  {name:"Lake Worth Beach",area:"Lake Worth Beach",latitude:26.6159,longitude:-80.0375,kind:"beach"}
];

function fallbackNearbyPlaces(lat, lon) {
  // This compact built-in set keeps South Florida useful when public OSM services
  // are busy, blocked, or rate-limited. Only show it when reasonably nearby.
  return NEARBY_FALLBACK_PLACES
    .map(p => ({...p, distance:haversineKm(lat,lon,p.latitude,p.longitude)}))
    .filter(p => p.distance <= 220);
}

let nearbyRequestId = 0;

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

async function requestOverpass(query, timeoutMs = 5000) {
  // Race mirrors, but also enforce one hard deadline. Some public mirrors can
  // leave a browser request pending even after their own query timeout expires.
  const hardController = new AbortController();
  const hardTimer = setTimeout(() => hardController.abort(), timeoutMs);

  const attempts = OVERPASS_ENDPOINTS.map(async endpoint => {
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    hardController.signal.addEventListener("abort", relayAbort, {once:true});
    try {
      const res = await fetch(endpoint, {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
        body:`data=${encodeURIComponent(query)}`,
        signal:controller.signal
      });
      if (!res.ok) throw new Error(`Nearby server returned ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error("Invalid nearby response");
      return json;
    } finally {
      hardController.signal.removeEventListener("abort", relayAbort);
    }
  });

  try {
    return await Promise.race([
      Promise.any(attempts),
      new Promise((_, reject) => {
        hardController.signal.addEventListener("abort", () => reject(new Error("Nearby search timed out")), {once:true});
      })
    ]);
  } finally {
    clearTimeout(hardTimer);
    hardController.abort();
  }
}

function parseOverpassPlaces(data, kind, originLat, originLon, defaultArea) {
  const unique = new Set();
  return (data?.elements || []).map(el => {
    const latitude = el.lat ?? el.center?.lat;
    const longitude = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const fallbackName = kind === "airport"
      ? (tags.iata || tags.icao || tags.faa)
      : (tags["name:en"] || tags.local_name);
    const name = tags.name || tags["name:en"] || fallbackName;
    if (!name) return null;

    const key = `${kind}:${name.toLowerCase()}:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
    if (unique.has(key)) return null;
    unique.add(key);

    return {
      name,
      code: kind === "airport" ? (tags.iata || tags.icao || tags.faa || "") : "",
      area: tags["addr:city"] || tags["addr:place"] || tags["is_in:city"] || tags.is_in || defaultArea,
      latitude,
      longitude,
      kind,
      distance: haversineKm(originLat, originLon, latitude, longitude)
    };
  }).filter(Boolean);
}

async function searchOverpassCategory(kind, lat, lon) {
  // One reasonably-sized request is faster and more reliable than waiting on
  // several expanding requests. Airports receive a wider radius than beaches.
  const radius = kind === "airport" ? 180000 : 100000;
  const selector = kind === "airport"
    ? `nwr["aeroway"="aerodrome"]["name"](around:${radius},${lat},${lon});`
    : `nwr["natural"="beach"]["name"](around:${radius},${lat},${lon});\n` +
      `nwr["leisure"="beach_resort"]["name"](around:${radius},${lat},${lon});`;
  const query = `[out:json][timeout:5];(${selector});out tags center qt 80;`;
  try {
    return await requestOverpass(query, 5500);
  } catch (error) {
    console.warn(`Overpass ${kind} search failed`, error);
    return {elements:[]};
  }
}

async function searchNominatimCategory(kind, lat, lon, defaultArea) {
  // Quick worldwide fallback. It is deliberately capped so the UI can never
  // remain in a searching state because a public geocoder is slow.
  const delta = kind === "airport" ? 2.8 : 1.8;
  const left = lon - delta;
  const right = lon + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  const term = kind === "airport" ? "airport" : "beach";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const results = [];

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", term);
    url.searchParams.set("viewbox", `${left},${top},${right},${bottom}`);
    url.searchParams.set("bounded", "1");
    url.searchParams.set("limit", "20");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url, {headers:{"Accept-Language":"en"}, signal:controller.signal});
    if (!res.ok) return [];
    const rows = await res.json();
    for (const row of rows || []) {
      const latitude = Number(row.lat), longitude = Number(row.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const address = row.address || {};
      const rawName = (row.name || row.display_name || "").split(",")[0].trim();
      if (!rawName) continue;
      results.push({
        name: rawName,
        code: "",
        area: address.city || address.town || address.village || address.county || defaultArea,
        latitude, longitude, kind,
        distance: haversineKm(lat, lon, latitude, longitude)
      });
    }
  } catch (error) {
    console.warn(`Nominatim ${kind} backup failed`, error);
  } finally {
    clearTimeout(timer);
  }
  return results;
}

function mergeNearbyPlaces(...groups) {
  const merged = [];
  for (const group of groups) {
    for (const place of group || []) {
      const duplicate = merged.some(existing => existing.kind === place.kind && (
        existing.name.toLowerCase() === place.name.toLowerCase() ||
        haversineKm(existing.latitude, existing.longitude, place.latitude, place.longitude) < 0.8
      ));
      if (!duplicate) merged.push(place);
    }
  }
  return merged;
}

async function findNearbyCategory(kind, place, requestId, instant) {
  const lat = place.latitude, lon = place.longitude;
  const instantForKind = instant.filter(p => p.kind === kind);

  let data = await searchOverpassCategory(kind, lat, lon);
  if (requestId !== nearbyRequestId) return;

  let live = parseOverpassPlaces(data, kind, lat, lon, place.name);
  if (!live.length) {
    live = await searchNominatimCategory(kind, lat, lon, place.name);
  }
  if (requestId !== nearbyRequestId) return;

  const combined = mergeNearbyPlaces(live, instantForKind)
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,8);

  if (kind === "airport") state.nearby.airports = combined;
  else state.nearby.beaches = combined;

  // Finish this category immediately instead of waiting for the other one.
  renderNearby({
    searchingAirports: kind === "beach" && state.nearbySearch?.airports,
    searchingBeaches: kind === "airport" && state.nearbySearch?.beaches
  });
}

async function findNearbyPlaces(place = selectedPlace()) {
  const airports = $("nearbyAirports");
  const beaches = $("nearbyBeaches");
  if (!Number.isFinite(place?.latitude) || !Number.isFinite(place?.longitude)) {
    if (airports) airports.innerHTML = `<div class="nearby-empty">Choose a location first.</div>`;
    if (beaches) beaches.innerHTML = `<div class="nearby-empty">Choose a location first.</div>`;
    return;
  }

  const requestId = ++nearbyRequestId;
  const lat = place.latitude, lon = place.longitude;
  const instant = fallbackNearbyPlaces(lat, lon);

  state.nearby.airports = instant.filter(p => p.kind === "airport").sort((a,b)=>a.distance-b.distance).slice(0,8);
  state.nearby.beaches = instant.filter(p => p.kind === "beach").sort((a,b)=>a.distance-b.distance).slice(0,8);
  state.nearbySearch = {airports:true, beaches:true};
  renderNearby({searchingAirports:true, searchingBeaches:true});

  const finish = async kind => {
    try {
      await findNearbyCategory(kind, place, requestId, instant);
    } finally {
      if (requestId !== nearbyRequestId) return;
      state.nearbySearch[kind === "airport" ? "airports" : "beaches"] = false;
      renderNearby({
        searchingAirports: state.nearbySearch.airports,
        searchingBeaches: state.nearbySearch.beaches
      });
    }
  };

  // Do not await one combined Promise: each section updates as soon as ready.
  finish("airport");
  finish("beach");
}

function renderNearby({searching=false, searchingAirports=searching, searchingBeaches=searching} = {}) {
  const airports = $("nearbyAirports");
  const beaches = $("nearbyBeaches");
  if (!airports || !beaches) return;

  airports.innerHTML = state.nearby.airports.length ? "" : `<div class="nearby-empty">${searchingAirports ? "Searching nearby airports…" : "No named airports were found within about 112 miles."}</div>`;
  state.nearby.airports.forEach(p => {
    const card = document.createElement("div");
    card.className = "nearby-card airport";
    card.innerHTML = `
      <button class="nearby-plus" type="button" aria-label="Save airport">＋</button>
      <strong>${p.name}</strong>
      <small>${p.code ? `${p.code} · ` : ""}Airport weather</small>
      <span class="nearby-distance">${displayDistance(p.distance)}</span>
      <span class="nearby-art">✈</span>
    `;
    card.addEventListener("click", e => {
      if (e.target.closest(".nearby-plus")) return;
      openNearbyPlace(p,"airport");
    });
    card.querySelector(".nearby-plus").addEventListener("click", e => {
      e.stopPropagation(); saveNearbyPlace(p,"airport");
    });
    airports.appendChild(card);
  });

  beaches.innerHTML = state.nearby.beaches.length ? "" : `<div class="nearby-empty">${searchingBeaches ? `Searching for beaches near ${selectedPlace().name}…` : `No named beaches were found within about 62 miles of ${selectedPlace().name}. Inland locations may genuinely have none nearby.`}</div>`;
  state.nearby.beaches.forEach(p => {
    const card = document.createElement("div");
    card.className = "nearby-card beach";
    card.innerHTML = `
      <button class="nearby-plus" type="button" aria-label="Save beach">＋</button>
      <strong>${p.name}</strong>
      <small>${p.area} · Water report</small>
      <span class="nearby-distance">${displayDistance(p.distance)}</span>
      <span class="nearby-art">🌊</span>
    `;
    card.addEventListener("click", e => {
      if (e.target.closest(".nearby-plus")) return;
      openNearbyPlace(p,"beach");
    });
    card.querySelector(".nearby-plus").addEventListener("click", e => {
      e.stopPropagation(); saveNearbyPlace(p,"beach");
    });
    beaches.appendChild(card);
  });
}

function saveNearbyPlace(p,kind) {
  const existing = state.places.find(x => Math.abs(x.latitude-p.latitude)<.001 && Math.abs(x.longitude-p.longitude)<.001);
  if (existing) { showToast("Already saved"); return; }
  state.places.push({
    id:crypto.randomUUID(), name:p.name, admin:p.area || p.code || "",
    countryCode:"US", latitude:p.latitude, longitude:p.longitude,
    isAirport:kind==="airport", kind
  });
  saveState(); 
  renderSavedPlaces();
  showToast(`${kind==="beach"?"Beach":"Airport"} saved`);
}

function openNearbyPlace(p,kind) {
  let existing = state.places.find(x => Math.abs(x.latitude-p.latitude)<.001 && Math.abs(x.longitude-p.longitude)<.001);
  const temp = existing || {
    id:crypto.randomUUID(), name:p.name, admin:p.area || p.code || "",
    countryCode:"US", latitude:p.latitude, longitude:p.longitude,
    isAirport:kind==="airport", kind
  };
  if (!existing) state.places.push(temp);
  state.selectedPlaceId = temp.id;
  saveState(); renderSavedPlaces(); fetchWeather(temp);
}

async function fetchMarine(place) {
  if (placeKind(place) !== "beach") {
    state.marine = null;
    renderBeachStatus();
    return;
  }
  try {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto&current=wave_height,wave_direction,wave_period,sea_surface_temperature&hourly=wave_height,wave_period,sea_surface_temperature`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Marine request failed");
    state.marine = await res.json();
  } catch {
    state.marine = null;
  }
  renderBeachStatus();
}

function beachScore() {
  if (!state.weather) return 0;
  const c=state.weather.current;
  const marine=state.marine?.current || {};
  const wave=marine.wave_height ?? 0.8;
  const water=marine.sea_surface_temperature ?? c.temperature_2m;
  let score=100;
  score-=Math.max(0,Math.abs(c.apparent_temperature-29)*2.4);
  score-=Math.max(0,c.wind_speed_10m-18)*1.5;
  score-=Math.max(0,wave-1.1)*20;
  score-=Math.max(0,22-water)*2.5;
  score-=Math.min(45,c.precipitation*7);
  if ([95,96,99].includes(c.weather_code)) score-=50;
  if (c.cloud_cover>85) score-=12;
  return Math.max(0,Math.min(100,Math.round(score)));
}

function renderBeachStatus() {
  const panel=$("beachStatus");
  if (!panel) return;
  if (placeKind(selectedPlace())!=="beach") { panel.classList.add("hidden"); $("beachCommunityCard")?.classList.add("hidden"); return; }
  panel.classList.remove("hidden");

  const score=beachScore();
  const marine=state.marine?.current || {};
  const water=marine.sea_surface_temperature;
  const waves=marine.wave_height;
  const period=marine.wave_period;
  $("beachScore").textContent=score;
  panel.querySelector(".beach-score-ring").style.setProperty("--score",`${score}%`);
  $("beachVerdict").textContent=score>=80?"Great beach day":score>=60?"Pretty good":score>=40?"Mixed conditions":"Skip it";
  $("waterTemp").textContent=water==null?"N/A":temp(water);
  $("waveHeight").textContent=waves==null?"N/A":`${waves.toFixed(1)} m`;
  $("wavePeriod").textContent=period==null?"N/A":`${period.toFixed(0)} sec`;

  const c=state.weather.current;
  const waterPhrase=water==null?"Water temperature is unavailable":water>=27?"The water is very warm":water>=23?"The water is comfortable":"The water may feel cool";
  const wavePhrase=waves==null?"wave data is unavailable":waves<0.8?"the ocean looks calm":waves<1.5?"waves are moderate":"waves are rough";
  $("beachSummary").textContent=`${waterPhrase}, ${wavePhrase}, and winds are ${speed(c.wind_speed_10m)}.`;
  renderBeachCommunityPreview();
}



const BEACH_RATING_CATEGORIES = [
  {key:"overall", label:"Overall"},
  {key:"cleanliness", label:"Cleanliness"},
  {key:"water", label:"Water"},
  {key:"crowds", label:"Crowds"},
  {key:"safety", label:"Safety"},
  {key:"amenities", label:"Amenities"},
  {key:"parking", label:"Parking"},
  {key:"family", label:"Family friendly"},
  {key:"scenery", label:"Scenery"},
  {key:"waterClarity", label:"Water clarity"},
  {key:"sandQuality", label:"Sand quality"},
  {key:"bathrooms", label:"Bathrooms"}
];

function beachReviewKey(place = selectedPlace()) {
  return `${place.name}|${Number(place.latitude).toFixed(3)}|${Number(place.longitude).toFixed(3)}`;
}

function beachReviews(place = selectedPlace()) {
  return state.beachReviews[beachReviewKey(place)] || [];
}

async function loadBeachReviews(place = selectedPlace(), {render = true} = {}) {
  const key = beachReviewKey(place);
  if (!window.AtmosBackend?.configured) return beachReviews(place);
  if (state.beachReviewLoading[key]) return state.beachReviewLoading[key];
  state.beachReviewLoading[key] = (async () => {
    try {
      const shared = await window.AtmosBackend.listBeachReviews(key);
      if (Array.isArray(shared)) {
        state.beachReviews[key] = shared;
        localStorage.setItem("atmos-beach-reviews", JSON.stringify(state.beachReviews));
      }
      if (render && beachReviewKey(selectedPlace()) === key) {
        renderBeachCommunityPreview();
        if (!$(`beachCommunityPanel`)?.classList.contains("hidden")) renderBeachCommunity();
      }
      return state.beachReviews[key] || [];
    } catch (error) {
      console.warn("Atmos backend review load failed; using local cache.", error);
      return state.beachReviews[key] || [];
    } finally {
      delete state.beachReviewLoading[key];
    }
  })();
  return state.beachReviewLoading[key];
}

function averageRating(reviews, key) {
  if (!reviews.length) return null;
  const values = reviews.map(r => Number(r.ratings?.[key])).filter(v => Number.isFinite(v) && v > 0);
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
}

function starText(value) {
  if (!value) return "☆☆☆☆☆";
  const rounded = Math.round(value);
  return "★".repeat(rounded) + "☆".repeat(5-rounded);
}

function renderBeachCommunityPreview() {
  const card = $("beachCommunityCard");
  if (!card) return;
  const isBeach = placeKind(selectedPlace()) === "beach";
  card.classList.toggle("hidden", !isBeach);
  if (!isBeach) return;
  const reviews = beachReviews();
  if (window.AtmosBackend?.configured && !state.beachReviewLoading[beachReviewKey()]) {
    loadBeachReviews(selectedPlace(), {render:true});
  }
  const avg = averageRating(reviews,"overall");
  $("beachCommunityPreview").textContent = reviews.length
    ? `${avg.toFixed(1)} ★ from ${reviews.length} ${reviews.length===1?"report":"reports"} · Tap to read or add yours.`
    : "Be the first to rate cleanliness, water, crowds, safety, amenities, and share a beach report.";
}

function buildRatingFields() {
  const wrap = $("reviewRatingFields");
  if (!wrap || wrap.children.length) return;
  BEACH_RATING_CATEGORIES.forEach(category => {
    const row = document.createElement("div");
    row.className = "review-rating-row";
    row.innerHTML = `<span>${category.label}</span><div class="star-input" data-rating-key="${category.key}" aria-label="${category.label} rating"></div>`;
    const stars = row.querySelector(".star-input");
    for (let i=1;i<=5;i++) {
      const button=document.createElement("button");
      button.type="button";
      button.textContent="☆";
      button.dataset.value=String(i);
      button.setAttribute("aria-label",`${i} stars`);
      button.addEventListener("click",()=>setStarInput(stars,i));
      stars.appendChild(button);
    }
    wrap.appendChild(row);
  });
}

function setStarInput(container, value) {
  container.dataset.value=String(value);
  container.querySelectorAll("button").forEach((button,index)=>{
    button.textContent=index<value?"★":"☆";
    button.classList.toggle("selected",index<value);
  });
}

function resetReviewComposer() {
  $("reviewDescription").value="";
  if ($("reviewVisitDate")) $("reviewVisitDate").value="";
  document.querySelectorAll(".star-input").forEach(el=>setStarInput(el,0));
}

function renderBeachDeepDive() {
  const box=$("beachDeepDive"); if(!box||!state.weather) return;
  const place=selectedPlace(), c=state.weather.current, m=state.marine?.current||{}, score=beachScore();
  const wave=m.wave_height, period=m.wave_period, water=m.sea_surface_temperature;
  const uv=c.uv_index ?? state.weather.daily?.uv_index_max?.[0];
  const precip=c.precipitation ?? 0;
  const cloud=c.cloud_cover ?? 0;
  const windScore=Math.max(0,Math.min(100,100-Math.max(0,c.wind_speed_10m-10)*3));
  const waveScore=wave==null?65:Math.max(0,Math.min(100,100-Math.max(0,wave-.5)*35));
  const waterScore=water==null?65:Math.max(0,Math.min(100,100-Math.abs(water-27)*7));
  const skyScore=Math.max(0,Math.min(100,100-cloud*.55-precip*8));
  const rows=[['Sky',skyScore],['Wind',windScore],['Water',waterScore],['Waves',waveScore]];
  box.innerHTML=`<div class="deep-dive-head"><div><div class="eyebrow">EXACT BEACH CONDITIONS</div><strong>${escapeHtml(place.name)}</strong></div><div class="deep-score">${score}<small>/100</small></div></div>
  <div class="detail-grid">
    <div class="detail-cell"><small>Feels like</small><strong>${temp(c.apparent_temperature)}</strong></div>
    <div class="detail-cell"><small>Air temperature</small><strong>${temp(c.temperature_2m)}</strong></div>
    <div class="detail-cell"><small>Water temperature</small><strong>${water==null?'Unavailable':temp(water)}</strong></div>
    <div class="detail-cell"><small>Wave height</small><strong>${wave==null?'Unavailable':wave.toFixed(2)+' m'}</strong></div>
    <div class="detail-cell"><small>Wave period</small><strong>${period==null?'Unavailable':period.toFixed(1)+' sec'}</strong></div>
    <div class="detail-cell"><small>Wind</small><strong>${speed(c.wind_speed_10m)}</strong></div>
    <div class="detail-cell"><small>Cloud cover</small><strong>${Math.round(cloud)}%</strong></div>
    <div class="detail-cell"><small>UV index</small><strong>${uv==null?'Unavailable':Number(uv).toFixed(1)}</strong></div>
    <div class="detail-cell"><small>Rain now</small><strong>${precipitation(precip)}</strong></div>
    <div class="detail-cell"><small>Coordinates</small><strong>${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}</strong></div>
  </div><div class="score-breakdown">${rows.map(([n,v])=>`<div class="score-line"><span>${n}</span><div class="score-track"><div class="score-fill" style="width:${Math.round(v)}%"></div></div><b>${Math.round(v)}</b></div>`).join('')}</div>
  <div class="beach-location-note">Atmos combines current weather and marine data for this exact beach coordinate. Community ratings below cover details sensors cannot measure, including sand, parking, bathrooms, safety, scenery, and crowds.</div>`;
}

function renderBeachCommunity() {
  if (placeKind(selectedPlace()) !== "beach") return;
  buildRatingFields();
  renderBeachDeepDive();
  const place=selectedPlace();
  const reviews=beachReviews(place);
  $("communityBeachName").textContent=place.name;
  const overall=averageRating(reviews,"overall");
  $("communityOverall").textContent=overall?overall.toFixed(1):"—";
  $("communityStars").textContent=starText(overall);
  $("communityCount").textContent=reviews.length?`${reviews.length} ${reviews.length===1?"review":"reviews"}`:"No reviews yet";

  $("communityCategoryGrid").innerHTML=BEACH_RATING_CATEGORIES.slice(1).map(category=>{
    const avg=averageRating(reviews,category.key);
    return `<div><small>${category.label}</small><strong>${avg?avg.toFixed(1):"—"}</strong><span>${starText(avg)}</span></div>`;
  }).join("");

  const feed=$("communityFeed");
  if (!reviews.length) {
    feed.innerHTML='<div class="glass-card empty-community"><strong>No reports yet</strong><p>Post the first review for this beach.</p></div>';
  } else {
    feed.innerHTML=reviews.slice().reverse().map(review=>{
      const date=new Date(review.createdAt).toLocaleDateString([], {month:"short",day:"numeric",year:"numeric"});
      const visited=review.visitDate ? ` · Visited ${new Date(review.visitDate+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'})}` : "";
      const categoryChips=BEACH_RATING_CATEGORIES.slice(1).map(c=>`<span>${c.label} ${review.ratings[c.key]}★</span>`).join("");
      return `<article class="glass-card community-review"><div class="review-head"><div class="review-avatar">${escapeHtml((review.author||"A").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(review.author||"Anonymous")}</strong><small>${date}${visited}</small></div><b>${review.ratings.overall}.0 ★</b></div><p>${escapeHtml(review.description)}</p><div class="review-chips">${categoryChips}</div></article>`;
    }).join("");
  }
  renderBeachCommunityPreview();
}

function escapeHtml(value="") {
  return value.replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

async function openBeachCommunity() {
  if (placeKind(selectedPlace()) !== "beach") return;
  renderBeachCommunity();
  $("beachCommunityPanel").classList.remove("hidden");
  await loadBeachReviews(selectedPlace(), {render:true});
}

async function submitBeachReview() {
  if (placeKind(selectedPlace()) !== "beach") return;
  const submitButton = $("submitBeachReview");
  const sessionUser=await window.AtmosBackend?.currentUser?.();
  if (window.AtmosBackend?.configured && !sessionUser) { showToast("Log in before posting a beach review"); openAccountPanel(); return; }
  const profile=await window.AtmosBackend?.getProfile?.().catch(()=>null);
  const author=profile?.displayName || $("reviewAuthor").value.trim() || "Atmos user";
  const description=$("reviewDescription").value.trim();
  const visitDate=$("reviewVisitDate")?.value || null;
  const ratings={};
  let complete=true;
  document.querySelectorAll(".star-input").forEach(el=>{
    const value=Number(el.dataset.value||0);
    ratings[el.dataset.ratingKey]=value;
    if (!value) complete=false;
  });
  if (!complete) { showToast("Rate every beach category"); return; }
  if (description.length<20) { showToast("Add a more detailed beach report"); return; }

  const place = selectedPlace();
  const key=beachReviewKey(place);
  const review={id:crypto.randomUUID(),author,description,visitDate,ratings,createdAt:new Date().toISOString()};
  submitButton.disabled = true;
  submitButton.textContent = window.AtmosBackend?.configured ? "Posting…" : "Saving…";

  try {
    if (window.AtmosBackend?.configured) {
      await window.AtmosBackend.createBeachReview(place, key, review);
      await loadBeachReviews(place, {render:false});
    } else {
      state.beachReviews[key] ||= [];
      state.beachReviews[key].push(review);
      localStorage.setItem("atmos-beach-reviews",JSON.stringify(state.beachReviews));
    }
    localStorage.setItem("atmos-review-author",author);
    resetReviewComposer();
    renderBeachCommunity();
    showToast(window.AtmosBackend?.configured ? "Beach report posted for everyone" : "Saved locally — connect Supabase to share it");
  } catch (error) {
    console.error("Beach report post failed", error);
    showToast("Couldn’t post the report. Check the backend setup.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Post report";
  }
}

function renderLocationHeader(place = selectedPlace()) {
  const isCurrent = Boolean(place?.isCurrentLocation || place?.countryCode === "LOC");

  if (state.testPreset) {
    $("locationName").textContent = state.testPreset.name;
    $("locationCity").textContent = "Developer preview";
    return;
  }

  if (isCurrent) {
    $("locationName").textContent = "My Location";
    $("locationCity").textContent = place.name || "Current location";
  } else {
    $("locationName").textContent = place.name;
    $("locationCity").textContent = place.admin || (place.isAirport ? "Airport" : "Saved location");
  }
}

async function fetchWeather(place) {
  state.testPreset = null;
  $("testModeBadge").classList.add("hidden");
  renderLocationHeader(place);
  $("updatedAt").textContent = "Updating…";

  const current = [
    "temperature_2m","relative_humidity_2m","apparent_temperature","is_day",
    "precipitation","rain","showers","snowfall","weather_code","cloud_cover",
    "pressure_msl","surface_pressure","wind_speed_10m","wind_direction_10m",
    "wind_gusts_10m","visibility"
  ].join(",");

  const hourly = [
    "temperature_2m","relative_humidity_2m","apparent_temperature",
    "precipitation_probability","precipitation","weather_code","wind_speed_10m",
    "uv_index","visibility"
  ].join(",");

  const daily = [
    "weather_code","temperature_2m_max","temperature_2m_min","sunrise","sunset",
    "uv_index_max","precipitation_sum","precipitation_probability_max",
    "wind_speed_10m_max","wind_gusts_10m_max"
  ].join(",");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto&forecast_days=10&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&current=${encodeURIComponent(current)}&hourly=${encodeURIComponent(hourly)}&daily=${encodeURIComponent(daily)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather request failed");
    state.weather = await res.json();
    renderWeather();
    findNearbyPlaces(place);
    fetchMarine(place);
  } catch (error) {
    showToast("Could not load weather");
    $("updatedAt").textContent = "Update failed";
  }
}

function renderWeather() {
  const w = state.weather;
  const c = w.current;
  const visual = weatherVisual(c.weather_code);
  const today = w.daily;

  renderLocationHeader(selectedPlace());
  $("updatedAt").textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`;
  $("heroIcon").textContent = visual.icon;
  $("temperature").textContent = temp(c.temperature_2m);
  $("secondaryTemperature").textContent = alternateTemp(c.temperature_2m);
  $("condition").textContent = visual.title;
  $("feelsLike").textContent = `Feels like ${temp(c.apparent_temperature)}`;
  $("highLow").textContent = `H: ${temp(today.temperature_2m_max[0])}   L: ${temp(today.temperature_2m_min[0])}`;
  $("aiSummary").textContent = buildSummary();

  renderHourly();
  renderDaily();
  renderMetrics();
  renderParticles(visual.type);
  updateBackground(visual.type, c.is_day);
  applyLivingWorld();
  renderBeachStatus();
}

function buildSummary() {
  const w = state.weather;
  const c = w.current;
  const d = w.daily;
  const visual = weatherVisual(c.weather_code);
  const feels = c.apparent_temperature;
  const rainChance = d.precipitation_probability_max[0] || 0;
  const humidity = c.relative_humidity_2m;
  const gusty = c.wind_gusts_10m >= 35;

  let vibe = "";
  let activities = "";
  let outfit = "";

  if (visual.type === "storm") {
    vibe = "Weather’s being dramatic today — storms and heavy bursts are possible.";
    activities = "Best move: indoor plans, a movie, gym session, or getting work done.";
    outfit = "Wear a light waterproof layer and shoes you don’t mind getting wet.";
  } else if (visual.type === "rain" || visual.type === "drizzle") {
    vibe = c.is_day ? "It’s a rainy one, but not a write-off." : "Rainy night energy.";
    activities = rainChance >= 60
      ? "Good day for indoor plans, cafés, shopping, gaming, or a chill reset."
      : "You can still go out — just keep plans flexible between showers.";
    outfit = "Go with a rain shell, darker bottoms, and water-friendly sneakers.";
  } else if (visual.type === "snow") {
    vibe = "Full winter mode outside.";
    activities = "Good for a short snow walk, photos, skating, or staying warm inside.";
    outfit = "Bundle up with a coat, warm pants, boots, gloves, and a beanie.";
  } else if (visual.type === "fog") {
    vibe = "The weather looks cinematic and foggy.";
    activities = "Nice for a calm walk or coffee run, but visibility is lower than usual.";
    outfit = "Wear a light layer and something visible if you’re biking or walking near roads.";
  } else if (c.is_day && visual.type === "clear" && humidity <= 38 && feels >= 27) {
    vibe = "It’s giving dry, sunny, desert heat.";
    activities = "Good for the pool, beach, photos, or a quick outdoor plan — not a long midday mission.";
    outfit = "Wear a light tee, shorts, sunglasses, SPF, and bring water.";
  } else if (c.is_day && visual.type === "clear" && humidity >= 68 && feels >= 24) {
    vibe = "Bright and sunny, but the air is feeling extra humid.";
    activities = "Good for the pool, beach, mall, or anything with shade and AC nearby.";
    outfit = "Wear breathable clothes and avoid heavy layers — it’ll feel warmer than the number.";
  } else if (c.is_day && ["clear","partly"].includes(visual.type) && rainChance >= 25) {
    vibe = "Sun’s out, but a random shower could still pull up.";
    activities = "Great for going out, the beach, or meeting friends — just keep a backup spot nearby.";
    outfit = "Wear normal warm-weather clothes and bring a tiny umbrella or light shell.";
  } else if (c.is_day && ["clear","partly"].includes(visual.type)) {
    vibe = feels >= 24 ? "Weather’s looking nice and sunny." : "It’s bright, calm, and pretty comfortable.";
    activities = feels >= 24
      ? "Good for the beach, pool, biking, hanging out, or getting photos outside."
      : "Good for a walk, outdoor food, errands, or meeting friends.";
    outfit = feels >= 24
      ? "Wear a tee with shorts or light pants, plus sunglasses if you’re out long."
      : "A tee works, but bring one light layer if you’ll be out later.";
  } else if (visual.type === "cloudy") {
    vibe = "Cloudy, low-key weather today.";
    activities = "Good for errands, shopping, a walk, or outdoor plans without intense sun.";
    outfit = feels < 18 ? "Wear long pants and a hoodie or light jacket." : "A tee and light pants should feel right.";
  } else {
    vibe = `${visual.title} and ${temp(c.temperature_2m)} right now.`;
    activities = "Plans should be pretty normal — just check the next few hours before staying out long.";
    outfit = feels < 15 ? "Bring a layer." : "Keep the outfit light and comfortable.";
  }

  if (gusty) outfit += " It’s also gusty, so skip anything too loose.";
  return `${vibe} ${activities} ${outfit}`;
}

function renderHourly() {
  const el = $("hourlyForecast");
  el.innerHTML = "";
  const times = state.weather.hourly.time;
  const now = Date.now();
  let start = times.findIndex(t => parseLocalISO(t).getTime() >= now - 3600000);
  if (start < 0) start = 0;

  for (let i = start; i < Math.min(start + 24, times.length); i++) {
    const card = document.createElement("div");
    card.className = "hour-card";
    const date = parseLocalISO(times[i]);
    const chance = state.weather.hourly.precipitation_probability[i];
    card.innerHTML = `
      <div class="hour-time">${i === start ? "Now" : date.toLocaleTimeString([], {hour:"numeric"})}</div>
      <div class="hour-icon">${weatherVisual(state.weather.hourly.weather_code[i]).icon}</div>
      <div class="hour-temp">${temp(state.weather.hourly.temperature_2m[i])}</div>
      <div class="hour-rain">${chance > 10 ? `💧 ${chance}%` : "&nbsp;"}</div>
    `;
    el.appendChild(card);
  }
}

function renderDaily() {
  const el = $("dailyForecast");
  el.innerHTML = "";
  const d = state.weather.daily;
  const minAll = Math.min(...d.temperature_2m_min);
  const maxAll = Math.max(...d.temperature_2m_max);
  const span = Math.max(1, maxAll - minAll);

  d.time.forEach((time, i) => {
    const row = document.createElement("div");
    row.className = "day-row";
    const date = parseLocalISO(time);
    const name = i === 0 ? "Today" : date.toLocaleDateString([], {weekday:"short"});
    const chance = d.precipitation_probability_max[i];
    const width = Math.max(18, ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100);
    row.innerHTML = `
      <div class="day-name">${name}</div>
      <div class="day-icon">${weatherVisual(d.weather_code[i]).icon}</div>
      <div class="day-rain">${chance > 10 ? `${chance}%` : ""}</div>
      <div></div>
      <div class="day-low">${temp(d.temperature_2m_min[i])}</div>
      <div class="temp-bar"><div style="width:${width}%"></div></div>
      <div><strong>${temp(d.temperature_2m_max[i])}</strong></div>
    `;
    el.appendChild(row);
  });
}

function renderMetrics() {
  const c = state.weather.current;
  const humidityLabel = c.relative_humidity_2m < 35 ? "Dry" : c.relative_humidity_2m < 65 ? "Comfortable" : "Humid";
  const visibilityLabel = c.visibility < 1000 ? "Very low" : c.visibility < 5000 ? "Reduced" : "Clear view";
  const cloudLabel = c.cloud_cover < 25 ? "Mostly clear" : c.cloud_cover < 70 ? "Mixed sky" : "Overcast";
  const precipitationLabel = c.snowfall > 0 ? "Snow falling" : (c.rain + c.showers > 0) ? "Wet outside" : "Dry right now";

  const metrics = [
    ["Humidity", `${c.relative_humidity_2m}%`, humidityLabel],
    ["Wind", speed(c.wind_speed_10m), `Gusts ${speed(c.wind_gusts_10m)}`],
    ["Visibility", distance(c.visibility), visibilityLabel],
    ["Pressure", pressure(c.pressure_msl), "Sea-level pressure"],
    ["Clouds", `${c.cloud_cover}%`, cloudLabel],
    ["Precipitation", precipitation(c.precipitation), precipitationLabel]
  ];

  $("metricsGrid").innerHTML = metrics.map(([label,value,detail]) => `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-detail">${detail}</div>
    </div>
  `).join("");
}

function renderParticles(type) {
  const el = $("weatherParticles");
  el.innerHTML = "";
  if (!["rain","drizzle","storm","snow"].includes(type)) return;
  const count = type === "snow" ? 26 : 38;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = type === "snow" ? "snow-flake" : "rain-drop";
    p.style.left = `${Math.random()*100}%`;
    p.style.animationDuration = `${type === "snow" ? 4+Math.random()*4 : 1+Math.random()*1.6}s`;
    p.style.animationDelay = `${Math.random()*4}s`;
    el.appendChild(p);
  }
}

function updateBackground(type, isDay) {
  const bg = document.querySelector(".background");
  const gradients = {
    clear: isDay ? "linear-gradient(150deg,#4477ff,#5bcbe4 55%,#f6aa73)" : "linear-gradient(150deg,#0e1530,#242f76,#3053a3)",
    partly: "linear-gradient(150deg,#4f79e9,#7ca8c9,#88c9d8)",
    cloudy: "linear-gradient(150deg,#66748f,#597398,#5f6f9e)",
    fog: "linear-gradient(150deg,#8793aa,#71859f,#8ba4b6)",
    drizzle: "linear-gradient(150deg,#465b91,#496f9b,#566c8d)",
    rain: "linear-gradient(150deg,#343c69,#345e8e,#4d5f7a)",
    storm: "linear-gradient(150deg,#252846,#384f78,#423e65)",
    snow: "linear-gradient(150deg,#78a9c8,#8fc5dc,#d9ecf4)"
  };
  bg.style.background = gradients[type] || gradients.clear;
}


const BUILT_IN_PRESETS = [
  { id:"dry-sun", name:"Palm Desert", label:"Dry sun", emoji:"☀️", type:"dry-sun", tempF:101 },
  { id:"humid-sun", name:"Wet Heat City", label:"Wet sun", emoji:"🌤️", type:"humid-sun", tempF:91 },
  { id:"sunshower", name:"Sunshower Bay", label:"Sunny rain", emoji:"🌦️", type:"sunshower", tempF:84 },
  { id:"rain", name:"Rain District", label:"Steady rain", emoji:"🌧️", type:"rain", tempF:68 },
  { id:"storm", name:"Thunder City", label:"Storm", emoji:"⛈️", type:"storm", tempF:76 },
  { id:"fog", name:"Fog Harbor", label:"Dense fog", emoji:"🌫️", type:"fog", tempF:57 },
  { id:"snow", name:"Snow Village", label:"Snow", emoji:"🌨️", type:"snow", tempF:24 },
  { id:"cloudy", name:"Grey Town", label:"Cloudy", emoji:"☁️", type:"cloudy", tempF:62 },
  { id:"night-clear", name:"Midnight Coast", label:"Clear night", emoji:"🌙", type:"night-clear", tempF:71 }
];

function celsiusFromF(f) { return (f - 32) * 5 / 9; }

function presetProfile(type, tempF) {
  const tempC = celsiusFromF(tempF);
  const profiles = {
    "dry-sun": { code:0, humidity:18, apparent:tempC+1, precip:0, rainChance:0, cloud:2, wind:13, gust:22, visibility:30000, pressure:1009, isDay:1 },
    "humid-sun": { code:0, humidity:86, apparent:tempC+5, precip:0, rainChance:12, cloud:13, wind:9, gust:17, visibility:18000, pressure:1014, isDay:1 },
    "sunshower": { code:80, humidity:79, apparent:tempC+3, precip:1.4, rainChance:58, cloud:38, wind:14, gust:26, visibility:12000, pressure:1011, isDay:1 },
    "rain": { code:63, humidity:92, apparent:tempC-1, precip:3.8, rainChance:91, cloud:96, wind:18, gust:34, visibility:6500, pressure:1004, isDay:1 },
    "storm": { code:95, humidity:88, apparent:tempC+2, precip:8.4, rainChance:98, cloud:100, wind:31, gust:64, visibility:3200, pressure:997, isDay:1 },
    "fog": { code:45, humidity:98, apparent:tempC-1, precip:0, rainChance:12, cloud:100, wind:4, gust:7, visibility:450, pressure:1018, isDay:1 },
    "snow": { code:73, humidity:89, apparent:tempC-5, precip:2.1, rainChance:88, cloud:94, wind:17, gust:30, visibility:2700, pressure:1006, isDay:1 },
    "cloudy": { code:3, humidity:66, apparent:tempC-1, precip:0, rainChance:19, cloud:91, wind:12, gust:21, visibility:19000, pressure:1015, isDay:1 },
    "night-clear": { code:0, humidity:54, apparent:tempC-1, precip:0, rainChance:2, cloud:3, wind:7, gust:12, visibility:30000, pressure:1017, isDay:0 }
  };
  return profiles[type] || profiles["dry-sun"];
}

function makeTestWeather(preset) {
  const profile = presetProfile(preset.type, preset.tempF);
  const base = celsiusFromF(preset.tempF);
  const now = new Date();
  const hourlyTimes = [];
  const hourlyTemps = [];
  const hourlyFeels = [];
  const hourlyHumidity = [];
  const hourlyRainChance = [];
  const hourlyPrecip = [];
  const hourlyCodes = [];
  const hourlyWind = [];
  const hourlyUV = [];
  const hourlyVisibility = [];

  for (let i = 0; i < 72; i++) {
    const t = new Date(now.getTime() + i * 3600000);
    hourlyTimes.push(t.toISOString().slice(0,13) + ":00");
    const wave = Math.sin((i + 2) / 4) * 2.4;
    hourlyTemps.push(base + wave);
    hourlyFeels.push(profile.apparent + wave);
    hourlyHumidity.push(Math.max(10, Math.min(100, profile.humidity - wave * 2)));
    hourlyRainChance.push(profile.rainChance);
    hourlyPrecip.push(profile.precip);
    hourlyCodes.push(profile.code);
    hourlyWind.push(profile.wind);
    hourlyUV.push(profile.isDay ? Math.max(0, 8 - Math.abs((i % 24) - 13)) : 0);
    hourlyVisibility.push(profile.visibility);
  }

  const dailyTimes = [];
  const maxs = [], mins = [], codes = [], sunrise = [], sunset = [], uvmax = [], psum = [], pchance = [], windmax = [], gustmax = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    dailyTimes.push(d.toISOString().slice(0,10));
    maxs.push(base + 3 - i * .15);
    mins.push(base - 5 - i * .12);
    codes.push(profile.code);
    sunrise.push(d.toISOString().slice(0,10) + "T06:30");
    sunset.push(d.toISOString().slice(0,10) + "T20:10");
    uvmax.push(profile.isDay ? 8 : 0);
    psum.push(profile.precip * 4);
    pchance.push(profile.rainChance);
    windmax.push(profile.wind + 5);
    gustmax.push(profile.gust);
  }

  return {
    current: {
      temperature_2m: base,
      relative_humidity_2m: profile.humidity,
      apparent_temperature: profile.apparent,
      is_day: profile.isDay,
      precipitation: profile.precip,
      rain: ["rain","storm","sunshower"].includes(preset.type) ? profile.precip : 0,
      showers: preset.type === "sunshower" ? profile.precip : 0,
      snowfall: preset.type === "snow" ? 1.8 : 0,
      weather_code: profile.code,
      cloud_cover: profile.cloud,
      pressure_msl: profile.pressure,
      surface_pressure: profile.pressure - 3,
      wind_speed_10m: profile.wind,
      wind_direction_10m: 165,
      wind_gusts_10m: profile.gust,
      visibility: profile.visibility
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: hourlyTemps,
      relative_humidity_2m: hourlyHumidity,
      apparent_temperature: hourlyFeels,
      precipitation_probability: hourlyRainChance,
      precipitation: hourlyPrecip,
      weather_code: hourlyCodes,
      wind_speed_10m: hourlyWind,
      uv_index: hourlyUV,
      visibility: hourlyVisibility
    },
    daily: {
      time: dailyTimes,
      weather_code: codes,
      temperature_2m_max: maxs,
      temperature_2m_min: mins,
      sunrise, sunset,
      uv_index_max: uvmax,
      precipitation_sum: psum,
      precipitation_probability_max: pchance,
      wind_speed_10m_max: windmax,
      wind_gusts_10m_max: gustmax
    }
  };
}

function activatePreset(preset) {
  state.testPreset = preset;
  state.weather = makeTestWeather(preset);
  $("locationName").textContent = preset.name;
  $("testModeBadge").classList.remove("hidden");
  renderWeather();
  applyLivingWorld();
  $("locationName").textContent = preset.name;
  $("locationCity").textContent = "Developer preview";
  $("updatedAt").textContent = preset.label;
  closeSheets();
  showToast(`${preset.label} world loaded`);
}

function exitTestMode() {
  state.testPreset = null;
  $("testModeBadge").classList.add("hidden");
  fetchWeather(selectedPlace());
}

function savePresetAsTestCity(preset) {
  const duplicate = state.customPresets.some(p => p.name === preset.name && p.type === preset.type);
  if (!duplicate) {
    state.customPresets.push({ ...preset, id: crypto.randomUUID() });
    localStorage.setItem("atmos-custom-presets", JSON.stringify(state.customPresets));
    renderWeatherLab();
  }
  showToast(duplicate ? "Already saved" : "Test city saved");
}

function renderWeatherLab() {
  const grid = $("weatherPresetGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const all = [...BUILT_IN_PRESETS, ...state.customPresets];
  all.forEach(preset => {
    const card = document.createElement("div");
    card.className = `preset-card preset-${preset.type}`;
    card.innerHTML = `
      <span class="preset-emoji">${preset.emoji || weatherVisual(presetProfile(preset.type,preset.tempF).code).icon}</span>
      <button class="preset-save" type="button" aria-label="Save test city">＋</button>
      <strong>${preset.name}</strong>
      <small>${preset.label} · ${preset.tempF}°F</small>
    `;
    card.addEventListener("click", e => {
      if (e.target.closest(".preset-save")) return;
      activatePreset(preset);
    });
    card.querySelector(".preset-save").addEventListener("click", e => {
      e.stopPropagation();
      savePresetAsTestCity(preset);
    });
    grid.appendChild(card);
  });

  if (state.testPreset) {
    const exit = document.createElement("button");
    exit.className = "lab-save-button";
    exit.textContent = "Return to real weather";
    exit.addEventListener("click", exitTestMode);
    grid.appendChild(exit);
  }
}

function weatherEmojiForType(type) {
  return {
    "dry-sun":"☀️","humid-sun":"🌤️","sunshower":"🌦️","rain":"🌧️",
    "storm":"⛈️","fog":"🌫️","snow":"🌨️","cloudy":"☁️","night-clear":"🌙"
  }[type] || "☀️";
}

async function reverseGeocodePoint(latitude,longitude) {
  try {
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,{
      headers:{"Accept-Language":"en"}
    });
    if (!res.ok) throw new Error();
    const data=await res.json();
    const a=data.address||{};
    return {
      name:a.city || a.town || a.village || a.municipality || a.county || data.name || "Selected location",
      admin:a.state || a.province || a.region || "",
      countryCode:(a.country_code||"").toUpperCase()
    };
  } catch {
    return {name:"Selected location",admin:"",countryCode:""};
  }
}

async function useCurrentLocation(options = {}) {
  if (!navigator.geolocation) {
    showToast("Location is not supported");
    return;
  }
  $("locationName").textContent="My Location";
  $("locationCity").textContent="Finding your city…";
  $("updatedAt").textContent="";

  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    const geo=await reverseGeocodePoint(latitude,longitude);
    let place=state.places.find(p=>p.isCurrentLocation || p.id==="current-location" || p.countryCode==="LOC");
    if (!place) { place={...DEFAULT_PLACE}; state.places.unshift(place); }
    Object.assign(place,{
      id:"current-location",name:geo.name,admin:geo.admin,countryCode:"LOC",
      actualCountryCode:geo.countryCode,latitude,longitude,isAirport:false,kind:"city",isCurrentLocation:true
    });
    state.selectedPlaceId=place.id;
    saveState();renderSavedPlaces();
    if (!options.keepSheet) closeSheets();
    fetchWeather(place);
    if (state.map) state.map.setView([latitude,longitude],8);
  }, () => {
    $("locationCity").textContent="Location permission needed";
    $("updatedAt").textContent="Use search or map instead";
    showToast("Allow location access in Safari settings");
    const fallback=state.places.find(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&!p.isCurrentLocation);
    if (fallback && options.allowFallback!==false) { state.selectedPlaceId=fallback.id; fetchWeather(fallback); }
  }, { enableHighAccuracy:false,timeout:15000,maximumAge:300000 });
}

async function searchPlaces(query) {
  const el = $("searchResults");
  if (query.trim().length < 2) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `<div class="sheet-row">Searching…</div>`;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const allowed = ["US","CA","MX","GL","BM","PM"];
    const results = (data.results || []).filter(r => allowed.includes(r.country_code));

    el.innerHTML = results.length ? "" : `<div class="sheet-row">No North American results</div>`;
    results.forEach(r => {
      const isAirport = /airport|international/i.test(r.name) || r.feature_code === "AIRP";
      const row = document.createElement("button");
      row.className = "sheet-row";
      row.innerHTML = `
        <span>${isAirport ? "✈︎" : "⌖"}</span>
        <div><strong>${r.name}</strong><small>${[r.admin1,r.country_code].filter(Boolean).join(", ")}</small></div>
      `;
      row.onclick = () => addPlace({
        id: crypto.randomUUID(),
        name: r.name,
        admin: r.admin1 || "",
        countryCode: r.country_code,
        latitude: r.latitude,
        longitude: r.longitude,
        isAirport,
      kind: isAirport ? "airport" : "city"
      });
      el.appendChild(row);
    });
  } catch {
    el.innerHTML = `<div class="sheet-row">Search failed</div>`;
  }
}

function addPlace(place) {
  const existing = state.places.find(p =>
    Math.abs(p.latitude - place.latitude) < .01 &&
    Math.abs(p.longitude - place.longitude) < .01
  );
  const selected = existing || place;
  if (!existing) state.places.push(place);
  state.selectedPlaceId = selected.id;
  saveState();
  renderSavedPlaces();
  closeSheets();
  fetchWeather(selected);
}

function renderSavedPlaces() {
  const el = $("savedPlaces");
  el.innerHTML = "";
  state.places.forEach(place => {
    const row = document.createElement("div");
    row.className = "sheet-row";
    row.innerHTML = `
      <span>${placeKind(place) === "airport" ? "✈︎" : placeKind(place) === "beach" ? "≈" : place.countryCode === "LOC" ? "⌖" : "⌖"}</span>
      <div><strong>${place.name}</strong><small>${[place.admin,place.countryCode].filter(Boolean).join(", ")}</small></div>
      <div class="place-actions"><button aria-label="Delete">×</button></div>
    `;
    row.onclick = e => {
      if (e.target.closest("button")) return;
      state.selectedPlaceId = place.id;
      saveState();
      closeSheets();
      fetchWeather(place);
    };
    row.querySelector("button").onclick = () => {
      if (state.places.length === 1) {
        showToast("Keep at least one place");
        return;
      }
      state.places = state.places.filter(p => p.id !== place.id);
      if (state.selectedPlaceId === place.id) state.selectedPlaceId = state.places[0].id;
      saveState();
      renderSavedPlaces();
      fetchWeather(selectedPlace());
    };
    el.appendChild(row);
  });
}


let mapCityLayer=null;
let mapLoadTimer=null;

function openWeatherMap() {
  closeSheets();
  $("mapPanel").classList.remove("hidden");
  const place=selectedPlace();
  setTimeout(()=>{
    if (!window.L) { $("mapStatus").textContent="Map library couldn’t load"; return; }
    if (!state.map) {
      state.map=L.map("weatherMap",{zoomControl:true,worldCopyJump:true}).setView([
        Number.isFinite(place?.latitude)?place.latitude:39,
        Number.isFinite(place?.longitude)?place.longitude:-98
      ],Number.isFinite(place?.latitude)?7:4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:18,attribution:"© OpenStreetMap contributors"
      }).addTo(state.map);
      mapCityLayer=L.layerGroup().addTo(state.map);
      state.map.on("click",handleMapClick);
      state.map.on("moveend",scheduleMapCities);
    } else {
      state.map.invalidateSize();
      if (Number.isFinite(place?.latitude)) state.map.setView([place.latitude,place.longitude],7);
    }
    scheduleMapCities();
  },120);
}

function closeWeatherMap(){ $("mapPanel").classList.add("hidden"); }

function scheduleMapCities(){
  clearTimeout(mapLoadTimer);
  mapLoadTimer=setTimeout(loadMapCities,450);
}

async function loadMapCities(){
  if (!state.map || state.map.getZoom()<5) {
    $("mapStatus").textContent="Zoom in to reveal clickable cities";
    mapCityLayer?.clearLayers(); return;
  }
  const b=state.map.getBounds();
  const bbox=`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  $("mapStatus").textContent="Loading cities in this area…";
  const query=`[out:json][timeout:18];(node["place"="city"](${bbox});node["capital"](${bbox}););out tags 250;`;
  try {
    const res=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if(!res.ok) throw new Error();
    const data=await res.json();
    const cities=(data.elements||[]).filter(x=>x.tags?.name).map(x=>({
      name:x.tags.name,admin:x.tags["is_in:state"]||x.tags["addr:state"]||"",
      countryCode:x.tags["addr:country"]||"",latitude:x.lat,longitude:x.lon,
      population:Number(String(x.tags.population||"0").replace(/[^0-9]/g,""))||0,
      capital:Boolean(x.tags.capital)
    })).sort((a,b)=>(b.capital-a.capital)||(b.population-a.population)).slice(0,100);
    mapCityLayer.clearLayers();
    cities.forEach(city=>{
      const major=city.population>=350000;
      const cls=`city-map-marker${city.capital?" capital":major?" major":""}`;
      const icon=L.divIcon({className:cls,html:`<span class="city-dot"></span>${city.capital||major?`<span class="city-map-label">${city.name}</span>`:""}`,iconSize:[24,34],iconAnchor:[12,12]});
      L.marker([city.latitude,city.longitude],{icon,title:city.name}).addTo(mapCityLayer).on("click",()=>selectMapPlace(city));
    });
    $("mapStatus").textContent=`${cities.length} cities loaded · orange = capital · gold = major city`;
  } catch {
    $("mapStatus").textContent="Couldn’t load city markers. You can still tap anywhere.";
  }
}

async function handleMapClick(e){
  $("mapStatus").textContent="Identifying this location…";
  const geo=await reverseGeocodePoint(e.latlng.lat,e.latlng.lng);
  selectMapPlace({name:geo.name,admin:geo.admin,countryCode:geo.countryCode,latitude:e.latlng.lat,longitude:e.latlng.lng});
}

function selectMapPlace(city){
  const place={id:crypto.randomUUID(),name:city.name||"Selected location",admin:city.admin||"",countryCode:city.countryCode||"",latitude:city.latitude,longitude:city.longitude,isAirport:false,kind:"city",fromMap:true};
  closeWeatherMap();
  addPlace(place);
}

function outfitRecommendation() {
  const c = state.weather.current;
  const feels = c.apparent_temperature;
  const visual = weatherVisual(c.weather_code);
  const items = [];

  if (feels >= 29) {
    items.push(item("Light T-shirt","👕","Breathable top for high heat.","upper"));
    items.push(item("Shorts","🩳","Keeps your lower body cooler.","lower"));
    items.push(item("Sneakers","👟","Comfortable for hot pavement.","feet"));
  } else if (feels >= 20) {
    items.push(item("T-shirt","👕","Comfortable in mild-to-warm air.","upper"));
    items.push(item("Light pants or shorts","👖","Either works at this temperature.","lower"));
    items.push(item("Sneakers","👟","No insulation needed.","feet"));
  } else if (feels >= 12) {
    items.push(item("Light layer","🧥","A hoodie or overshirt handles the chill.","upper"));
    items.push(item("Long pants","👖","Better coverage in cool air.","lower"));
    items.push(item("Closed shoes","👟","Keeps feet comfortable.","feet"));
  } else if (feels >= 3) {
    items.push(item("Jacket","🧥","Insulation for cold conditions.","upper"));
    items.push(item("Long pants","👖","Full coverage matters.","lower"));
    items.push(item("Warm shoes","🥾","Avoid thin footwear.","feet"));
  } else {
    items.push(item("Insulated coat","🧥","Protects your core in freezing air.","upper"));
    items.push(item("Warm pants","👖","Use thicker fabric or a base layer.","lower"));
    items.push(item("Boots","🥾","Warm grip for cold or icy ground.","feet"));
    items.push(item("Beanie","🧢","Reduces heat loss.","head"));
    items.push(item("Gloves","🧤","Protects fingers from wind chill.","hands"));
  }

  if (["rain","drizzle","storm"].includes(visual.type) || c.precipitation > 0) {
    items.push(item("Rain shell","☂️","Waterproof outer layer.","accessory"));
  }
  if (c.wind_gusts_10m >= 35) {
    items.push(item("Wind-resistant layer","💨","Helps against strong gusts.","upper"));
  }

  const currentHour = new Date().getHours();
  const uv = state.weather.hourly.uv_index[currentHour] || 0;
  if (c.is_day && uv >= 5) {
    items.push(item("Sunglasses + SPF","🕶️","UV is strong enough for protection.","accessory"));
  }

  if (c.relative_humidity_2m >= 75 && feels >= 20) {
    items.push(item("Moisture-wicking fabric","💧","Humidity will make sweat linger.","upper"));
  }

  let headline = "Keep it light";
  if (feels >= 29) headline = "Dress for heat";
  else if (feels >= 20) headline = "Keep it light";
  else if (feels >= 12) headline = "Add one layer";
  else if (feels >= 3) headline = "Jacket weather";
  else headline = "Bundle up";

  return {
    headline,
    explanation: "Built from the feels-like temperature, rain, wind, humidity, visibility, and UV—not temperature alone.",
    items
  };
}

function item(name, icon, reason, zone) { return {name, icon, reason, zone}; }

function openOutfit() {
  if (!state.weather) return;
  const rec = outfitRecommendation();
  $("outfitHeadline").textContent = rec.headline;
  $("outfitExplanation").textContent = rec.explanation;
  $("outfitList").innerHTML = rec.items.map(i => `
    <div class="outfit-item">
      <div class="outfit-icon">${i.icon}</div>
      <div><strong>${i.name}</strong><small>${i.reason}</small></div>
    </div>
  `).join("");

  document.querySelectorAll(".active-zone").forEach(el => el.classList.remove("active-zone"));
  const zones = new Set(rec.items.map(i => i.zone));
  if (zones.has("head")) $("zoneHead").classList.add("active-zone");
  if (zones.has("upper")) $("zoneUpper").classList.add("active-zone");
  if (zones.has("hands")) {
    $("zoneHandsLeft").classList.add("active-zone");
    $("zoneHandsRight").classList.add("active-zone");
  }
  if (zones.has("lower")) {
    $("zoneLowerLeft").classList.add("active-zone");
    $("zoneLowerRight").classList.add("active-zone");
  }
  if (zones.has("feet")) {
    $("zoneFeetLeft").classList.add("active-zone");
    $("zoneFeetRight").classList.add("active-zone");
  }
  $("accessoryChip").classList.toggle("hidden", !zones.has("accessory"));
  $("outfitPanel").classList.remove("hidden");
}

function openSheet(id) {
  closeSheets();
  $("sheetBackdrop").classList.remove("hidden");
  $(id).classList.remove("hidden");
}

function closeSheets() {
  $("sheetBackdrop").classList.add("hidden");
  $("placesSheet").classList.add("hidden");
  $("settingsSheet").classList.add("hidden");
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

$("placesButton").onclick = () => openSheet("placesSheet");
$("locationPill").onclick = () => openSheet("placesSheet");
$("settingsButton").onclick = () => openSheet("settingsSheet");
$("sheetBackdrop").onclick = closeSheets;
document.querySelectorAll("[data-close-sheet]").forEach(b => b.onclick = closeSheets);
$("currentLocationButton").onclick = () => useCurrentLocation();
$("openMapButton")?.addEventListener("click", openWeatherMap);
$("closeMap")?.addEventListener("click", closeWeatherMap);
$("mapLocateButton")?.addEventListener("click", () => useCurrentLocation({keepSheet:true}));
$("beachCommunityCard")?.addEventListener("click", openBeachCommunity);
$("closeBeachCommunity")?.addEventListener("click", () => $("beachCommunityPanel").classList.add("hidden"));
let authMode="login";
async function refreshAccountUI() {
  const profile=await window.AtmosBackend?.getProfile?.().catch(()=>null);
  const logged=Boolean(profile?.user);
  $("authLoggedOut")?.classList.toggle("hidden",logged); $("authLoggedIn")?.classList.toggle("hidden",!logged);
  if(logged){
    const name=profile.displayName; $("accountName").textContent=name; $("accountSubtitle").textContent="Cloud sync on · "+profile.user.email;
    $("accountAvatar").textContent=name.charAt(0).toUpperCase(); $("profileAvatar").textContent=name.charAt(0).toUpperCase(); $("profileName").textContent=name; $("profileEmail").textContent=profile.user.email||""; $("profileDisplayName").value=name; $("reviewAuthor").value=name;
  } else { $("accountName").textContent="Log in or sign up"; $("accountSubtitle").textContent="Sync saved places and beach reviews to the cloud"; $("accountAvatar").textContent="A"; }
}
function openAccountPanel(){ closeSheets(); $("accountPanel").classList.remove("hidden"); refreshAccountUI(); }
async function mergeCloudPlaces(){
  const cloud=await window.AtmosBackend?.loadSavedPlaces?.(); if(!cloud?.length) return;
  cloud.forEach(place=>{if(!state.places.some(p=>Math.abs(Number(p.latitude)-place.latitude)<.001&&Math.abs(Number(p.longitude)-place.longitude)<.001))state.places.push(place)}); saveState(); renderSavedPlaces();
}
async function submitAuth(){
  const email=$("authEmail").value.trim(), password=$("authPassword").value, name=$("authDisplayName").value.trim(); const msg=$("authMessage"), btn=$("authSubmit");
  if(!email||password.length<6||(authMode==='signup'&&!name)){msg.textContent="Complete every field. Password must be at least 6 characters.";return}
  btn.disabled=true;btn.textContent=authMode==='signup'?"Creating account…":"Logging in…";msg.textContent="";
  try{if(authMode==='signup'){const data=await window.AtmosBackend.signUp(email,password,name);msg.textContent=data.session?"Account created.":"Account created. Check your email if confirmation is enabled.";}else await window.AtmosBackend.signIn(email,password);await refreshAccountUI();await mergeCloudPlaces();showToast(authMode==='signup'?"Atmos account created":"Logged in and cloud synced");}
  catch(e){msg.textContent=e.message||"Couldn’t continue."}finally{btn.disabled=false;btn.textContent=authMode==='signup'?"Create account":"Log in"}
}
async function sha256Text(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}

$("accountButton")?.addEventListener("click",openAccountPanel); $("closeAccount")?.addEventListener("click",()=>$("accountPanel").classList.add("hidden"));
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.addEventListener("click",()=>{authMode=b.dataset.authMode;document.querySelectorAll("[data-auth-mode]").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".signup-only").forEach(x=>x.classList.toggle("hidden",authMode!=="signup"));$("authSubmit").textContent=authMode==='signup'?"Create account":"Log in";$("authPassword").autocomplete=authMode==='signup'?"new-password":"current-password";}));
$("authSubmit")?.addEventListener("click",submitAuth); $("signOutButton")?.addEventListener("click",async()=>{await window.AtmosBackend.signOut();await refreshAccountUI();showToast("Logged out")});
$("saveProfile")?.addEventListener("click",async()=>{const n=$("profileDisplayName").value.trim();if(!n)return;await window.AtmosBackend.updateProfile(n);await refreshAccountUI();showToast("Profile saved")});
$("syncCloudNow")?.addEventListener("click",async()=>{await window.AtmosBackend.savePlaces(state.places);await mergeCloudPlaces();showToast("Cloud sync complete")});
window.AtmosBackend?.onAuthStateChange?.(()=>setTimeout(refreshAccountUI,0)); refreshAccountUI();

$("submitBeachReview")?.addEventListener("click", submitBeachReview);
$("reviewAuthor") && ($("reviewAuthor").value = localStorage.getItem("atmos-review-author") || "");
$("aiOverviewCard").onclick = openOutfit;
$("closeOutfit").onclick = () => $("outfitPanel").classList.add("hidden");

document.querySelectorAll(".theme-choice").forEach(btn => {
  btn.addEventListener("click", () => setTheme(btn.dataset.theme));
});
document.querySelectorAll(".accent-swatches button").forEach(btn => {
  btn.addEventListener("click", () => setAccent(btn.dataset.accent));
});
applyTheme();

$("developerAccountButton")?.addEventListener("click", () => {
  if(sessionStorage.getItem("atmos-dev-unlocked")==="1") { $("developerLab").classList.toggle("hidden"); renderWeatherLab(); return; }
  $("developerPasswordPanel").classList.remove("hidden"); $("developerPassword").focus();
});
$("closeDeveloperPassword")?.addEventListener("click",()=>$("developerPasswordPanel").classList.add("hidden"));
$("unlockDeveloper")?.addEventListener("click",async()=>{const hash=await sha256Text($("developerPassword").value);if(hash==="46bf836bff542658b261c3b920979f1a8de31698923561ff46516b3f02cbf3e1"){sessionStorage.setItem("atmos-dev-unlocked","1");$("developerPasswordPanel").classList.add("hidden");$("developerLab").classList.remove("hidden");renderWeatherLab();showToast("Developer options unlocked")}else{$("developerPasswordMessage").textContent="Incorrect password"}});

$("saveCustomPreset")?.addEventListener("click", () => {
  const type = $("customPresetType").value;
  const name = $("customPresetName").value.trim() || "Custom Weather";
  const tempF = Number($("customPresetTemp").value);
  const safeTemp = Number.isFinite(tempF) ? Math.max(-20, Math.min(125, tempF)) : 72;
  const label = $("customPresetType").selectedOptions[0].textContent;
  const preset = {
    id: crypto.randomUUID(),
    name,
    label,
    emoji: weatherEmojiForType(type),
    type,
    tempF: safeTemp
  };
  state.customPresets.push(preset);
  localStorage.setItem("atmos-custom-presets", JSON.stringify(state.customPresets));
  $("customPresetName").value = "";
  renderWeatherLab();
  activatePreset(preset);
});

$("placeSearchInput").addEventListener("input", e => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => searchPlaces(e.target.value), 350);
});

$("temperatureUnit").value = state.settings.temperatureUnit;
$("speedUnit").value = state.settings.speedUnit;
$("measurementSystem").value = state.settings.measurementSystem;
$("outfitToggle").checked = state.settings.personalizedOutfits;
$("alertToggle").checked = state.settings.alerts;

$("temperatureUnit").onchange = e => { state.settings.temperatureUnit = e.target.value; saveState(); renderWeather(); };
$("speedUnit").onchange = e => { state.settings.speedUnit = e.target.value; saveState(); renderWeather(); };
$("measurementSystem").onchange = e => { state.settings.measurementSystem = e.target.value; saveState(); renderWeather(); };
$("outfitToggle").onchange = e => { state.settings.personalizedOutfits = e.target.checked; saveState(); };
$("alertToggle").onchange = e => { state.settings.alerts = e.target.checked; saveState(); };

$("refreshNearbyButton")?.addEventListener("click", () => findNearbyPlaces(selectedPlace()));

renderSavedPlaces();
useCurrentLocation({allowFallback:true});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}


document.addEventListener("pointermove", e => {
  const card = e.target.closest(".glass-card, .metric-card, .nearby-card");
  if (!card || window.matchMedia("(pointer: coarse)").matches) return;
  const r = card.getBoundingClientRect();
  const x = (e.clientX-r.left)/r.width-.5;
  const y = (e.clientY-r.top)/r.height-.5;
  card.style.transform = `perspective(800px) rotateX(${(-y*2.8).toFixed(2)}deg) rotateY(${(x*3.4).toFixed(2)}deg)`;
});
document.addEventListener("pointerout", e => {
  const card=e.target.closest(".glass-card, .metric-card, .nearby-card");
  if (card) card.style.transform="";
});

document.addEventListener("click",e=>{
  if (e.target.closest("button") && navigator.vibrate) navigator.vibrate(8);
});


// Start an anonymous backend session early when Supabase is configured.
if (window.AtmosBackend?.configured) {
  window.AtmosBackend.ensureSession().catch(error => console.warn("Atmos backend unavailable", error));
}
