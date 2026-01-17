// police-dashboard.js - FULL FIX (Heatmap + Hotspots working)

// =========================================
// 1. DATA LOADED FROM BACKEND (Command Center)
// =========================================

// Dynamic stats and lists
let policeStats = { new_cases: 0, in_progress: 0, resolved: 0, fake_cases: 0 };
let policeComplaints = [];
let emergencyAlerts = [];

// Heatmap points (aggregated from complaints)
let incidentPoints = [];

// Leaflet map instance
let heatMapLeaflet = null;

// =========================================
// 2. FETCH DATA
// =========================================
async function fetchPoliceData() {
  try {
    const token = localStorage.getItem("token");

    // ---- Complaints ----
    const cResp = await fetch("/api/complaints", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const cData = await cResp.json();

    if (cResp.ok) {
      policeComplaints = cData.map((c) => {
        const status = (c.status || "").toLowerCase();
        const type = c.category || "Other";

        // Priority (demo logic)
        let priority = "medium";
        const catLower = (type || "").toLowerCase();
        if (status === "in-progress" || catLower.includes("harass")) priority = "high";
        else if (status === "pending" || status === "new") priority = "medium";
        else if (status === "resolved") priority = "low";

        return {
          id: c.id,
          type,
          description: c.description || "",
          status,
          priority,
          thana: c.thana || "",
          route: c.route || "",
          created_at: c.created_at || c.createdAt || "",

          // ✅ IMPORTANT: keep geo fields
          latitude: c.latitude ?? null,
          longitude: c.longitude ?? null,
          accuracy: c.accuracy ?? null,
        };
      });

      // Compute stats
      const stats = { new_cases: 0, in_progress: 0, resolved: 0, fake_cases: 0 };
      policeComplaints.forEach((c) => {
        const st = c.status;
        if (st === "new" || st === "pending") stats.new_cases++;
        else if (st === "in-progress" || st === "working") stats.in_progress++;
        else if (st === "resolved" || st === "closed") stats.resolved++;
        else if (st === "fake") stats.fake_cases++;
        else stats.new_cases++;
      });
      policeStats = stats;

      // ✅ build heatmap points after complaints load
      buildIncidentPoints();
    } else {
      console.error("Failed to load complaints", cData);
      policeComplaints = [];
      incidentPoints = [];
    }

    // ---- Emergencies ----
    const eResp = await fetch("/api/emergencies", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const eData = await eResp.json();

    if (eResp.ok) {
      emergencyAlerts = eData.map((e) => {
        const time = e.created_at || e.createdAt || new Date().toISOString();

        let level = "medium";
        if (e.accuracy && e.accuracy <= 10) level = "critical";
        else if (e.accuracy && e.accuracy <= 50) level = "high";

        const loc =
          e.latitude && e.longitude
            ? `Lat ${Number(e.latitude).toFixed(4)}, Lng ${Number(e.longitude).toFixed(4)}`
            : "Unknown location";

        return {
          id: e.id,
          location: loc,
          time,
          level,
          note: e.description || "SOS triggered",
        };
      });
    } else {
      console.error("Failed to load emergencies", eData);
      emergencyAlerts = [];
    }
  } catch (err) {
    console.error("Error loading police data", err);
    policeComplaints = [];
    emergencyAlerts = [];
    incidentPoints = [];
    policeStats = { new_cases: 0, in_progress: 0, resolved: 0, fake_cases: 0 };
  }
}

// =========================================
// 3. BUILD HEATMAP POINTS
// =========================================
function buildIncidentPoints() {
 const geoComplaints = policeComplaints.filter(
  (c) =>
    c.latitude !== null &&
    c.longitude !== null &&
    c.status !== "fake"   // ❌ exclude fake cases
);
const grouped = {};

geoComplaints.forEach((c) => {
  const key = c.thana || "Unknown";

  if (!grouped[key]) {
    grouped[key] = {
      thana: key,
      lat: Number(c.latitude),
      lng: Number(c.longitude),
      high: 0,
      medium: 0,
      low: 0,
      total: 0,
    };
  }

  if (c.priority === "high") grouped[key].high++;
  else if (c.priority === "medium") grouped[key].medium++;
  else grouped[key].low++;

  grouped[key].total++;
});

incidentPoints = Object.values(grouped);

}

// =========================================
// 4. INIT
// =========================================
document.addEventListener("DOMContentLoaded", async () => {
  await fetchPoliceData();

  renderPoliceStats();
  renderStatusChart();
  renderCategoryChart();
  renderComplaintsQueue("all");
  renderEmergencyAlerts();

  // ✅ Heatmap init only if we have points
  if (incidentPoints.length > 0) {
    initHeatmap();
  } else {
    // show friendly message if empty
    const mapEl = document.getElementById("policeHeatmap");
    if (mapEl) {
      mapEl.innerHTML =
        `<div style="padding:20px; text-align:center; color:#64748B;">No map data yet (no complaints with coordinates).</div>`;
    }
  }

  const filter = document.getElementById("queueStatusFilter");
  if (filter) {
    filter.addEventListener("change", (e) => {
      renderComplaintsQueue(e.target.value);
    });
  }

  const heatFilter = document.getElementById("heatTimeFilter");
  if (heatFilter) {
    heatFilter.addEventListener("change", async () => {
      // optional: you can implement time filtering later
      // for now we just rebuild and re-init
      buildIncidentPoints();
      initHeatmap(true);
    });
  }

  // Keep Leaflet responsive (grid changes, orientation changes, navbar toggle)
  const invalidate = () => {
    if (heatMapLeaflet) {
      try { heatMapLeaflet.invalidateSize(); } catch (_) {}
    }
  };

  // Debounced resize
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(invalidate, 120);
  });

  // If your navbar uses a collapsible toggle, this helps after open/close
  const navToggle = document.querySelector(".nav-toggle");
  if (navToggle) {
    navToggle.addEventListener("click", () => setTimeout(invalidate, 180));
  }

  // Initial tick (after layout + fonts settle)
  setTimeout(invalidate, 250);
});

// =========================================
// 5. UI RENDERERS
// =========================================
function renderPoliceStats() {
  setText("police-new", policeStats.new_cases);
  setText("police-in-progress", policeStats.in_progress);
  setText("police-resolved", policeStats.resolved);
  setText("police-fake", policeStats.fake_cases);
  setText("police-last-updated", new Date().toLocaleTimeString());
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// --- CHARTS (Chart.js) ---
function renderStatusChart() {
  const ctx = document.getElementById("policeStatusChart");
  if (!ctx || typeof Chart === "undefined") return;

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["New", "Working", "Closed", "Fake"],
      datasets: [
        {
          data: [
            policeStats.new_cases,
            policeStats.in_progress,
            policeStats.resolved,
            policeStats.fake_cases,
          ],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, padding: 14 },
        },
      },
    },
  });
}

function renderCategoryChart() {
  const ctx = document.getElementById("policeCategoryChart");
  if (!ctx || typeof Chart === "undefined") return;

  // simple demo data
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Fare", "Harassment", "Reckless", "Theft"],
      datasets: [{ label: "Reports", data: [15, 8, 12, 5] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { grid: { display: true } } },
    },
  });
}

// --- QUEUE LIST ---
function renderComplaintsQueue(filter) {
  const list = document.getElementById("activeComplaintsList");
  if (!list) return;
  list.innerHTML = "";

  const filtered = policeComplaints.filter((c) => (filter === "all" ? true : c.status === filter));

  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:#64748B;">No cases found.</div>`;
    return;
  }

  filtered.forEach((c) => {
    const card = document.createElement("div");
    card.className = "police-complaint-card";

    // Visual priority framing (UI-only)
    const statusKey = (c.status || "").toLowerCase();
    const statusLabelMap = {
      "new": "NEW",
      "pending": "PENDING",
      "in-progress": "IN PROGRESS",
      "working": "IN PROGRESS",
      "resolved": "CLOSED",
      "closed": "CLOSED",
      "fake": "FLAGGED",
    };
    const statusLabel = statusLabelMap[statusKey] || (statusKey ? statusKey.toUpperCase() : "NEW");

    const statusClassMap = {
      "new": "status-new",
      "pending": "status-pending",
      "in-progress": "status-in-progress",
      "working": "status-in-progress",
      "resolved": "status-resolved",
      "closed": "status-resolved",
      "fake": "status-fake",
    };
    const statusClass = statusClassMap[statusKey] || "status-new";

    // Border-left uses status (not just warning)
    const borderColorMap = {
      "new": "#0284C7",
      "pending": "#B45309",
      "in-progress": "#1D4ED8",
      "working": "#1D4ED8",
      "resolved": "#15803D",
      "closed": "#15803D",
      "fake": "#475569",
    };
    card.style.borderLeftColor = borderColorMap[statusKey] || "#B45309";

    card.innerHTML = `
      <div class="police-complaint-header">
        <span style="font-weight:800;">#${c.id} · ${c.type}</span>
        <span class="status-pill ${statusClass}">● ${statusLabel}</span>
      </div>
      <div style="margin-bottom:8px;">
        <span class="police-tag">📍 ${c.thana}</span>
        <span class="police-tag">🚌 ${c.route}</span>
      </div>
      <p style="font-size:13px; color:#334155; line-height:1.4; margin-bottom:12px;">
        ${c.description}
      </p>
      <div class="queue-actions">
        <button class="btn btn-primary" type="button">View</button>
        <button class="btn" type="button">Assign</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// --- EMERGENCY ALERTS ---
function renderEmergencyAlerts() {
  const list = document.getElementById("emergencyAlertsList");
  if (!list) return;
  list.innerHTML = "";

  // Most recent first
  const sorted = [...emergencyAlerts].sort((a, b) => new Date(b.time) - new Date(a.time));

  sorted.forEach((a) => {
    const item = document.createElement("div");
    item.className = `emergency-item emergency-${a.level || "medium"}`;
    const timeStr = new Date(a.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const levelLabel = (a.level || "medium").toUpperCase();

    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span class="emergency-id">ALERT #${a.id}</span>
        <span style="display:flex; gap:8px; align-items:center;">
          <span class="status-pill ${a.level === "critical" ? "status-fake" : a.level === "high" ? "status-pending" : "status-new"}" style="font-weight:900;">${levelLabel}</span>
          <span style="font-size:11px; font-weight:800; color:#020617;">${timeStr}</span>
        </span>
      </div>
      <div style="font-size:13px; font-weight:600; margin-bottom:2px;">📍 ${a.location}</div>
      <div style="font-size:12px; color:#7F1D1D;">${a.note}</div>
    `;
    list.appendChild(item);
  });
}

// =========================================
// 6. HEATMAP (Leaflet)
// =========================================
// forceReinit=true will destroy & rebuild map safely
function initHeatmap(forceReinit = false) {
  const mapId = "policeHeatmap";
  const el = document.getElementById(mapId);
  if (!el || typeof L === "undefined") return;

  // If already created & we want refresh: destroy cleanly
  if (heatMapLeaflet && forceReinit) {
    heatMapLeaflet.remove();
    heatMapLeaflet = null;
    el.innerHTML = "";
  }

  // If already exists and not forcing: do nothing
  if (heatMapLeaflet && !forceReinit) return;

  // Default Dhaka center
  heatMapLeaflet = L.map(mapId, { zoomControl: false }).setView([23.78, 90.40], 12);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap, &copy; CartoDB",
  }).addTo(heatMapLeaflet);

  // Add circles (3-tier intensity to match legend)
incidentPoints.forEach((p) => {
  let color = "#0EA5E9"; // 🔵 Low (default)

  if (p.high > 0) color = "#EF4444";       // 🔴 High
  else if (p.medium > 0) color = "#F59E0B"; // 🟠 Medium

  const radius = Math.max(150, p.total * 200);

  L.circle([p.lat, p.lng], {
    color,
    fillColor: color,
    fillOpacity: 0.4,
    radius,
    weight: 1,
  })
    .addTo(heatMapLeaflet)
    .bindPopup(`
      <b>${p.thana}</b><br>
      🔴 High: ${p.high}<br>
      🟠 Medium: ${p.medium}<br>
      🔵 Low: ${p.low}
    `);
});
;

  renderHotspots();
}

function renderHotspots() {
  const list = document.getElementById("heatHotspotList");
  if (!list) return;

  // ✅ clear first (important)
  list.innerHTML = "";

  const topSpots = [...incidentPoints].sort((a, b) => b.count - a.count).slice(0, 3);

  if (topSpots.length === 0) {
    list.innerHTML = `<div style="padding:10px; color:#64748B;">No hotspots yet.</div>`;
    return;
  }

  topSpots.forEach((p) => {
    const item = document.createElement("div");
    item.className = "hotspot-item";
    item.innerHTML = `
      <div>
        <div style="font-weight:600;">${p.thana}</div>
        <div style="font-size:11px; color:#64748B;">${p.type}</div>
      </div>
      <div style="font-weight:800; color:#B91C1C;">${p.count}</div>
    `;

    item.addEventListener("click", () => {
      if (heatMapLeaflet) heatMapLeaflet.setView([p.lat, p.lng], 14);
    });

    list.appendChild(item);
  });
}
