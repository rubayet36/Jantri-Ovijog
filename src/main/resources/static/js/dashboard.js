// dashboard.js — UPDATED
// Goal:
// - "Your Statistics" uses ONLY the logged-in user's complaints (my-complaints)
// - Charts ("Complaints per Company" + "Complaints Overview") use ALL complaints (global)

let myComplaints = [];
let allComplaints = [];

// ------------------------------
// Helpers
// ------------------------------
function normStatus(s) {
  return String(s || "").toLowerCase().trim();
}

function normalizeComplaint(c) {
  return {
    ...c,
    busName: c.bus_name ?? c.busName ?? c.company_name ?? c.companyName ?? "",
    busNumber: c.bus_number ?? c.busNumber ?? "",
    createdAt: c.created_at ?? c.createdAt ?? "",
    thana: c.thana ?? c.area ?? "",
    status: normStatus(c.status),
    category: c.category ?? "Other",
    description: c.description ?? "",
    route: c.route ?? "",
    reporterName: c.reporter_name ?? c.reporterName ?? "",
    reporterType: c.reporter_type ?? c.reporterType ?? "",
  };
}

// ------------------------------
// Fetch: MY complaints (for "Your Statistics" only)
// ------------------------------
async function fetchMyComplaints() {
  try {
    const token = localStorage.getItem("token");
    const resp = await fetch("/api/dashboard/my-complaints", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error("Failed to fetch MY complaints", data);
      myComplaints = [];
      return;
    }

    myComplaints = (Array.isArray(data) ? data : []).map(normalizeComplaint);
  } catch (err) {
    console.error("Error loading MY complaints", err);
    myComplaints = [];
  }
}

// ------------------------------
// Fetch: ALL complaints (for charts + global insights)
// ------------------------------
async function fetchAllComplaints() {
  try {
    const token = localStorage.getItem("token");
    const resp = await fetch("/api/complaints", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const data = await resp.json().catch(() => []);
    if (!resp.ok) {
      console.error("Failed to fetch ALL complaints", data);
      allComplaints = [];
      return;
    }

    allComplaints = (Array.isArray(data) ? data : []).map(normalizeComplaint);
  } catch (err) {
    console.error("Error loading ALL complaints", err);
    allComplaints = [];
  }
}

// ------------------------------
// YOUR STATS (only myComplaints)
// ------------------------------
function loadDashboardStats() {
  const total = myComplaints.length;

  const pending = myComplaints.filter((c) => {
    const st = normStatus(c.status);
    return ["new", "pending", "in-progress", "submitted", "working"].includes(st);
  }).length;

  const resolved = myComplaints.filter((c) => {
    const st = normStatus(c.status);
    return ["resolved", "closed"].includes(st);
  }).length;

  const elTotal = document.getElementById("stat-total");
  const elPending = document.getElementById("stat-pending");
  const elResolved = document.getElementById("stat-resolved");

  if (elTotal) elTotal.textContent = total;
  if (elPending) elPending.textContent = pending;
  if (elResolved) elResolved.textContent = resolved;
}

// ------------------------------
// Charts (GLOBAL: allComplaints)
// ------------------------------
let companyChartInstance = null;
let overviewChartInstance = null;

function destroyChartsIfAny() {
  if (companyChartInstance) {
    companyChartInstance.destroy();
    companyChartInstance = null;
  }
  if (overviewChartInstance) {
    overviewChartInstance.destroy();
    overviewChartInstance = null;
  }
}

function loadCompanyComplaintsChart() {
  const canvas = document.getElementById("companyComplaintsChart");
  if (!canvas) return;

  // Group ALL complaints by company/bus name
  const counts = {};
  allComplaints.forEach((c) => {
    const company = (c.busName || "Unknown").trim() || "Unknown";
    counts[company] = (counts[company] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = labels.map((l) => counts[l]);

  // No data state
  if (labels.length === 0) {
    // Clear chart area (optional)
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Palette-only colors (teal + lime via opacity)
  companyChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Number of Complaints (All Users)",
          data: values,
          backgroundColor: "rgba(11, 69, 80, 0.18)", // teal-ish
          borderColor: "rgba(11, 69, 80, 0.90)",
          borderWidth: 1,
          borderRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#0B4550" } },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          ticks: { color: "rgba(11, 69, 80, 0.70)" },
          grid: { color: "rgba(137, 138, 141, 0.18)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "rgba(11, 69, 80, 0.70)" },
          grid: { color: "rgba(137, 138, 141, 0.18)" },
        },
      },
    },
  });
}

function loadComplaintsOverviewChart() {
  const canvas = document.getElementById("complaintsOverviewChart");
  if (!canvas) return;

  // Overview by category with resolved/pending/fake counts (ALL users)
  const categories = {};
  allComplaints.forEach((c) => {
    const typeKey = String(c.category || "other").toLowerCase().trim() || "other";
    if (!categories[typeKey]) categories[typeKey] = { resolved: 0, pending: 0, fake: 0 };

    const st = normStatus(c.status);
    if (st === "resolved" || st === "closed") categories[typeKey].resolved++;
    else if (st === "fake") categories[typeKey].fake++;
    else categories[typeKey].pending++;
  });

  const labels = Object.keys(categories).map((t) =>
    t
      .split(/[\s\-_/]+/g)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
  );

  if (labels.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const resolvedData = Object.values(categories).map((cat) => cat.resolved);
  const pendingData = Object.values(categories).map((cat) => cat.pending);
  const fakeData = Object.values(categories).map((cat) => cat.fake);

  overviewChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Resolved",
          data: resolvedData,
          backgroundColor: "rgba(11, 69, 80, 0.18)", // teal tint
        },
        {
          label: "Pending",
          data: pendingData,
          backgroundColor: "rgba(230, 255, 43, 0.38)", // lime tint
          borderColor: "rgba(230, 255, 43, 0.70)",
          borderWidth: 1,
        },
        {
          label: "Fake",
          data: fakeData,
          backgroundColor: "rgba(137, 138, 141, 0.30)", // gray tint
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#0B4550" },
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: "rgba(11, 69, 80, 0.70)" },
          grid: { color: "rgba(137, 138, 141, 0.18)" },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "rgba(11, 69, 80, 0.70)" },
          grid: { color: "rgba(137, 138, 141, 0.18)" },
        },
      },
    },
  });
}

// ------------------------------
// Right column (Recent Complaints)
// You can choose:
// - show MY recent complaints (keeps dashboard personal)
// - OR show global recent complaints
// Right now keeping it MY (as your original logic)
// ------------------------------
function loadRecentComplaints() {
  const container = document.getElementById("recentComplaintsList");
  if (!container) return;
  container.innerHTML = "";

  const sorted = [...myComplaints]
    .filter((c) => c.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  sorted.forEach((c) => {
    const status = normStatus(c.status);

    const row = document.createElement("div");
    row.classList.add("complaint-row");

    // status classes for styling
    if (status === "resolved" || status === "closed") row.classList.add("status-resolved");
    else if (["pending", "new", "in-progress", "submitted", "working"].includes(status)) row.classList.add("status-pending");
    else if (status === "fake") row.classList.add("status-fake");

    const title = `${formatType(String(c.category || "Complaint"))} · ID ${c.id}`;
    const routeLine = [c.route, c.thana].filter(Boolean).join(" · ");
    const desc = String(c.description || "").trim();
    const submittedBy = c.reporterName || c.reporterType || "Anonymous";

    row.innerHTML = `
      <div class="complaint-dot" aria-hidden="true"></div>

      <div class="complaint-body">
        <div class="complaint-top">
          <p class="complaint-title" title="${escapeHtml(title)}">${escapeHtml(title)}</p>
        </div>

        <div class="complaint-meta">
          ${routeLine ? `<span>${escapeHtml(routeLine)}</span>` : ""}
          <span>Submitted by: ${escapeHtml(submittedBy)}</span>
        </div>

        ${desc ? `<div class="complaint-desc">${escapeHtml(desc)}</div>` : ""}
      </div>

      <div class="complaint-right">
        <div class="complaint-right-top"><span class="complaint-status">${escapeHtml(status || "pending")}</span><span class="complaint-time">${escapeHtml(timeAgo(c.createdAt))}</span></div>
        <button class="complaint-view" type="button" data-id="${escapeHtml(c.id)}">View</button>
      </div>
    `;

    // Optional: simple "View" behavior without changing backend
    row.querySelector(".complaint-view")?.addEventListener("click", () => {
      // You can later replace this with a details modal/drawer.
      alert(`Complaint ID: ${c.id}`);
    });

    container.appendChild(row);
  });
}

function formatType(type) {
  if (!type) return "";
  const t = String(type).trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ------------------------------
// Trusted routes
// If you want it based on ALL users (recommended), switch to allComplaints.
// ------------------------------
function loadTrustedRoutes() {
  const container = document.getElementById("trustedRoutes");
  if (!container) return;

  container.innerHTML = "";

  // ✅ Use GLOBAL data for routes (more meaningful)
  const source = allComplaints;

  if (source.length === 0) {
    container.innerHTML = "<p>No route data available.</p>";
    return;
  }

  const counts = {};
  source.forEach((c) => {
    const route = c.route || "Unknown";
    counts[route] = (counts[route] || 0) + 1;
  });

  const routeData = Object.entries(counts).map(([route, count]) => {
    let status;
    if (count <= 1) status = "safe";
    else if (count <= 3) status = "watch";
    else status = "caution";
    return { route, count, status };
  });

  routeData.sort((a, b) => a.count - b.count);

  routeData.slice(0, 5).forEach((r) => {
    const chip = document.createElement("button");
    chip.className = `trusted-chip trusted-${r.status}`;
    let label;
    if (r.status === "safe") label = "No serious complaints recently";
    else if (r.status === "watch") label = "Some complaints reported";
    else label = "Multiple complaints reported";
    chip.textContent = `✅ ${r.route} – ${label}`;
    container.appendChild(chip);
  });
}

// ------------------------------
// INIT
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Fetch both data sets
  await Promise.all([fetchMyComplaints(), fetchAllComplaints()]);

  // Personal section
  loadDashboardStats();
  loadRecentComplaints();

  // Global sections
  destroyChartsIfAny();
  loadCompanyComplaintsChart();
  loadComplaintsOverviewChart();
  loadTrustedRoutes();

  // Quick action
  const fareBtn = document.getElementById("btnCalculateFare");
  if (fareBtn) {
    fareBtn.addEventListener("click", () => {
      fareBtn.classList.add("quick-btn-pulse");
      setTimeout(() => {
        fareBtn.classList.remove("quick-btn-pulse");
        window.location.href = "fare.html";
      }, 220);
    });
  }
});
