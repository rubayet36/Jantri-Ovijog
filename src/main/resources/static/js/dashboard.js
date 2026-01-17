// dashboard.js — FULLY UPDATED WITH AI CHAT BOT

// ------------------------------
// Helpers
// ------------------------------
let myComplaints = [];
let allComplaints = [];

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
// Fetch: MY complaints
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
// Fetch: ALL complaints
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
// YOUR STATS
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
// Charts
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

  const counts = {};
  allComplaints.forEach((c) => {
    const company = (c.busName || "Unknown").trim() || "Unknown";
    counts[company] = (counts[company] || 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = labels.map((l) => counts[l]);

  if (labels.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  companyChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Number of Complaints (All Users)",
          data: values,
          backgroundColor: "rgba(11, 69, 80, 0.18)",
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
    t.split(/[\s\-_/]+/g).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
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
          backgroundColor: "rgba(11, 69, 80, 0.18)",
        },
        {
          label: "Pending",
          data: pendingData,
          backgroundColor: "rgba(230, 255, 43, 0.38)",
          borderColor: "rgba(230, 255, 43, 0.70)",
          borderWidth: 1,
        },
        {
          label: "Fake",
          data: fakeData,
          backgroundColor: "rgba(137, 138, 141, 0.30)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { color: "#0B4550" } },
      },
      scales: {
        x: { stacked: false, ticks: { color: "rgba(11, 69, 80, 0.70)" }, grid: { color: "rgba(137, 138, 141, 0.18)" } },
        y: { beginAtZero: true, ticks: { color: "rgba(11, 69, 80, 0.70)" }, grid: { color: "rgba(137, 138, 141, 0.18)" } },
      },
    },
  });
}

// ------------------------------
// Recent Complaints
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
        <div class="complaint-right-top">
          <span class="complaint-status">${escapeHtml(status || "pending")}</span>
          <span class="complaint-time">${escapeHtml(timeAgo(c.createdAt))}</span>
        </div>
        <button class="complaint-view" type="button" data-id="${escapeHtml(c.id)}">View</button>
      </div>
    `;

    row.querySelector(".complaint-view")?.addEventListener("click", () => {
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
  return String(str ?? "").replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">").replaceAll('"', "").replaceAll("'", "'");
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
// Trusted Routes
// ------------------------------
function loadTrustedRoutes() {
  const container = document.getElementById("trustedRoutes");
  if (!container) return;
  container.innerHTML = "";

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
// INIT & AI CHAT BOT LOGIC
// ------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Fetch Data
  await Promise.all([fetchMyComplaints(), fetchAllComplaints()]);

  // 2. Load Stats & Charts
  loadDashboardStats();
  loadRecentComplaints();
  destroyChartsIfAny();
  loadCompanyComplaintsChart();
  loadComplaintsOverviewChart();
  loadTrustedRoutes();

  // 3. Quick Action Button (Fare)
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

  // ==========================
  // 🤖 FLOATING CHAT BOT LOGIC
  // ==========================
  const fabBtn = document.getElementById("ai-fab-btn");
  const popup = document.getElementById("ai-chat-popup");
  const closeBtn = document.getElementById("ai-close-btn");
  const submitBtn = document.getElementById("ai-widget-submit");
  const inputField = document.getElementById("ai-widget-input");
  const statusDiv = document.getElementById("ai-widget-status");

  // Toggle Popup
  if (fabBtn && popup) {
    fabBtn.addEventListener("click", () => {
      if (popup.style.display === "none") {
        popup.style.display = "block";
        if (inputField) inputField.focus();
      } else {
        popup.style.display = "none";
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        popup.style.display = "none";
      });
    }
  }

  // Submit to AI
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const text = inputField.value.trim();
      if (!text) return alert("Please type your story first!");

      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Analyzing...";
      if (statusDiv) {
        statusDiv.style.color = "#64748b";
        statusDiv.textContent = "Connecting to AI...";
      }

      try {
        // CALL BACKEND API
        const response = await fetch("/api/complaints/parse-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text })
        });

        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // SAVE DRAFT & REDIRECT
        localStorage.setItem("AI_DRAFT_DATA", JSON.stringify(data));
        
        if (statusDiv) {
          statusDiv.style.color = "green";
          statusDiv.textContent = "✅ Success! Redirecting...";
        }
        
        setTimeout(() => {
          window.location.href = "report.html";
        }, 1000);

      } catch (err) {
        console.error(err);
        if (statusDiv) {
          statusDiv.style.color = "red";
          statusDiv.textContent = "Error: " + err.message;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "✨ Analyze & Draft";
      }
    });
  }
});