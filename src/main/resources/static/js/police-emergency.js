// police-emergency.js (Modern Grid 2026 - Aligned with Complaints)

let emergenciesData = [];
let emergencySearchTerm = "";
let emergencyStatusFilter = "all";

// Modal Globals
let modalMap = null;
let modalMarker = null;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inject Modal HTML if not present
  ensureModalExists();

  // 2. Init Filters
  initEmergencyFilters();

  // 3. Load Data
  await loadEmergencies();
  renderEmergencies();

  // 4. Auto-refresh
  setInterval(async () => {
    await loadEmergencies();
    renderEmergencies();
  }, 15000);
});

// ==========================================
// 1. INJECT MODAL (Dynamic for safety)
// ==========================================
function ensureModalExists() {
  if (document.getElementById("modal")) return;

  const modalHtml = `
    <div id="modal" class="modal hidden">
        <div class="modalBox">
            <div class="modalHeader">
                <div>
                   <div id="modalKicker" class="modalKicker">EMERGENCY REPORT</div>
                   <h2 id="modalTitle">Details</h2>
                </div>
                <button id="modalClose" class="modalClose" title="Close">×</button>
            </div>
            
            <div id="modalBody" class="modalBody">
               <!-- Content injected by JS -->
            </div>
            
            <div class="modalFooter">
                <div class="modalControls">
                     <select id="modalStatusSelect" class="statusSelect">
                        <option value="new">New</option>
                        <option value="responding">Responding</option>
                        <option value="resolved">Resolved</option>
                     </select>
                </div>
                <button id="modalSave" class="m-btn m-btn-primary">Update Status</button>
            </div>
        </div>
    </div>
    `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Bind Close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document
    .getElementById("modalSave")
    .addEventListener("click", saveModalStatus);
}

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
    if (resp.ok) {
      const raw = Array.isArray(data) ? data : [];
      // ✅ Normalize Data
      emergenciesData = raw.map(normalizeEmergency);
    }
  } catch (err) {
    console.error("Error fetching emergencies:", err);
  }
}

// ✅ Restore Normalization
function normalizeEmergency(em) {
  return {
    id: em.id ?? em.id,
    label: em.label ?? "SOS",
    description: em.description ?? em.desc ?? "",
    notes: em.notes ?? "",
    status: em.status ?? "new",
    latitude: em.latitude ?? em.lat ?? null,
    longitude: em.longitude ?? em.lng ?? null,
    accuracy: em.accuracy ?? null,
    // vital fix for images
    imageUrl: em.imageUrl ?? em.image_url ?? null,
    audioUrl: em.audioUrl ?? em.audio_url ?? null,
    createdAt: em.createdAt ?? em.created_at ?? null,
  };
}

// ==========================================
// RENDER LIST (Cards)
// ==========================================
function renderEmergencies() {
  const container = document.getElementById("emergencyList");
  if (!container) return;

  const filtered = emergenciesData.filter((em) => {
    const search = emergencySearchTerm;
    const status = String(em.status || "new").toLowerCase();

    // Match Search
    const searchContent = [
      em.id,
      em.label,
      em.notes,
      em.description,
      em.latitude,
      em.longitude,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || searchContent.includes(search);

    // Match Status
    const matchesStatus =
      emergencyStatusFilter === "all" || status === emergencyStatusFilter;

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-queue" style="margin:20px; text-align:center; color:#64748b; grid-column:1/-1;">No emergencies found.</div>`;
    return;
  }

  container.innerHTML = "";

  // Sort: Newest first
  filtered.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );

  filtered.forEach((em) => {
    const card = createCard(em);
    container.appendChild(card);
  });

  // Bind Review Buttons
  container.querySelectorAll("[data-action='review']").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.id));
  });
}

function createCard(em) {
  const el = document.createElement("article");
  el.className = "report-item";

  const status = String(em.status || "new").toLowerCase();
  const statusClass = `status-${status}`;

  // Priority logic basic: New = Critical
  const prioClass =
    status === "new"
      ? "prio-critical"
      : status === "responding"
        ? "prio-high"
        : "prio-normal";
  const prioLabel = status === "new" ? "CRITICAL" : "Normal";

  const created = em.createdAt ? new Date(em.createdAt).toLocaleString() : "—";
  const desc = em.description || "No description provided.";

  // ✅ Re-add Image Thumbnail to Card
  let imageThumbnail = "";
  if (em.imageUrl) {
    const src = em.imageUrl.startsWith("http")
      ? em.imageUrl
      : `data:image/jpeg;base64,${em.imageUrl}`;
    imageThumbnail = `<img src="${src}" alt="Evidence" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0; margin-left:12px; flex-shrink:0;">`;
  }

  el.innerHTML = `
      <div class="report-top">
        <div style="min-width:0;">
           <div class="report-id">#${em.id}</div>
           <h3 class="report-title">${escapeHtml(em.label || "Emergency Report")}</h3>
        </div>
        <div class="badges">
           <span class="badge ${statusClass}">${escapeHtml(status.toUpperCase())}</span>
           <span class="badge ${prioClass}">${prioLabel}</span>
        </div>
      </div>

      <div class="report-main" style="display:flex; justify-content:space-between;">
         <div style="flex:1; min-width:0;">
             <div class="meta-grid">
                <div class="meta-icon">🕒</div> <div>${escapeHtml(created)}</div>
                <div class="meta-icon">📍</div> <div>${em.latitude ? `${Number(em.latitude).toFixed(4)}, ${Number(em.longitude).toFixed(4)}` : "No Location"}</div>
             </div>
             <p class="report-desc">${escapeHtml(desc)}</p>
         </div>
         ${imageThumbnail}
      </div>

      <div class="report-actions">
         <div style="font-size:12px; color:#64748b; font-weight:600;">
            ${em.audioUrl ? "🎤 Voice" : ""} ${em.imageUrl ? "📷 Image" : ""}
         </div>
         <button class="m-btn m-btn-primary" type="button" data-action="review" data-id="${em.id}">
            Review Details
         </button>
      </div>
    `;
  return el;
}

// ==========================================
// MODAL LOGIC
// ==========================================
let currentModalId = null;

function openModal(id) {
  const em = emergenciesData.find((e) => String(e.id) === String(id));
  if (!em) return;

  currentModalId = em.id;

  // Populate Headers
  document.getElementById("modalKicker").textContent = `Emergency #${em.id}`;
  document.getElementById("modalTitle").textContent =
    em.label || "Emergency Details";
  document.getElementById("modalStatusSelect").value = String(
    em.status || "new",
  ).toLowerCase();

  // Body Content
  const body = document.getElementById("modalBody");

  // Prepare Media
  let imageHtml = "";
  if (em.imageUrl) {
    let src = em.imageUrl.startsWith("http")
      ? em.imageUrl
      : `data:image/jpeg;base64,${em.imageUrl}`;
    imageHtml = `
          <div class="detail-block" style="padding:0; overflow:hidden;">
             <img class="modalImage" src="${src}" onclick="window.open('${src}')" alt="Evidence" />
             <div style="padding:8px 16px; font-size:12px; color:#64748b; text-align:center;">Click image to expand</div>
          </div>
        `;
  }

  let audioHtml = "";
  if (em.audioUrl) {
    let src = em.audioUrl.startsWith("http")
      ? em.audioUrl
      : `data:audio/webm;base64,${em.audioUrl}`;
    audioHtml = `
            <div class="detail-block" style="display:flex; align-items:center; gap:12px;">
                <span style="font-weight:700; color:#475569;">VOICE NOTE</span>
                <audio controls style="flex:1; height:32px;"><source src="${src}"></audio>
            </div>
         `;
  }

  // Map logic
  const hasMap = em.latitude && em.longitude;

  body.innerHTML = `
      <div class="review-grid">
         <div class="review-main">
            <!-- Details -->
            <div class="detail-block">
               <div class="detail-row">
                   <div class="detail-item"><label>Time</label><div>${em.createdAt ? new Date(em.createdAt).toLocaleString() : "-"}</div></div>
                   <div class="detail-item"><label>Location Accuracy</label><div>${em.accuracy ? Math.round(em.accuracy) + "m" : "Unknown"}</div></div>
               </div>
               <div class="detail-item">
                  <label>Description</label>
                  <div class="detail-desc">${escapeHtml(em.description || "No content.")}</div>
               </div>
               ${em.notes ? `<div class="detail-item" style="margin-top:16px;"><label>Operator Notes</label><div class="detail-desc" style="background:#fff7ed;">${escapeHtml(em.notes)}</div></div>` : ""}
            </div>

            <!-- Audio -->
            ${audioHtml}

            <!-- Map (Main Column for visibility) -->
            ${hasMap ? `<div id="modalMapContainer" class="modalMap"></div>` : `<div class="detail-block" style="text-align:center; color:#94a3b8;">No Location Data Available</div>`}
         </div>

         <div class="review-sidebar">
             <!-- Status Block -->
             <div class="detail-block">
                 <div class="detail-item">
                    <label>Current Status</label>
                    <span class="badge status-${String(em.status || "new").toLowerCase()}">${(em.status || "new").toUpperCase()}</span>
                 </div>
             </div>

             <!-- Image -->
             ${imageHtml}
         </div>
      </div>
    `;

  // Show Modal
  const modal = document.getElementById("modal");
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("visible"));

  // Init Map if exists
  if (hasMap) {
    setTimeout(() => {
      initModalMap(
        Number(em.latitude),
        Number(em.longitude),
        Number(em.accuracy),
      );
    }, 100);
  }
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("visible");
  setTimeout(() => modal.classList.add("hidden"), 200);

  // Destroy map
  if (modalMap) {
    modalMap.remove();
    modalMap = null;
  }
  currentModalId = null;
}

async function saveModalStatus() {
  if (!currentModalId) return;

  const newStatus = document.getElementById("modalStatusSelect").value;
  const btn = document.getElementById("modalSave");

  try {
    btn.textContent = "Updating...";
    btn.disabled = true;

    /* 
           NOTE: If the backend for emergencies doesn't support status update, this might fail.
           Simulating for UI.
        */
    const em = emergenciesData.find((e) => e.id == currentModalId);
    if (em) em.status = newStatus;

    // Refresh UI
    renderEmergencies();
    closeModal();
    alert("Status updated (Simulated - verify backend integration)");
  } catch (e) {
    console.error(e);
    alert("Failed to update status");
  } finally {
    btn.textContent = "Update Status";
    btn.disabled = false;
  }
}

// Map Helper
function initModalMap(lat, lng, acc) {
  if (typeof L === "undefined") return;

  const container = document.getElementById("modalMapContainer");
  if (!container) return;

  if (modalMap) modalMap.remove();

  modalMap = L.map(container).setView([lat, lng], 15);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap, &copy; CartoDB",
    },
  ).addTo(modalMap);

  L.marker([lat, lng]).addTo(modalMap);

  if (acc) {
    L.circle([lat, lng], { radius: acc, fillOpacity: 0.1 }).addTo(modalMap);
  }
}

function escapeHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
