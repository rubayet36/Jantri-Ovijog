// fare.js - UPDATED WITH TRAFFIC LAYER
// Features: Map + Fare + Smart MRT + Expanded Bus Data + Modern UI + Animated Dot + Traffic

let map;
let fromMarker = null;
let toMarker = null;
let routeLine = null;
let routeDot = null;         // Track the animated dot
let routeDotInterval = null; // Track the animation timer

// 🚦 Traffic Variables
let trafficLayer = null;
let isTrafficOn = false;
// ⚠️ REPLACE THIS WITH YOUR FREE TOMTOM API KEY
const TOMTOM_API_KEY = "qCawRch2qccj6PUlwitJBAT1JJp0KbFb";

// MRT variables
let metroLayerGroup = L.layerGroup();
const metroStations = [
  { name: "Uttara North", lat: 23.8734, lng: 90.3961 },
  { name: "Uttara Center", lat: 23.8674, lng: 90.3942 },
  { name: "Uttara South", lat: 23.8584, lng: 90.3912 },
  { name: "Pallabi", lat: 23.8248, lng: 90.3653 },
  { name: "Mirpur 11", lat: 23.8169, lng: 90.3664 },
  { name: "Mirpur 10", lat: 23.8071, lng: 90.3686 },
  { name: "Kazipara", lat: 23.7961, lng: 90.3721 },
  { name: "Shewrapara", lat: 23.7876, lng: 90.3751 },
  { name: "Agargaon", lat: 23.7780, lng: 90.3787 },
  { name: "Bijoy Sarani", lat: 23.7648, lng: 90.3861 },
  { name: "Farmgate", lat: 23.7561, lng: 90.3895 },
  { name: "Karwan Bazar", lat: 23.7505, lng: 90.3934 },
  { name: "Shahbag", lat: 23.7410, lng: 90.3971 },
  { name: "Dhaka Univ.", lat: 23.7335, lng: 90.3995 },
  { name: "Press Club", lat: 23.7295, lng: 90.4065 },
  { name: "Motijheel", lat: 23.7330, lng: 90.4172 },
  { name: "Kamalapur", lat: 23.7370, lng: 90.4248 }
];

// --- BUS DATA (Hubs & Routes) ---
const BUS_HUBS = [
  { id: "Uttara", lat: 23.8731, lng: 90.3962, r: 3.5 },
  { id: "Airport", lat: 23.8513, lng: 90.4069, r: 2.0 },
  { id: "Abdullahpur", lat: 23.8797, lng: 90.4005, r: 2.0 },
  { id: "Tongi", lat: 23.8915, lng: 90.4023, r: 3.0 },
  { id: "Gabtoli", lat: 23.7832, lng: 90.3442, r: 3.0 },
  { id: "Mirpur-1", lat: 23.7956, lng: 90.3537, r: 2.0 },
  { id: "Mirpur-10", lat: 23.8071, lng: 90.3686, r: 2.5 },
  { id: "Kallyanpur", lat: 23.7797, lng: 90.3581, r: 1.5 },
  { id: "Mohammadpur", lat: 23.7594, lng: 90.3583, r: 2.0 },
  { id: "Farmgate", lat: 23.7575, lng: 90.3890, r: 2.5 },
  { id: "KarwanBazar", lat: 23.7515, lng: 90.3916, r: 1.8 },
  { id: "Shahbag", lat: 23.7376, lng: 90.3954, r: 2.0 },
  { id: "NewMarket", lat: 23.7333, lng: 90.3854, r: 1.8 },
  { id: "Dhanmondi", lat: 23.7465, lng: 90.3760, r: 2.0 },
  { id: "Kuril", lat: 23.8103, lng: 90.4125, r: 2.0 },
  { id: "Badda", lat: 23.7805, lng: 90.4210, r: 2.0 },
  { id: "Rampura", lat: 23.7615, lng: 90.4203, r: 2.0 },
  { id: "Malibagh", lat: 23.7486, lng: 90.4114, r: 1.8 },
  { id: "Motijheel", lat: 23.7330, lng: 90.4172, r: 3.0 },
  { id: "Gulistan", lat: 23.7286, lng: 90.4104, r: 3.0 },
  { id: "Kamalapur", lat: 23.7370, lng: 90.4248, r: 2.0 },
  { id: "Sayedabad", lat: 23.7099, lng: 90.4287, r: 3.0 },
  { id: "Jatrabari", lat: 23.7112, lng: 90.4331, r: 3.0 },
  { id: "Savar", lat: 23.8583, lng: 90.2667, r: 4.0 },
  { id: "Keraniganj", lat: 23.6940, lng: 90.3636, r: 3.0 },
  { id: "Demra", lat: 23.7223, lng: 90.4760, r: 3.0 }
];

const BUS_ROUTES = [
  { name: "Raida", stops: ["Abdullahpur", "Uttara", "Airport", "Kuril", "Badda", "Rampura", "Jatrabari"] },
  { name: "Turag", stops: ["Tongi", "Uttara", "Airport", "Kuril", "Badda", "Rampura"] },
  { name: "Airport Bangabandhu", stops: ["Uttara", "Airport", "Mohakhali", "Farmgate", "Shahbag", "Motijheel"] },
  { name: "Bikolpo", stops: ["Mirpur-10", "Mirpur-1", "Kallyanpur", "Farmgate", "Shahbag", "Motijheel"] },
  { name: "Shikho", stops: ["Mirpur-10", "Farmgate", "Shahbag", "Gulistan"] },
  { name: "Basumati", stops: ["Gabtoli", "Mirpur-1", "Farmgate", "Shahbag", "Motijheel"] },
  { name: "Alif", stops: ["Mirpur-10", "Mohakhali", "Kuril"] },
  { name: "8 Number", stops: ["Gabtoli", "Kallyanpur", "Farmgate", "Shahbag", "Jatrabari"] },
  { name: "Achim Paribahan", stops: ["Gabtoli", "Mirpur-10", "Farmgate", "Shahbag", "Gulistan", "Sayedabad"] },
  { name: "Thikana", stops: ["Savar", "Gabtoli", "Farmgate", "Motijheel"] },
  { name: "City Link", stops: ["Savar", "Gabtoli", "Mirpur-10", "Farmgate"] },
  { name: "Somoy", stops: ["Demra", "Jatrabari", "Gulistan", "Shahbag"] },
  { name: "Moitree", stops: ["Keraniganj", "Gulistan", "Motijheel"] },
  { name: "BRTC Mirpur–Motijheel", stops: ["Mirpur-10", "Farmgate", "Shahbag", "Motijheel"] },
  { name: "BRTC Gabtoli–Sayedabad", stops: ["Gabtoli", "Farmgate", "Gulistan", "Sayedabad"] }
];

const DHAKA_BOUNDS = L.latLngBounds(L.latLng(23.65, 90.30), L.latLng(23.95, 90.55));
const routePresetsData = {
  "Uttara → Motijheel": { coords: [[23.8731, 90.3962], [23.7330, 90.4172]] },
  "Mirpur-10 → Motijheel": { coords: [[23.8071, 90.3686], [23.7330, 90.4172]] },
  "Gabtoli → Jatrabari": { coords: [[23.7832, 90.3442], [23.7112, 90.4331]] },
};

document.addEventListener("DOMContentLoaded", () => {
  map = L.map("fareMap", { maxBounds: DHAKA_BOUNDS, minZoom: 11, zoomControl: false }).setView([23.7937, 90.4066], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: 'OSM & CARTO' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  map.on("click", handleMapClick);

  // Event Listeners
  document.getElementById("btnUseCurrent")?.addEventListener("click", useCurrentLocationAsFrom);
  document.getElementById("btnClear")?.addEventListener("click", clearRoute);
  document.getElementById("routePreset")?.addEventListener("change", handleRoutePresetChange);

  // ✅ TRAFFIC TOGGLE LISTENER
  document.getElementById("btnTraffic")?.addEventListener("click", toggleTraffic);
});

// --- 🚦 TRAFFIC FUNCTION ---
function toggleTraffic() {
  const btn = document.getElementById("btnTraffic");

  if (isTrafficOn) {
    // Turn Off
    if (trafficLayer) map.removeLayer(trafficLayer);
    isTrafficOn = false;
    btn.style.backgroundColor = "white";
    btn.style.color = "#333";
    btn.textContent = "🚦 Traffic";
  } else {
    // Turn On
    if (!trafficLayer) {
      trafficLayer = L.tileLayer(`https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`, {
        maxZoom: 22,
        subdomains: ['a', 'b', 'c', 'd']
      });
    }
    trafficLayer.addTo(map);
    isTrafficOn = true;

    // UI Feedback
    btn.style.backgroundColor = "#fee2e2"; // Reddish tint
    btn.style.color = "#991b1b";
    btn.textContent = "🚦 Traffic ON";
  }
}

// --- CORE MAP LOGIC ---

async function handleMapClick(e) {
  if (!DHAKA_BOUNDS.contains(e.latlng)) { alert("Stay inside Dhaka!"); return; }
  const tempPopup = L.popup().setLatLng(e.latlng).setContent('Finding nearest road...').openOn(map);
  try {
    const snapped = await findNearestMainRoad(e.latlng.lat, e.latlng.lng);
    map.closePopup();
    if (!snapped) { alert("No main road found."); return; }
    setMarker(snapped.lat, snapped.lng);
  } catch { map.closePopup(); }
}

function setMarker(lat, lng) {
  if (!fromMarker) { fromMarker = createMarker(lat, lng, "Start"); updateLabels(); }
  else if (!toMarker) { toMarker = createMarker(lat, lng, "End"); updateLabels(); updateRouteIfReady(); }
  else { toMarker.setLatLng([lat, lng]).bindPopup("End").openPopup(); updateLabels(); updateRouteIfReady(); }
}

function createMarker(lat, lng, title) { return L.marker([lat, lng]).addTo(map).bindPopup(title).openPopup(); }

async function findNearestMainRoad(lat, lng) {
  const query = `[out:json];way(around:600,${lat},${lng})["highway"~"^(trunk|primary|secondary|tertiary)$"];out geom;`;
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const d = await r.json();
    if (!d.elements.length) return null;
    let min = Infinity, pt = null;
    d.elements.forEach(el => el.geometry?.forEach(p => {
      let dst = getDistance(lat, lng, p.lat, p.lon);
      if (dst < min) { min = dst; pt = { lat: p.lat, lng: p.lon }; }
    }));
    return pt;
  } catch { return { lat, lng }; }
}

// --- RENDERING UI & ROUTING ---
async function updateRouteIfReady() {
  if (!fromMarker || !toMarker) return;
  const from = fromMarker.getLatLng(), to = toMarker.getLatLng();

  const breakdownEl = document.getElementById("fareBreakdownText");
  if (breakdownEl) breakdownEl.textContent = "Calculating best route...";

  try {
    const rData = await fetchRouteData(from, to);
    drawRoutePreview(rData.coords);

    const busFare = calcBusFare(rData.distanceKm);
    const metroInfo = calcMetro(from, to);
    const busList = findSuggestedBuses(from.lat, from.lng, to.lat, to.lng);
    const distEl = document.getElementById("distanceLabel");
    if (distEl) distEl.textContent = rData.distanceKm.toFixed(1) + " km";

    const fareAmountEl = document.getElementById("fareLabel");
    if (fareAmountEl) {
      fareAmountEl.textContent = busFare + " ৳";
    }

    let recommendedHtml = "";
    if (busList.length > 0) {
      const tagsHtml = busList.map(bus => `<span class="bus-tag">🚌 ${bus}</span>`).join("");
      recommendedHtml = `<div class="recommended-label">Recommended Buses</div><div class="bus-tags">${tagsHtml}</div>`;
    } else {
      recommendedHtml = `<span class="no-bus-msg">Check local counters (No direct database match)</span>`;
    }

    let metroHtmlSection = "";
    if (metroInfo.available) {
      metroHtmlSection = `<div class="metro-section"><div class="metro-header"><div class="metro-title">🚇 Metro Rail</div><div class="metro-fare">${metroInfo.fare} ৳</div></div><div class="metro-details">${metroInfo.details}</div></div>`;
    }

    const breakdownContainer = document.getElementById("fareBreakdownText");
    if (breakdownContainer) {
      breakdownContainer.innerHTML = recommendedHtml + metroHtmlSection;
    }

  } catch (e) { console.error(e); }
}

// --- HELPER LOGIC ---

function findSuggestedBuses(startLat, startLng, endLat, endLng) {
  const startHub = BUS_HUBS.find(h => getDistance(startLat, startLng, h.lat, h.lng) <= h.r);
  const endHub = BUS_HUBS.find(h => getDistance(endLat, endLng, h.lat, h.lng) <= h.r);

  if (!startHub || !endHub) return [];
  if (startHub.id === endHub.id && getDistance(startLat, startLng, endLat, endLng) < 3) return [];

  const matches = BUS_ROUTES.filter(bus => bus.stops.includes(startHub.id) && bus.stops.includes(endHub.id));
  return matches.map(b => b.name);
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchRouteData(f, t) {
  const u = `https://router.project-osrm.org/route/v1/driving/${f.lng},${f.lat};${t.lng},${t.lat}?overview=full&geometries=geojson`;
  const d = await (await fetch(u)).json();
  return { distanceKm: d.routes[0].distance / 1000, coords: d.routes[0].geometry.coordinates.map(([x, y]) => [y, x]) };
}

function calcBusFare(km) { return Math.ceil(Math.max(10, km * 2.45) / 5) * 5; }

function calcMetro(f, t) {
  const getSt = p => {
    let m = { d: Infinity, s: null }; metroStations.forEach(s => { let d = getDistance(p.lat, p.lng, s.lat, s.lng); if (d < m.d) m = { d, s }; });
    return m;
  };
  const s1 = getSt(f), s2 = getSt(t);

  if (s1.d > 2.0 || s2.d > 2.0 || s1.s.name === s2.s.name) {
    metroLayerGroup.clearLayers();
    return { available: false };
  }

  metroLayerGroup.clearLayers();
  drawMetroNetwork();

  const idx1 = metroStations.indexOf(s1.s), idx2 = metroStations.indexOf(s2.s);
  let fare = 20 + Math.abs(idx1 - idx2) * 5;
  if (fare > 100) fare = 100;

  return { available: true, fare, details: `Walk to <b>${s1.s.name}</b> → Ride to <b>${s2.s.name}</b>` };
}

// --- VISUALIZATION (With Animation) ---

function drawMetroNetwork() {
  const c = "#16a34a";
  const l = metroStations.map(s => [s.lat, s.lng]);
  L.polyline(l, { color: c, dashArray: '12, 12', weight: 4, opacity: 0.6 }).addTo(metroLayerGroup);
  metroStations.forEach(s => {
    L.circleMarker([s.lat, s.lng], {
      radius: 6, color: "#16a34a", fillColor: "#16a34a", fillOpacity: 1, weight: 2
    }).addTo(metroLayerGroup).bindPopup(`<b>🚇 ${s.name}</b>`);
  });
  metroLayerGroup.addTo(map);
}

function drawRoutePreview(c) {
  if (routeLine) map.removeLayer(routeLine);
  if (routeDot) map.removeLayer(routeDot);
  if (routeDotInterval) clearInterval(routeDotInterval);

  routeLine = L.polyline(c, {
    color: '#2563eb', // Blue
    weight: 7,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

  if (c && c.length > 0) {
    routeDot = L.circleMarker(c[0], {
      radius: 6, color: "#ffffff", fillColor: "#2563eb", fillOpacity: 1, weight: 2
    }).addTo(map);
    let i = 0;
    routeDotInterval = setInterval(() => {
      if (!routeDot) return;
      routeDot.setLatLng(c[i]);
      i = (i + 1) % c.length;
    }, 50);
  }
}

// --- UTILS ---
function handleRoutePresetChange() {
  const d = routePresetsData[document.getElementById("routePreset").value];
  if (d) {
    if (fromMarker) map.removeLayer(fromMarker); if (toMarker) map.removeLayer(toMarker);
    fromMarker = createMarker(d.coords[0][0], d.coords[0][1], "Start");
    toMarker = createMarker(d.coords[1][0], d.coords[1][1], "End");
    updateRouteIfReady();
  }
}
function useCurrentLocationAsFrom() {
  navigator.geolocation.getCurrentPosition(p => {
    if (!fromMarker) fromMarker = createMarker(p.coords.latitude, p.coords.longitude, "Me");
    else fromMarker.setLatLng([p.coords.latitude, p.coords.longitude]);
    updateRouteIfReady();
  });
}
function clearRoute() {
  if (fromMarker) map.removeLayer(fromMarker); fromMarker = null;
  if (toMarker) map.removeLayer(toMarker); toMarker = null;
  if (routeLine) map.removeLayer(routeLine);
  if (routeDot) map.removeLayer(routeDot);
  if (routeDotInterval) clearInterval(routeDotInterval);
  metroLayerGroup.clearLayers();
  document.getElementById("fareLabel").innerHTML = "-- ৳";
  document.getElementById("fareBreakdownText").textContent = "Select a route...";
}
function updateLabels() { }