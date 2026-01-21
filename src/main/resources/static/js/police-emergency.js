// police-emergency.js – Manage emergency reports on the police portal
// Includes: null-safe filtering + supports snake_case keys + RIGHT-SIDE MAP preview (Leaflet)

let emergenciesData = [];

let emergencySearchTerm = "";
let emergencyStatusFilter = "all";

// ===== Map globals =====
let emMap = null;
let emMarker = null;
let emAccuracyCircle = null;

document.addEventListener("DOMContentLoaded", async () => {
  initEmergencyFilters();
  initEmergencyMap(); // ✅ map init

  await loadEmergencies();
  renderEmergencies();

  // Optional: auto-refresh every 15s so police sees new SOS without reload
  setInterval(async () => {
    await loadEmergencies();
    renderEmergencies();
  }, 15000);
});

function initEmergencyFilters() {
  const searchInput = document.getElementById("emergencySearch");
  const statusSelect = document.getElementById("emergencyStatusFilter");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      emergencySearchTerm = String(e.target.value || "").toLowerCase();
      renderEmergencies();
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", (e) => {
      emergencyStatusFilter = String(e.target.value || "all").toLowerCase();
      renderEmergencies();
    });
  }
}

async function loadEmergencies() {
  try {
    const token = localStorage.getItem("token");

    const resp = await fetch("/api/emergencies", {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await resp.json().catch(() => []);

    if (!resp.ok) {
      console.error("Failed to load emergencies:", data);
      emergenciesData = [];
      return;
    }

    emergenciesData = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Error fetching emergencies:", err);
    emergenciesData = [];
  }
}

/**
 * Normalize backend fields.
 * Supports:
 *  - camelCase: createdAt, audioUrl, userId
 *  - snake_case: created_at, audio_url, user_id
 */
function normalizeEmergency(raw) {
  const em = raw || {};

  const id = em.id ?? em["id"];

  const latitude =
    em.latitude ?? em["latitude"] ?? em.lat ?? em["lat"] ?? null;
  const longitude =
    em.longitude ?? em["longitude"] ?? em.lng ?? em["lng"] ?? null;

  const accuracy = em.accuracy ?? em["accuracy"] ?? null;

  const audioUrl =
    em.audioUrl ??
    em["audioUrl"] ??
    em.audio_url ??
    em["audio_url"] ??
    null;

  const imageUrl =
    em.imageUrl ??
    em["imageUrl"] ??
    em.image_url ??
    em["image_url"] ??
    null;

  const createdAt =
    em.createdAt ??
    em["createdAt"] ??
    em.created_at ??
    em["created_at"] ??
    null;

  const userId =
    em.userId ??
    em["userId"] ??
    em.user_id ??
    em["user_id"] ??
    null;

  // Optional fields (may not exist in DB)
  const status = em.status ?? em["status"] ?? "new";
  const label = em.label ?? em["label"] ?? "SOS";
  const notes = em.notes ?? em["notes"] ?? "";

  return {
    id,
    latitude,
    longitude,
    accuracy,
    audioUrl,
    imageUrl,
    createdAt,
    userId,
    status,
    label,
    notes,
  };
}

function renderEmergencies() {
  const container = document.getElementById("emergencyList");
  if (!container) return;

  const normalized = emergenciesData.map(normalizeEmergency);

  const filtered = normalized.filter((em) => {
    const search = emergencySearchTerm;

    const id = String(em.id ?? "").toLowerCase();
    const label = String(em.label ?? "").toLowerCase();
    const notes = String(em.notes ?? "").toLowerCase();
    const userId = String(em.userId ?? "").toLowerCase();
    const status = String(em.status ?? "").toLowerCase();
    const coords = `${em.latitude ?? ""},${em.longitude ?? ""}`.toLowerCase();

    const matchesSearch =
      search.length === 0 ||
      id.includes(search) ||
      label.includes(search) ||
      notes.includes(search) ||
      userId.includes(search) ||
      coords.includes(search);

    const matchesStatus =
      emergencyStatusFilter === "all" || status === emergencyStatusFilter;

    return matchesSearch && matchesStatus;
  });

  updateEmergencySummary(normalized);

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-queue">No emergencies found for your filters.</div>';
    return;
  }

  filtered.forEach((em) => {
    const card = document.createElement("div");
    card.className = "complaint-card";

    const statusClass = `status-${String(em.status || "new").toLowerCase()}`;

    const created = em.createdAt ? new Date(em.createdAt) : null;
    const dateStr =
      created && !isNaN(created) ? created.toLocaleDateString() : "—";
    const timeStr =
      created && !isNaN(created)
        ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "—";

    // ✅ Ensure numbers even if backend sends string
    const latNum = em.latitude !== null ? Number(em.latitude) : NaN;
    const lngNum = em.longitude !== null ? Number(em.longitude) : NaN;
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

    const mapsUrl = hasCoords
      ? `https://www.google.com/maps?q=${encodeURIComponent(
        latNum
      )},${encodeURIComponent(lngNum)}`
      : null;

    // Detect if audio is base64 or URL
    let audioSrc = null;
    if (em.audioUrl) {
      if (em.audioUrl.startsWith("http") || em.audioUrl.startsWith("blob")) {
        audioSrc = em.audioUrl;
      } else {
        // Assume base64 (webm)
        audioSrc = `data:audio/webm;base64,${em.audioUrl}`;
      }
    }

    // Detect if image is base64 or URL
    let imageSrc = null;
    if (em.imageUrl) {
      if (em.imageUrl.startsWith("http") || em.imageUrl.startsWith("blob")) {
        imageSrc = em.imageUrl;
      } else {
        // Assume base64 (jpeg)
        imageSrc = `data:image/jpeg;base64,${em.imageUrl}`;
      }
    }

    // audio block
    const audioBlock = audioSrc
      ? `
        <div style="margin-top:10px">
          <audio controls style="width:100%">
            <source src="${escapeHtmlAttr(audioSrc)}" />
          </audio>
        </div>
      `
      : `<div class="complaint-desc" style="margin-top:10px; opacity:.8">No audio provided.</div>`;

    // image block
    const imageBlock = imageSrc
      ? `
        <div style="margin-top:10px">
          <img src="${escapeHtmlAttr(imageSrc)}" alt="Captured Image" style="max-width: 100%; border-radius: 6px; border: 1px solid #e2e8f0; display: block;" />
        </div>
      `
      : "";

    // ✅ Map chip button (updates right-side map)
    const mapChip = hasCoords
      ? `<button
            class="tag-pill-btn"
            data-action="show-map"
            data-lat="${latNum}"
            data-lng="${lngNum}"
            data-acc="${Number(em.accuracy) || ""}"
          >
            📍 Open location
         </button>`
      : `<span class="tag-pill tag-thana">📍 No coordinates</span>`;

    card.innerHTML = `
      <div class="complaint-content">
        <div class="complaint-row-top">
          <div>
            <div class="complaint-id">#${escapeHtml(em.id ?? "—")} · ${escapeHtml(
      em.label || "SOS"
    )}</div>
            <div class="complaint-bus">User ID: ${escapeHtml(em.userId ?? "—")}</div>
          </div>
          <span class="status-badge ${statusClass}">${escapeHtml(
      formatEmergencyStatus(em.status)
    )}</span>
        </div>

        <div class="complaint-tags">
          ${mapChip}
          ${mapsUrl
        ? `<a class="tag-pill-link" href="${mapsUrl}" target="_blank" rel="noopener">🧭 Google Maps</a>`
        : ""
      }
          <span class="tag-pill tag-route">🎯 Accuracy: ${escapeHtml(
        em.accuracy ?? "—"
      )} m</span>
        </div>

        ${em.notes ? `<p class="complaint-desc">${escapeHtml(em.notes)}</p>` : ""}
        
        ${imageBlock}
        ${audioBlock}

        <div class="complaint-meta-row">
          <div class="complaint-meta">
            <span>📅 ${escapeHtml(dateStr)}</span>
            <span>⏰ ${escapeHtml(timeStr)}</span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // ✅ Bind clicks after rendering
  container.querySelectorAll("[data-action='show-map']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lat = Number(btn.dataset.lat);
      const lng = Number(btn.dataset.lng);
      const acc = btn.dataset.acc ? Number(btn.dataset.acc) : null;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        showEmergencyOnMap(lat, lng, acc);
      }
    });
  });

  // ✅ Optional: auto-show newest emergency on map (first card)
  // Comment out if you don't want this behavior.
  const firstWithCoords = filtered.find((e) => {
    const lat = Number(e.latitude);
    const lng = Number(e.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
  if (firstWithCoords) {
    showEmergencyOnMap(
      Number(firstWithCoords.latitude),
      Number(firstWithCoords.longitude),
      firstWithCoords.accuracy ? Number(firstWithCoords.accuracy) : null
    );
  }
}

function updateEmergencySummary(allNormalized) {
  const newCount = allNormalized.filter(
    (e) => String(e.status).toLowerCase() === "new"
  ).length;
  const respondingCount = allNormalized.filter(
    (e) => String(e.status).toLowerCase() === "responding"
  ).length;
  const resolvedCount = allNormalized.filter(
    (e) => String(e.status).toLowerCase() === "resolved"
  ).length;

  const elNew = document.getElementById("emNew");
  const elResp = document.getElementById("emResponding");
  const elRes = document.getElementById("emResolved");

  if (elNew) elNew.textContent = String(newCount);
  if (elResp) elResp.textContent = String(respondingCount);
  if (elRes) elRes.textContent = String(resolvedCount);
}

function formatEmergencyStatus(status) {
  const s = String(status || "new").toLowerCase();
  const map = { new: "New", responding: "Responding", resolved: "Resolved" };
  return map[s] || status || "New";
}

// ==============================
// MAP (Leaflet + OpenStreetMap)
// ==============================
function initEmergencyMap() {
  // Leaflet must be loaded in HTML:
  // <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  if (typeof L === "undefined") return;

  const mapEl = document.getElementById("emergencyMap");
  if (!mapEl) return;

  const dhaka = [23.8103, 90.4125];

  emMap = L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: true,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap, &copy; CartoDB",
  }).addTo(emMap);

  emMap.setView(dhaka, 12);
}

function showEmergencyOnMap(lat, lng, accuracy = null) {
  if (!emMap || typeof L === "undefined") return;

  const hint = document.getElementById("emMapHint");
  if (hint) hint.style.display = "none";

  const openLink = document.getElementById("emMapOpenLink");
  if (openLink) {
    openLink.href = `https://www.google.com/maps?q=${encodeURIComponent(
      lat
    )},${encodeURIComponent(lng)}`;
    openLink.style.display = "inline-block";
  }

  const pos = [lat, lng];

  if (emMarker) {
    emMarker.setLatLng(pos);
  } else {
    emMarker = L.marker(pos).addTo(emMap);
  }

  const r = Number(accuracy);
  if (Number.isFinite(r) && r > 0) {
    if (emAccuracyCircle) {
      emAccuracyCircle.setLatLng(pos);
      emAccuracyCircle.setRadius(r);
    } else {
      emAccuracyCircle = L.circle(pos, {
        radius: r,
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(emMap);
    }
  } else if (emAccuracyCircle) {
    emMap.removeLayer(emAccuracyCircle);
    emAccuracyCircle = null;
  }

  emMap.setView(pos, 15);

  // Fixes "map not visible until resize" issue
  setTimeout(() => {
    try {
      emMap.invalidateSize();
    } catch (_) { }
  }, 50);
}

// --------- tiny safe helpers (avoid HTML break) ----------
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(v) {
  return escapeHtml(v);
}
