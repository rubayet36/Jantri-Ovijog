// police-emergency.js – Manage emergency reports on the police portal

// Emergency reports loaded from backend
let emergenciesData = [];

// Load emergencies from backend
async function loadEmergencies() {
  try {
    const token = localStorage.getItem("token");
    const resp = await fetch("/api/emergencies", {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await resp.json();
    if (resp.ok) {
      emergenciesData = data;
    } else {
      console.error("Failed to load emergencies", data);
      emergenciesData = [];
    }
  } catch (err) {
    console.error("Error fetching emergencies:", err);
    emergenciesData = [];
  }
}

let emergencySearchTerm = "";
let emergencyStatusFilter = "all";

document.addEventListener('DOMContentLoaded', async () => {
  initEmergencyFilters();
  await loadEmergencies();
  renderEmergencies();
});

function initEmergencyFilters() {
  const searchInput = document.getElementById('emergencySearch');
  const statusSelect = document.getElementById('emergencyStatusFilter');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      emergencySearchTerm = e.target.value.toLowerCase();
      renderEmergencies();
    });
  }
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      emergencyStatusFilter = e.target.value.toLowerCase();
      renderEmergencies();
    });
  }
}

function renderEmergencies() {
  const container = document.getElementById('emergencyList');
  if (!container) return;

  // Filter dataset based on search and status
  const filtered = emergenciesData.filter((em) => {
    const matchesSearch =
      em.passenger.toLowerCase().includes(emergencySearchTerm) ||
      em.location.toLowerCase().includes(emergencySearchTerm) ||
      String(em.id).includes(emergencySearchTerm);
    const matchesStatus =
      emergencyStatusFilter === 'all' || em.status.toLowerCase() === emergencyStatusFilter;
    return matchesSearch && matchesStatus;
  });

  // Update summary counts
  updateEmergencySummary();

  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-queue">No emergencies found for your filters.</div>';
    return;
  }
  filtered.forEach((em) => {
    const card = document.createElement('div');
    card.className = 'complaint-card';

    // Determine status classes
    const statusClass = `status-${em.status.toLowerCase()}`;

    // Build inner HTML
    card.innerHTML = `
      <div class="complaint-image-wrap">
        <img src="./assets/bus-generic.jpg" alt="Emergency" />
      </div>
      <div class="complaint-content">
        <div class="complaint-row-top">
          <div>
            <div class="complaint-id">#${em.id} · ${em.type}</div>
            <div class="complaint-bus">${em.passenger}</div>
          </div>
          <span class="status-badge ${statusClass}">${formatEmergencyStatus(em.status)}</span>
        </div>
        <div class="complaint-tags">
          <span class="tag-pill tag-thana">📍 ${em.location}</span>
          <span class="tag-pill tag-route">📞 ${em.passenger}</span>
        </div>
        <p class="complaint-desc">${em.description}</p>
        <div class="complaint-meta-row">
          <div class="complaint-meta">
            <span>📅 ${new Date(em.createdAt).toLocaleDateString()}</span>
            <span>⏰ ${new Date(em.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="complaint-actions">
            ${em.status !== 'resolved' ? `<button class="complaint-btn" onclick="updateEmergencyStatus(${em.id}, 'responding')">Respond</button>` : ''}
            ${em.status !== 'resolved' ? `<button class="complaint-btn btn-primary-ghost" onclick="updateEmergencyStatus(${em.id}, 'resolved')">Resolve</button>` : ''}
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Helper: update status and re-render
function updateEmergencyStatus(id, newStatus) {
  const idx = emergenciesData.findIndex((e) => e.id === id);
  if (idx !== -1) {
    emergenciesData[idx].status = newStatus;
    renderEmergencies();
  }
}

// Update quick stat counters
function updateEmergencySummary() {
  const newCount = emergenciesData.filter((e) => e.status === 'new').length;
  const respondingCount = emergenciesData.filter((e) => e.status === 'responding').length;
  const resolvedCount = emergenciesData.filter((e) => e.status === 'resolved').length;
  const elNew = document.getElementById('emNew');
  const elResp = document.getElementById('emResponding');
  const elRes = document.getElementById('emResolved');
  if (elNew) elNew.textContent = newCount;
  if (elResp) elResp.textContent = respondingCount;
  if (elRes) elRes.textContent = resolvedCount;
}

function formatEmergencyStatus(status) {
  const map = {
    new: 'New',
    responding: 'Responding',
    resolved: 'Resolved'
  };
  return map[status] || status;
}