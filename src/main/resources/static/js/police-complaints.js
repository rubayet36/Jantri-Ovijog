// police-complaints.js - Final Version with Smart Sorting (Resolved at Bottom)

// ===== Complaints Data =====
let complaintsData = [];

// ===== State =====
let selectedThana = "all";
let selectedStatus = "all";
let selectedPriority = "all";
let searchQuery = "";

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
    initFilters();
    await loadComplaints();
    renderComplaints();
    renderHotspots();
    wireCaseModalClose();
});

// ===== 1. Data Loading =====
async function loadComplaints() {
    try {
        const token = localStorage.getItem("token");
        const resp = await fetch("http://localhost:8080/api/complaints", { 
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        const data = await resp.json();

        if (resp.ok) {
            complaintsData = data.map((c) => {
                return {
                    ...c,
                    id: c.id,
                    description: c.description || "",
                    category: c.category || "General",
                    status: c.status ? c.status.toLowerCase() : "new",
                    
                    // Priority Default
                    priority: c.priority ? c.priority.charAt(0).toUpperCase() + c.priority.slice(1) : "Low",

                    // Mappings
                    busName: c.bus_name ?? c.busName ?? "Unknown Bus",
                    busNumber: c.bus_number ?? c.busNumber ?? "N/A",
                    imageUrl: c.image_url ?? c.imageUrl ?? "",
                    reporterType: c.reporter_type ?? c.reporterType ?? "Public",
                    createdAt: c.created_at ?? c.createdAt ?? new Date().toISOString(),
                    thana: c.thana ?? "Unknown",
                    route: c.route ?? "Unknown",
                    reporterName: c.reporter_name ?? c.reporterName ?? "Anonymous",
                    reporterPhone: c.reporter_phone ?? c.reporterPhone ?? "-",
                    reporterEmail: c.reporter_email ?? c.reporterEmail ?? "-",
                };
            });
            
            // Initial Sort
            sortComplaints(complaintsData);

        } else {
            console.error("Failed to load complaints", data);
            complaintsData = [];
        }
    } catch (err) {
        console.error("Error fetching complaints:", err);
        complaintsData = [];
    }
}

// ===== 2. SMART SORTING LOGIC (Fixed Issue) =====
function sortComplaints(list) {
    const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
    
    // Status Weights: Active/New are higher than Resolved/Closed
    const statusWeight = {
        'new': 10,
        'working': 10,
        'assigned': 10,
        'in-progress': 10,
        'resolved': 0, // Resolved drops to bottom
        'closed': 0,
        'fake': -1
    };

    list.sort((a, b) => {
        const statusA = statusWeight[a.status] || 5;
        const statusB = statusWeight[b.status] || 5;

        // 1. Sort by Status (Active cases stay top)
        if (statusA !== statusB) return statusB - statusA;

        // 2. Sort by Priority (High first)
        const pWeightA = priorityWeight[a.priority] || 0;
        const pWeightB = priorityWeight[b.priority] || 0;
        if (pWeightA !== pWeightB) return pWeightB - pWeightA;

        // 3. Sort by Date (Newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

// ===== 3. Filters =====
function initFilters() {
    const searchInput = document.getElementById("searchInput");
    const thanaSelect = document.getElementById("thanaFilter");
    const statusSelect = document.getElementById("statusFilter");
    const prioritySelect = document.getElementById("priorityFilter"); 

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderComplaints();
        });
    }

    if (thanaSelect) {
        thanaSelect.addEventListener("change", (e) => {
            selectedThana = e.target.value;
            renderComplaints();
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener("change", (e) => {
            selectedStatus = e.target.value.toLowerCase();
            renderComplaints();
        });
    }

    if (prioritySelect) {
        prioritySelect.addEventListener("change", (e) => {
            selectedPriority = e.target.value; 
            renderComplaints();
        });
    }
}

// ===== 4. Rendering =====
function renderComplaints() {
    const container = document.getElementById("policeComplaintsList"); 
    if (!container) return;

    let filtered = complaintsData.filter((c) => {
        const matchesSearch =
            (c.busName || "").toLowerCase().includes(searchQuery) ||
            (c.busNumber || "").toLowerCase().includes(searchQuery) ||
            (c.description || "").toLowerCase().includes(searchQuery) ||
            String(c.id).includes(searchQuery);

        const matchesThana = selectedThana === "all" || c.thana === selectedThana;

        const dataStatus = (c.status || "").toLowerCase();
        const filterStatus = (selectedStatus || "").toLowerCase();
        const matchesStatus = filterStatus === "all" || dataStatus === filterStatus;

        const matchesPriority = selectedPriority === "all" || c.priority === selectedPriority;

        return matchesSearch && matchesThana && matchesStatus && matchesPriority;
    });

    // Apply Smart Sorting
    sortComplaints(filtered);

    container.innerHTML = "";

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-queue">No complaints found matching your filters.</div>`;
        return;
    }

    filtered.forEach((c) => {
        const card = document.createElement("div");
        // Only mark as "Hot" if it's NOT resolved
        const isResolved = ['resolved', 'closed', 'fake'].includes(c.status);
        const isRepeatOffender = !isResolved && complaintsData.filter((x) => x.busNumber === c.busNumber && !['resolved', 'closed', 'fake'].includes(x.status)).length > 2;

        const priorityClass = isResolved ? 'priority-resolved' : `priority-${(c.priority || 'low').toLowerCase()}`;
        
        // Dim the card if resolved
        card.className = `complaint-card ${isRepeatOffender ? "bus-hot" : ""} ${isResolved ? "card-dimmed" : ""}`;

        card.innerHTML = `
            <div class="complaint-image-wrap">
                <img src="${c.imageUrl}" alt="Evidence" onerror="this.src='./assets/bus-generic.jpg'">
                <div class="priority-badge ${priorityClass}">${isResolved ? 'Resolved' : c.priority + ' Priority'}</div>
            </div>

            <div class="complaint-content">
                <div class="complaint-row-top">
                    <div>
                        <div class="complaint-id">#${c.id} · ${c.category}</div>
                        <div class="complaint-bus">${c.busName} (${c.busNumber})</div>
                    </div>
                    <span class="status-badge status-${c.status}">${formatStatus(c.status)}</span>
                </div>

                <div class="complaint-tags">
                    <span class="tag-pill tag-thana">📍 ${c.thana}</span>
                    <span class="tag-pill tag-route">🚌 ${c.route}</span>
                </div>

                <p class="complaint-desc">${c.description || "No description provided."}</p>

                <div class="complaint-meta-row">
                    <div class="complaint-meta">
                        <span>📅 ${formatDate(c.createdAt)}</span>
                    </div>
                    <div class="complaint-actions">
                        <button class="complaint-btn btn-primary-ghost" onclick="openCase(${c.id})">Open Case</button>
                    </div>
                </div>
            </div>
        `;
        
        // Timeline
        const lifecycle = ["new", "assigned", "in-progress", "resolved"];
        const statusMap = { "new": 0, "assigned": 1, "working": 2, "in-progress": 2, "resolved": 3, "closed": 3, "fake": 3 };
        const currentIndex = statusMap[c.status] || 0;
        
        let timelineHtml = '<div class="complaint-timeline">';
        ["Received", "Assigned", "Processing", "Resolved"].forEach((step, idx) => {
            let cls = "";
            if (idx < currentIndex) cls = "completed";
            else if (idx === currentIndex) cls = "active";
            timelineHtml += `<div class="timeline-step ${cls}">${step}</div>`;
        });
        timelineHtml += "</div>";

        card.innerHTML += timelineHtml;
        container.appendChild(card);
    });
}

function renderHotspots() {
    const container = document.getElementById("busHotspotsList");
    if (!container) return;

    const counts = {};
    complaintsData.forEach((c) => {
        // Only count ACTIVE complaints for hotspots
        if (['resolved', 'closed', 'fake'].includes(c.status)) return;

        if (!counts[c.busNumber]) {
            counts[c.busNumber] = { count: 0, name: c.busName, route: c.route };
        }
        counts[c.busNumber].count++;
    });

    const sorted = Object.entries(counts)
        .map(([num, data]) => ({ num, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    container.innerHTML = "";
    sorted.forEach((bus) => {
        const item = document.createElement("div");
        item.className = "bus-hotspot-item";
        item.onclick = () => {
            const searchBox = document.getElementById("searchInput");
            if(searchBox) {
                searchBox.value = bus.num;
                searchBox.dispatchEvent(new Event('input'));
            }
        };

        item.innerHTML = `
            <div>
                <span class="bus-hotspot-title">${bus.name} (${bus.num})</span>
                <span class="bus-hotspot-sub">${bus.route}</span>
            </div>
            <span class="bus-hotspot-count">${bus.count} Active</span>
        `;
        container.appendChild(item);
    });
}

// ===== Helpers =====
function formatStatus(st) {
    if (!st) return "-";
    if (st === "in-progress" || st === "working") return "Processing";
    return st.charAt(0).toUpperCase() + st.slice(1);
}

function formatDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function safe(v) { return v ?? "-"; }

function getById(id) {
    return complaintsData.find((x) => Number(x.id) === Number(id));
}

// ===== Modal Logic =====
function closeCaseModal() {
    const modal = document.getElementById("caseModal");
    if (modal) modal.classList.add("hidden");
}

function wireCaseModalClose() {
    const close1 = document.getElementById("caseModalClose");
    const close2 = document.getElementById("caseModalClose2");
    const modal = document.getElementById("caseModal");
    if (close1) close1.onclick = closeCaseModal;
    if (close2) close2.onclick = closeCaseModal;
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeCaseModal();
        });
    }
}

window.openCase = function (id) {
    const c = getById(id);
    if (!c) return;

    const title = document.getElementById("caseModalTitle");
    const body = document.getElementById("caseModalBody");
    const modal = document.getElementById("caseModal");
    if (!title || !body || !modal) return;

    const pColor = c.priority === "High" ? "red" : c.priority === "Medium" ? "orange" : "green";
    title.innerHTML = `Case #${c.id} <span style="font-size:0.8em; margin-left:10px; color:${pColor}">(${c.priority})</span>`;

    const imgUrl = c.imageUrl || "";
    const imgHtml = imgUrl ? 
        `<div class="case-image"><img src="${imgUrl}" alt="Evidence"><div style="margin-top:10px"><a href="${imgUrl}" target="_blank" class="complaint-btn">View Full Image</a></div></div>` : 
        `<div class="row" style="margin-top:12px; color:#888;">No visual evidence provided.</div>`;

    body.innerHTML = `
        <div class="case-grid">
            <div class="row"><b>Status</b><span>${safe(formatStatus(c.status))}</span></div>
            <div class="row"><b>Date</b><span>${formatDate(c.createdAt)}</span></div>
            <div class="row"><b>Category</b><span>${safe(c.category)}</span></div>
            <div class="row"><b>Priority</b><span style="color:${pColor}; font-weight:bold">${safe(c.priority)}</span></div>
            <div class="row"><b>Thana</b><span>${safe(c.thana)}</span></div>
            <div class="row"><b>Bus</b><span>${safe(c.busName)} (${safe(c.busNumber)})</span></div>
            <div class="row"><b>Reporter</b><span>${safe(c.reporterName)}</span></div>
            <div class="row"><b>Phone</b><span>${safe(c.reporterPhone)}</span></div>
        </div>
        <div class="case-desc"><b>Description</b><p>${safe(c.description)}</p></div>
        ${imgHtml}
    `;

    modal.classList.remove("hidden");
};