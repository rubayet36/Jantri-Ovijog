// police-manage.js (Modern list UI + filters: thana, priority, status)
// Backend endpoints unchanged:
//  - GET /api/complaints
//  - PATCH /api/complaints/:id/status

let allComplaints = [];
let selectedComplaint = null;

// UI elements
const listEl = document.getElementById("reportsList");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const thanaFilter = document.getElementById("thanaFilter");
const priorityFilter = document.getElementById("priorityFilter");
const sortFilter = document.getElementById("sortFilter");
const refreshBtn = document.getElementById("refreshBtn");
const clearFilters = document.getElementById("clearFilters");
const resultCount = document.getElementById("resultCount");
const lastSynced = document.getElementById("lastSynced");

// modal
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalKicker = document.getElementById("modalKicker");
const modalBody = document.getElementById("modalBody");
const modalStatus = document.getElementById("modalStatus");
const modalNote = document.getElementById("modalNote");
const modalSave = document.getElementById("modalSave");

// Leaflet map instance for the review modal (created on-demand)
let modalMap = null;

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function safeReadJson(resp) {
  const text = await resp.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function normalizeStatus(s) {
  const v = String(s || "new").toLowerCase();
  // unify variants
  if (v === "in progress") return "in-progress";
  if (v === "closed") return "resolved";
  return v;
}

// ✅ UPDATED: resolved => low priority (always)
function computePriority({ category, status }) {
  const st = normalizeStatus(status);
  const cat = String(category || "").toLowerCase();

  // ✅ force resolved -> low
  if (st === "resolved") return "low";

  // exclude fake from priority logic (still filterable as status)
  if (st === "fake") return "low";

  // High: harassment/violence/theft/sos-ish OR already in-progress
  if (st === "in-progress" || st === "working") return "high";
  if (
    cat.includes("harass") ||
    cat.includes("theft") ||
    cat.includes("assault") ||
    cat.includes("abuse")
  )
    return "high";

  // Medium: reckless / speeding / racing / traffic etc.
  if (
    cat.includes("reck") ||
    cat.includes("speed") ||
    cat.includes("traffic") ||
    cat.includes("fare")
  )
    return "medium";

  // Default
  return "low";
}

function toCamel(row) {
  const status = normalizeStatus(row.status || "new");
  const category = row.category || "-";

  return {
    id: row.id,
    category,
    status,
    priority: computePriority({ category, status }),
    thana: row.thana || "-",
    route: row.route || "-",
    busName: row.bus_name ?? "",
    busNumber: row.bus_number ?? "",
    imageUrl: row.image_url ?? "",
    reporterType: row.reporter_type ?? "",
    description: row.description ?? "",
    createdAt: row.created_at ?? row.createdAt ?? null,

    // geo (optional, used for map)
    latitude: row.latitude ?? row.lat ?? null,
    longitude: row.longitude ?? row.lng ?? null,
    accuracy: row.accuracy ?? null,
  };
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadgeClass(status) {
  const s = normalizeStatus(status);
  if (s === "new") return "status-new";
  if (s === "pending") return "status-pending";
  if (s === "working" || s === "in-progress") return "status-working";
  if (s === "resolved") return "status-resolved";
  if (s === "fake") return "status-fake";
  return "status-new";
}

function prioBadgeClass(p) {
  if (p === "high") return "prio-high";
  if (p === "medium") return "prio-medium";
  return "prio-low";
}

function prioLabel(p) {
  if (p === "high") return "High";
  if (p === "medium") return "Medium";
  return "Low";
}

async function fetchComplaints() {
  const resp = await fetch("/api/complaints", {
    headers: getAuthHeaders(),
  });

  const data = await safeReadJson(resp);
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || JSON.stringify(data));
  }

  allComplaints = (Array.isArray(data) ? data : []).map(toCamel);
  lastSynced.textContent = `Sync: ${new Date().toLocaleTimeString()}`;

  hydrateThanaFilter();
}

function hydrateThanaFilter() {
  const thanas = [
    ...new Set(allComplaints.map((c) => String(c.thana || "-").trim())),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const current = thanaFilter.value || "all";
  thanaFilter.innerHTML = `<option value="all">All</option>`;
  thanas.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    thanaFilter.appendChild(opt);
  });

  if ([...thanaFilter.options].some((o) => o.value === current))
    thanaFilter.value = current;
}

function applyFilters() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const st = String(statusFilter.value || "all").toLowerCase();
  const th = String(thanaFilter.value || "all");
  const pr = String(priorityFilter.value || "all").toLowerCase();
  const sort = String(sortFilter.value || "newest");

  let rows = allComplaints.filter((c) => {
    const text = `${c.id} ${c.category} ${c.thana} ${c.route} ${c.busName} ${c.busNumber} ${c.status} ${c.priority}`.toLowerCase();
    const qOk = !q || text.includes(q);
    const sOk = st === "all" || normalizeStatus(c.status) === st;
    const tOk = th === "all" || String(c.thana || "-") === th;
    const pOk = pr === "all" || String(c.priority || "low") === pr;
    return qOk && sOk && tOk && pOk;
  });

  // ✅ always high priority first, then medium, then low
  const priorityRank = { high: 0, medium: 1, low: 2 };

  rows.sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();

    const pa = priorityRank[a.priority] ?? 9;
    const pb = priorityRank[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;

    if (sort === "oldest") return da - db;
    return db - da;
  });

  resultCount.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
  return rows;
}

function renderList() {
  const rows = applyFilters();

  if (!rows.length) {
    listEl.innerHTML = `
      <div class="empty">
        <strong>No reports found.</strong><br/>
        Try adjusting your filters or search.
      </div>
    `;
    return;
  }

  listEl.innerHTML = rows
    .map((c) => {
      const statusClass = statusBadgeClass(c.status);
      const prClass = prioBadgeClass(c.priority);
      const safeTitle = escapeHtml(c.category || "-");
      const safeThana = escapeHtml(c.thana || "-");
      const safeRoute = escapeHtml(c.route || "-");
      const bus = `${escapeHtml(c.busName || "-")}${
        c.busNumber
          ? ` · <span style="opacity:.75">${escapeHtml(c.busNumber)}</span>`
          : ""
      }`;
      const desc = escapeHtml(c.description || "-");
      const created = formatDate(c.createdAt);

      return `
        <article class="report-item" data-id="${c.id}">
          <div class="report-main">
            <div class="report-top">
              <div style="min-width:0;">
                <div class="report-id">#${c.id}</div>
                <h3 class="report-title">${safeTitle}</h3>
              </div>
              <div class="badges">
                <span class="badge ${statusClass}">${escapeHtml(
        normalizeStatus(c.status)
      )}</span>
                <span class="badge ${prClass}">${prioLabel(c.priority)}</span>
              </div>
            </div>

            <div class="report-meta">
              <span class="meta-chip">📍 ${safeThana}</span>
              <span class="meta-chip">🚌 ${safeRoute}</span>
              <span class="meta-chip">🚎 ${bus}</span>
            </div>

            <p class="report-desc">${desc}</p>
          </div>

          <aside class="report-side">
            <div class="side-top">
              <div class="created-at">${escapeHtml(created)}</div>
            </div>

            <div class="quick-actions">
              <select class="statusSelect" data-id="${c.id}" aria-label="Change status">
                <option value="new" ${
                  normalizeStatus(c.status) === "new" ? "selected" : ""
                }>new</option>
                <option value="pending" ${
                  normalizeStatus(c.status) === "pending" ? "selected" : ""
                }>pending</option>
                <option value="working" ${
                  normalizeStatus(c.status) === "working" ? "selected" : ""
                }>working</option>
                <option value="in-progress" ${
                  normalizeStatus(c.status) === "in-progress" ? "selected" : ""
                }>in-progress</option>
                <option value="resolved" ${
                  normalizeStatus(c.status) === "resolved" ? "selected" : ""
                }>resolved</option>
                <option value="fake" ${
                  normalizeStatus(c.status) === "fake" ? "selected" : ""
                }>fake</option>
              </select>

              <button class="m-btn" type="button" data-action="view" data-id="${c.id}">Review</button>
              <button class="m-btn m-btn-primary" type="button" data-action="update" data-id="${c.id}">Update</button>
            </div>
          </aside>
        </article>
      `;
    })
    .join("");

  // Bind buttons
  listEl.querySelectorAll("button[data-action='view']").forEach((b) => {
    b.addEventListener("click", () => openModal(Number(b.dataset.id)));
  });

  listEl.querySelectorAll("button[data-action='update']").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.id);
      const sel = listEl.querySelector(`.statusSelect[data-id='${id}']`);
      if (!sel) return;

      try {
        b.disabled = true;
        b.textContent = "Updating…";
        await updateStatus(id, sel.value);
        await reload();
      } catch (e) {
        console.error(e);
        alert(`Update failed: ${e.message || e}`);
      } finally {
        b.disabled = false;
        b.textContent = "Update";
      }
    });
  });
}

async function updateStatus(id, status, note = null) {
  const payload = { status: normalizeStatus(status) };
  if (note && String(note).trim()) payload.note = String(note).trim();

  const resp = await fetch(`/api/complaints/${id}/status`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const data = await safeReadJson(resp);
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || JSON.stringify(data));
  }

  return data;
}

function destroyModalMap() {
  if (modalMap) {
    try {
      modalMap.remove();
    } catch (_) {}
    modalMap = null;
  }
}

function initModalMap(lat, lng, accuracy = null) {
  if (typeof L === "undefined") return;
  const el = document.getElementById("modalMap");
  if (!el) return;

  destroyModalMap();

  modalMap = L.map(el, { zoomControl: true, scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(modalMap);

  const pos = [lat, lng];
  L.marker(pos).addTo(modalMap);
  if (accuracy && Number(accuracy) > 0) {
    L.circle(pos, {
      radius: Number(accuracy),
      weight: 1,
      fillOpacity: 0.12,
    }).addTo(modalMap);
  }

  modalMap.setView(pos, 14);

  setTimeout(() => {
    try {
      modalMap.invalidateSize();
    } catch (_) {}
  }, 50);
}

function openModal(id) {
  selectedComplaint = allComplaints.find((c) => c.id === id);
  if (!selectedComplaint) return;

  modalKicker.textContent = `Priority: ${prioLabel(
    selectedComplaint.priority
  )} · Status: ${normalizeStatus(selectedComplaint.status)}`;
  modalTitle.textContent = `Complaint #${selectedComplaint.id} — ${
    selectedComplaint.category || ""
  }`;

  modalStatus.value = normalizeStatus(selectedComplaint.status);
  modalNote.value = "";

  modalBody.innerHTML = `
    <div>
      <div><b>Category:</b> ${escapeHtml(selectedComplaint.category || "-")}</div>
      <div><b>Priority:</b> ${escapeHtml(prioLabel(selectedComplaint.priority))}</div>
      <div><b>Status:</b> <span class="badge ${statusBadgeClass(
        selectedComplaint.status
      )}">${escapeHtml(normalizeStatus(selectedComplaint.status))}</span></div>
      <div><b>Created:</b> ${escapeHtml(formatDate(selectedComplaint.createdAt))}</div>
      <div><b>Thana:</b> ${escapeHtml(selectedComplaint.thana || "-")}</div>
      <div><b>Route:</b> ${escapeHtml(selectedComplaint.route || "-")}</div>
      <div><b>Bus:</b> ${escapeHtml(selectedComplaint.busName || "-")} (${escapeHtml(
    selectedComplaint.busNumber || "-"
  )})</div>
      <div><b>Reporter Type:</b> ${escapeHtml(selectedComplaint.reporterType || "-")}</div>
      <div style="grid-column:1/-1"><b>Description:</b><br/>${escapeHtml(
        selectedComplaint.description || "-"
      )}</div>

      ${
        selectedComplaint.latitude != null &&
        selectedComplaint.longitude != null
          ? `
            <div class="modalMapWrap">
              <b>Location:</b>
              <div id="modalMap" class="modalMap" aria-label="Case location map"></div>
              <div class="mapMeta">
                <a class="mapLink" target="_blank" rel="noreferrer"
                  href="https://www.google.com/maps?q=${encodeURIComponent(
                    selectedComplaint.latitude
                  )},${encodeURIComponent(selectedComplaint.longitude)}">
                  Open in Google Maps
                </a>
              </div>
            </div>
          `
          : ``
      }

      ${
        selectedComplaint.imageUrl
          ? `
            <div class="modalImageWrap">
              <b>Image:</b>
              <div class="imageCard">
                <img id="modalImage" class="modalImage" alt="Complaint evidence" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                <div class="imageMeta">
                  <a class="imageLink" target="_blank" rel="noreferrer" href="${escapeHtml(
                    selectedComplaint.imageUrl
                  )}">Open image in new tab</a>
                </div>
              </div>
            </div>
          `
          : ``
      }
    </div>
  `;

  if (selectedComplaint.imageUrl) {
    const img = document.getElementById("modalImage");
    if (img) {
      img.src = selectedComplaint.imageUrl;
      img.onerror = () => {
        img.style.display = "none";
        const card = img.closest(".imageCard");
        if (card) card.classList.add("is-broken");
      };
    }
  }

  if (selectedComplaint.latitude != null && selectedComplaint.longitude != null) {
    const lat = Number(selectedComplaint.latitude);
    const lng = Number(selectedComplaint.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      initModalMap(lat, lng, selectedComplaint.accuracy);
    }
  }

  modal.classList.remove("hidden");
}

function closeModal() {
  destroyModalMap();
  modal.classList.add("hidden");
  selectedComplaint = null;
}

async function reload() {
  await fetchComplaints();
  renderList();
}

// Events
searchInput?.addEventListener("input", renderList);
statusFilter?.addEventListener("change", renderList);
thanaFilter?.addEventListener("change", renderList);
priorityFilter?.addEventListener("change", renderList);
sortFilter?.addEventListener("change", renderList);

refreshBtn?.addEventListener("click", () => reload().catch(console.error));

clearFilters?.addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "all";
  thanaFilter.value = "all";
  priorityFilter.value = "all";
  sortFilter.value = "newest";
  renderList();
});

modalClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

modalSave?.addEventListener("click", async () => {
  if (!selectedComplaint) return;

  try {
    modalSave.disabled = true;
    modalSave.textContent = "Updating…";

    await updateStatus(selectedComplaint.id, modalStatus.value, modalNote.value);
    closeModal();
    await reload();
  } catch (e) {
    console.error(e);
    alert(`Update failed: ${e.message || e}`);
  } finally {
    modalSave.disabled = false;
    modalSave.textContent = "Update Status";
  }
});

(async function init() {
  try {
    await reload();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="empty"><strong>Failed to load complaints.</strong><br/>${escapeHtml(
      String(e.message || e)
    )}</div>`;
  }
})();
