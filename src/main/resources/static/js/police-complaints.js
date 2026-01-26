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
    priority: (row.priority || "low").toLowerCase(),
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

  if (s === "working") return "status-working";
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

function getNormalizedBusKey(c) {
  // 1. Try explicit bus number
  let rawKey = c.busNumber;

  // 2. If missing, try to extract from busName (e.g. "Vector - DHA-11-2222")
  if (!rawKey && c.busName) {
    const match = c.busName.match(/([a-z]+-\d+-\d+(?:-\d+)?)/i);
    if (match) {
      rawKey = match[1];
    } else {
      rawKey = c.busName;
    }
  }

  // Normalize
  return (rawKey || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchBusHistory(busNumber) {
  if (!busNumber) return [];
  const resp = await fetch(
    `/api/complaints/bus/${encodeURIComponent(busNumber)}`,
    {
      headers: getAuthHeaders(),
    },
  );
  const data = await safeReadJson(resp);
  if (!resp.ok)
    throw new Error(data?.message || data?.error || "Failed to load history");
  return (Array.isArray(data) ? data : []).map(toCamel);
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
  // ✅ UPDATED: Full list of Dhaka Thanas (static + dynamic merge)
  const knownThanas = [
    "Adabor",
    "Airport",
    "Badda",
    "Banani",
    "Bangshal",
    "Bhashantek",
    "Cantonment",
    "Chak Bazar",
    "Dakshinkhan",
    "Darus Salam",
    "Demra",
    "Dhanmondi",
    "Gendaria",
    "Gulshan",
    "Hazaribagh",
    "Jatrabari",
    "Kadamtali",
    "Kafrul",
    "Kalabagan",
    "Kamrangirchar",
    "Khilgaon",
    "Khilkhet",
    "Kotwali",
    "Lalbagh",
    "Mirpur Model",
    "Mohammadpur",
    "Motijheel",
    "New Market",
    "Pallabi",
    "Paltan",
    "Ramna",
    "Rampura",
    "Sabujbagh",
    "Shah Ali",
    "Shahbagh",
    "Sher-e-Bangla Nagar",
    "Shyampur",
    "Sutrapur",
    "Tejgaon",
    "Tejgaon Industrial",
    "Turag",
    "Uttara East",
    "Uttara West",
    "Uttar Khan",
    "Vatara",
    "Wari",
  ];

  // Merge with any existing values in data (case-insensitive dedupe)
  const dataThanas = allComplaints.map((c) => String(c.thana || "-").trim());
  const combined = new Set([...knownThanas, ...dataThanas]);

  const thanas = [...combined]
    .filter(Boolean)
    .filter((t) => t !== "-")
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
    const text =
      `${c.id} ${c.category} ${c.thana} ${c.route} ${c.busName} ${c.busNumber} ${c.status} ${c.priority}`.toLowerCase();
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

  // ✅ Grouping Logic
  // Define priority rank for consistent sorting
  const priorityRank = { high: 0, medium: 1, low: 2 };

  const groups = {};
  const singles = [];

  rows.forEach((c) => {
    const bNum = getNormalizedBusKey(c);

    if (bNum) {
      if (!groups[bNum]) groups[bNum] = [];
      groups[bNum].push(c);
    } else {
      singles.push(c);
    }
  });

  // Convert groups map to array for sorting/mixing
  const groupedItems = [];
  Object.values(groups).forEach((g) => {
    if (g.length === 1) {
      singles.push(g[0]);
    } else {
      // Sort inside group: Priority then Newest
      g.sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 9;
        const pb = priorityRank[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      groupedItems.push({
        type: "group",
        items: g,
        // Group properties for sorting in the main list
        latestDate: g[0].createdAt,
        // Logic: if any is high priority, group is high
        priority: g.some((x) => x.priority === "high")
          ? "high"
          : g.some((x) => x.priority === "medium")
            ? "medium"
            : "low",
      });
    }
  });

  singles.forEach((s) => {
    groupedItems.push({
      type: "single",
      item: s,
      latestDate: s.createdAt,
      priority: s.priority,
    });
  });

  // Sort the final list (mixed groups and singles)
  // priorityRank is already defined above
  groupedItems.sort((a, b) => {
    const da = new Date(a.latestDate || 0).getTime();
    const db = new Date(b.latestDate || 0).getTime();

    // Priority sort
    const pa = priorityRank[a.priority] ?? 9;
    const pb = priorityRank[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    // Date sort
    return db - da;
  });

  // helper: render a collapsed group row (Card Style)
  const renderGroupRow = (obj) => {
    const latest = obj.items[0];
    const busTitle = `${escapeHtml(latest.busName || "Unknown Bus")}`;
    const busNum = escapeHtml(latest.busNumber || "-");
    const count = obj.items.length;

    // Check priority of the group (if any item is high, group is high)
    const isHigh = obj.priority === "high";
    const prClass = isHigh ? "prio-high" : "prio-low";
    const prLabel = isHigh ? "High Priority" : "Normal";

    // Standard Card Structure
    return `
      <article class="report-item">
        <div class="report-top">
          <div style="min-width:0;">
             <div class="report-id" style="color:var(--m-blue); font-weight:800;">CLUSTER</div>
             <h3 class="report-title">${busTitle}</h3>
          </div>
          <div class="badges">
            <span class="badge ${prClass}">${prLabel}</span>
            <span class="badge" style="background:#f1f5f9; color:#475569;">${count} Reports</span>
          </div>
        </div>

        <div class="report-main">
          <div class="meta-grid">
             <div class="meta-icon">🚎</div> <div>${busNum}</div>
             <div class="meta-icon">📅</div> <div>Latest: ${formatDate(latest.createdAt)}</div>
          </div>
          
          <p class="report-desc" style="font-style:italic; color:var(--m-muted);">
            This cluster contains ${count} reports for the same bus. Review them together to identify patterns.
          </p>
        </div>

        <div class="report-actions" style="justify-content: flex-end;">
           <button class="m-btn m-btn-primary" type="button" style="width:100%"
              data-action="review-bus"
              data-busnumber="${escapeHtml(latest.busNumber || "")}"
              data-latestid="${latest.id}">
              Review ${count} Reports
           </button>
        </div>
      </article>
    `;
  };

  // Render function helper (Modern Card)
  const renderCard = (c) => {
    const statusClass = statusBadgeClass(c.status);
    const prClass = prioBadgeClass(c.priority);
    const safeTitle = escapeHtml(c.category || "General Report");
    const safeThana = escapeHtml(c.thana || "-");
    const safeRoute = escapeHtml(c.route || "-");
    const bus = `${escapeHtml(c.busName || "-")}`;
    const busNum = c.busNumber ? escapeHtml(c.busNumber) : "";
    const desc = escapeHtml(c.description || "No description provided.");
    const created = formatDate(c.createdAt);

    return `
        <article class="report-item" data-id="${c.id}">
          <div class="report-top">
            <div style="min-width:0;">
              <div class="report-id">#${c.id}</div>
              <h3 class="report-title">${safeTitle}</h3>
            </div>
            <div class="badges">
              <span class="badge ${statusClass}">${escapeHtml(normalizeStatus(c.status))}</span>
              <span class="badge ${prClass}">${prioLabel(c.priority)}</span>
            </div>
          </div>

          <div class="report-main">
            <div class="meta-grid">
              <div class="meta-icon">📍</div> <div>${safeThana}</div>
              <div class="meta-icon">🚌</div> <div>${safeRoute}</div>
              <div class="meta-icon">🚎</div> <div>${bus} <span style="color:#9ca3af; font-size:12px;">${busNum}</span></div>
              <div class="meta-icon">🕒</div> <div>${created}</div>
            </div>

            <p class="report-desc">${desc}</p>
          </div>

          <div class="report-actions">
             <select class="statusCheck statusSelect" data-id="${c.id}" aria-label="Change status" onclick="event.stopPropagation()">
                <option value="new" ${normalizeStatus(c.status) === "new" ? "selected" : ""}>New</option>
                <option value="working" ${normalizeStatus(c.status) === "working" ? "selected" : ""}>Working</option>
                <option value="resolved" ${normalizeStatus(c.status) === "resolved" ? "selected" : ""}>Resolved</option>
                <option value="fake" ${normalizeStatus(c.status) === "fake" ? "selected" : ""}>Fake</option>
             </select>

             <div style="display:flex; gap:8px;">
                <button class="m-btn m-btn-primary" type="button" data-action="update" data-id="${c.id}">Save</button>
                <button class="m-btn" type="button" data-action="view" data-id="${c.id}">Review</button>
             </div>
          </div>
        </article>
      `;
  };

  listEl.innerHTML = groupedItems
    .map((obj) => {
      if (obj.type === "single") {
        return renderCard(obj.item);
      } else {
        return renderGroupRow(obj);
      }
    })
    .join("");

  // Bind buttons
  listEl.querySelectorAll("button[data-action='view']").forEach((b) => {
    b.addEventListener("click", async () => {
      await openModal(Number(b.dataset.id));
    });
  });

  listEl.querySelectorAll("button[data-action='review-bus']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      // Ensure we treat dataset values safely
      const busNumber = btn.dataset.busnumber;
      const latestId = Number(btn.dataset.latestid);
      await openModal(latestId, { busNumber });
    });
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

  modalMap = L.map(el, { zoomControl: true, scrollWheelZoom: true });
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

async function openModal(id, opts = {}) {
  selectedComplaint = allComplaints.find((c) => c.id === id);
  if (!selectedComplaint) return;

  // ✅ always load full history (including resolved) by bus_number
  let related = [];
  const busNumber = opts.busNumber || selectedComplaint.busNumber;

  try {
    if (busNumber) related = await fetchBusHistory(busNumber);
  } catch (e) {
    console.warn("History fetch failed, fallback to local list:", e);
    // fallback to local memory if backend not available
    const key = getNormalizedBusKey(selectedComplaint);
    related = allComplaints.filter((c) => getNormalizedBusKey(c) === key);
  }

  related.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );

  let historyHtml = "";
  if (related.length > 0) {
    historyHtml = `
        <div style="grid-column: 1 / -1; margin-top: 16px; border-top: 1px dashed var(--m-border); padding-top: 16px;">
          <h4 style="margin:0 0 10px; font-size:14px; color:var(--m-text);">
            📜 History (${related.length} reports for this bus)
          </h4>
          <div class="history-list">
            ${related
              .map((r) => {
                const isCurrent = r.id === selectedComplaint.id;
                const st = normalizeStatus(r.status);
                const dt = formatDate(r.createdAt);
                return `
                <div class="history-item ${isCurrent ? "is-current" : ""}" onclick="${!isCurrent ? `openModal(${r.id})` : ""}">
                   <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <span style="font-weight:700; font-size:12px;">#${r.id}</span>
                      <span class="badge ${statusBadgeClass(r.status)}" style="transform:scale(0.9);">${st}</span>
                   </div>
                   <div style="font-size:12px; margin-top:2px; color:var(--m-text); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                      ${escapeHtml(r.category || "Unknown")}
                   </div>
                   <div style="font-size:10px; color:var(--m-muted); margin-top:2px;">${dt}</div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `;
  }

  modalKicker.textContent = `Priority: ${prioLabel(
    selectedComplaint.priority,
  )} · Status: ${normalizeStatus(selectedComplaint.status)}`;
  modalTitle.textContent = `Complaint #${selectedComplaint.id} — ${
    selectedComplaint.category || ""
  }`;

  modalStatus.value = normalizeStatus(selectedComplaint.status);
  modalNote.value = "";

  modalBody.innerHTML = `
    <div class="review-grid">
      <!-- Main Details Column -->
      <div class="review-main">
        <div class="detail-block">
          <div class="detail-row">
            <div class="detail-item">
              <label>Category</label>
              <div>${escapeHtml(selectedComplaint.category || "-")}</div>
            </div>
            <div class="detail-item">
              <label>Priority</label>
              <div>${escapeHtml(prioLabel(selectedComplaint.priority))}</div>
            </div>
          </div>
          <div class="detail-row">
            <div class="detail-item">
              <label>Thana</label>
              <div>${escapeHtml(selectedComplaint.thana || "-")}</div>
            </div>
            <div class="detail-item">
              <label>Route</label>
              <div>${escapeHtml(selectedComplaint.route || "-")}</div>
            </div>
          </div>
          <div class="detail-item">
            <label>Description</label>
            <div class="detail-desc">${escapeHtml(selectedComplaint.description || "-")}</div>
          </div>
        </div>

        ${historyHtml ? `<div class="detail-block">${historyHtml}</div>` : ""}
      </div>

      <!-- Sidebar Column (Meta + Media) -->
      <div class="review-sidebar">
        <div class="detail-block">
          <div class="detail-row" style="grid-template-columns:1fr; gap:12px; margin-bottom:0;">
            <div class="detail-item">
              <label>Status</label>
              <span class="badge ${statusBadgeClass(selectedComplaint.status)}">
                ${escapeHtml(normalizeStatus(selectedComplaint.status))}
              </span>
            </div>
            <div class="detail-item">
              <label>Bus Details</label>
              <div>${escapeHtml(selectedComplaint.busName || "-")}</div>
              <div style="font-size:12px; color:var(--m-muted); margin-top:2px;">${escapeHtml(selectedComplaint.busNumber || "-")}</div>
            </div>
            <div class="detail-item">
              <label>Reporter</label>
              <div>${escapeHtml(selectedComplaint.reporterType || "-")}</div>
            </div>
            <div class="detail-item">
              <label>Created At</label>
              <div>${escapeHtml(formatDate(selectedComplaint.createdAt))}</div>
            </div>
          </div>
        </div>

        ${
          selectedComplaint.latitude != null &&
          selectedComplaint.longitude != null
            ? `
          <div class="detail-block" style="padding:0; overflow:hidden;">
            <div id="modalMap" class="modalMap" aria-label="Case location map" style="margin:0; border:none; border-radius:0;"></div>
            
          </div>
        `
            : ""
        }

        ${
          selectedComplaint.imageUrl
            ? `
          <div class="detail-block" style="padding:0; overflow:hidden;">
            <img id="modalImage" class="modalImage" alt="Complaint evidence" 
                 loading="lazy" decoding="async" referrerpolicy="no-referrer" 
                 style="margin:0; border:none; border-radius:0; max-height:240px;" />
            <div class="imageMeta" style="background:#fff; border-top:1px solid var(--m-border);">
              <a class="imageLink" target="_blank" rel="noreferrer" href="${escapeHtml(selectedComplaint.imageUrl)}">
                Open image in new tab
              </a>
            </div>
          </div>
        `
            : ""
        }
      </div>
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

  if (
    selectedComplaint.latitude != null &&
    selectedComplaint.longitude != null
  ) {
    const lat = Number(selectedComplaint.latitude);
    const lng = Number(selectedComplaint.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      initModalMap(lat, lng, selectedComplaint.accuracy);
    }
  }

  modal.classList.remove("hidden");
  // Allow time for display:flex to apply
  requestAnimationFrame(() => {
    modal.classList.add("visible");
  });
}

function closeModal() {
  destroyModalMap();
  modal.classList.remove("visible");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200); // 0.2s duration from CSS
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

    await updateStatus(
      selectedComplaint.id,
      modalStatus.value,
      modalNote.value,
    );
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
      String(e.message || e),
    )}</div>`;
  }
})();
