// police-manage.js — FIXED (adds Authorization + better error handling)
// Requires token stored in localStorage as "token" (same as your feed/dashboard)

let allComplaints = [];
let selectedComplaint = null;

const tbody = document.getElementById("reportsTbody");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const refreshBtn = document.getElementById("refreshBtn");

const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalStatus = document.getElementById("modalStatus");
const modalNote = document.getElementById("modalNote");
const modalSave = document.getElementById("modalSave");

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function toCamel(row) {
  return {
    id: row.id,
    category: row.category,
    status: (row.status || "new").toLowerCase(),
    thana: row.thana,
    route: row.route,
    busName: row.bus_name ?? "",
    busNumber: row.bus_number ?? "",
    imageUrl: row.image_url ?? "",
    reporterType: row.reporter_type ?? "",
    description: row.description ?? "",
    createdAt: row.created_at ?? null,
    userId: row.user_id ?? null,
    verified: row.verified ?? null,
    verificationNote: row.verification_note ?? null,
  };
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function pill(status) {
  const s = (status || "new").toLowerCase();
  return `<span class="pill ${s}">${s}</span>`;
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

async function fetchComplaints() {
  const resp = await fetch("/api/complaints", {
    headers: getAuthHeaders(),
  });

  const data = await safeReadJson(resp);
  if (!resp.ok) {
    throw new Error(data?.message || data?.error || JSON.stringify(data));
  }

  allComplaints = (Array.isArray(data) ? data : []).map(toCamel);
}

function applyFilters() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const st = statusFilter.value;

  return allComplaints
    .filter((c) => {
      const text = `${c.id} ${c.category} ${c.thana} ${c.route} ${c.busName} ${c.busNumber}`.toLowerCase();
      const qOk = !q || text.includes(q);
      const sOk = st === "all" || (String(c.status || "new").toLowerCase() === st);
      return qOk && sOk;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function renderTable() {
  const rows = applyFilters();

  tbody.innerHTML = rows
    .map(
      (c) => `
    <tr>
      <td>${c.id}</td>
      <td>${c.category || "-"}</td>
      <td>${c.thana || "-"}</td>
      <td>${c.route || "-"}</td>
      <td>${(c.busName || "-")}<br/><span style="opacity:.7;font-size:12px">${c.busNumber || ""}</span></td>
      <td>${pill(c.status)}</td>
      <td>${formatDate(c.createdAt)}</td>
      <td>
        <div class="actionRow">
          <select data-id="${c.id}" class="statusSelect">
            <option value="new" ${c.status === "new" ? "selected" : ""}>new</option>
            <option value="working" ${c.status === "working" ? "selected" : ""}>working</option>
            <option value="resolved" ${c.status === "resolved" ? "selected" : ""}>resolved</option>
            <option value="fake" ${c.status === "fake" ? "selected" : ""}>fake</option>
          </select>
          <button class="btn small viewBtn" data-id="${c.id}">View</button>
          <button class="btn small primary saveBtn" data-id="${c.id}">Update</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  // bind events
  document.querySelectorAll(".viewBtn").forEach((b) => {
    b.addEventListener("click", () => openModal(Number(b.dataset.id)));
  });

  document.querySelectorAll(".saveBtn").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = Number(b.dataset.id);
      const sel = document.querySelector(`.statusSelect[data-id="${id}"]`);

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
  const payload = { status: String(status || "").toLowerCase() };
  if (note && note.trim()) payload.note = note.trim();

  const resp = await fetch(`/api/complaints/${id}/status`, {
    method: "PATCH",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  const data = await safeReadJson(resp);
  if (!resp.ok) {
    // Common useful error message
    throw new Error(data?.message || data?.error || JSON.stringify(data));
  }

  return data;
}

function openModal(id) {
  selectedComplaint = allComplaints.find((c) => c.id === id);
  if (!selectedComplaint) return;

  modalTitle.textContent = `Complaint #${selectedComplaint.id}`;
  modalStatus.value = (selectedComplaint.status || "new").toLowerCase();
  modalNote.value = "";

  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><b>Category:</b> ${selectedComplaint.category || "-"}</div>
      <div><b>Status:</b> ${pill(selectedComplaint.status)}</div>
      <div><b>Thana:</b> ${selectedComplaint.thana || "-"}</div>
      <div><b>Route:</b> ${selectedComplaint.route || "-"}</div>
      <div><b>Bus:</b> ${(selectedComplaint.busName || "-")} (${selectedComplaint.busNumber || "-"})</div>
      <div><b>Reporter Type:</b> ${selectedComplaint.reporterType || "-"}</div>
      <div style="grid-column:1/-1"><b>Description:</b><br/>${selectedComplaint.description || "-"}</div>
      ${
        selectedComplaint.imageUrl
          ? `<div style="grid-column:1/-1"><b>Image:</b><br/><a target="_blank" href="${selectedComplaint.imageUrl}">${selectedComplaint.imageUrl}</a></div>`
          : ``
      }
    </div>
  `;

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  selectedComplaint = null;
}

async function reload() {
  await fetchComplaints();
  renderTable();
}

searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);
refreshBtn.addEventListener("click", () => reload().catch(console.error));

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

modalSave.addEventListener("click", async () => {
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
    tbody.innerHTML = `<tr><td colspan="8">Failed to load complaints. (${String(e.message || e)})</td></tr>`;
  }
})();
