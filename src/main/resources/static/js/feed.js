// feed.js — Modern Feed + Global Map + Detail Modal
// Backend endpoints unchanged (same as your current working code).
// List view: clean cards (no reactions/comments UI)
// Detail modal: reactions + comments
// Map: single map panel with pins for filtered items

(function () {
  function getClientId() {
    let id = localStorage.getItem("client_id");
    if (!id) {
      id =
        (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + "_" + Math.random().toString(36).slice(2);
      localStorage.setItem("client_id", id);
    }
    return id;
  }

  let issues = [];
  let currentFilter = "all";     // all | new | working | resolved (fake posts are never shown)
  let currentSort = "recent";    // recent | top-react | top-comment

  // Map
  let globalMap = null;
  let markersLayer = null;
  const markerById = new Map(); // id -> marker

  // Custom icons
  const blueIcon = typeof L !== "undefined" ? L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }) : null;

  const redIcon = typeof L !== "undefined" ? L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }) : null;

  // Modal state
  let activeIssueId = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function computeTimeAgo(date) {
    const now = Date.now();
    const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
    if (Number.isNaN(then)) return "just now";

    const diff = Math.max(0, now - then);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return "just now";
    if (diff < hour) {
      const minutes = Math.floor(diff / minute);
      return minutes <= 1 ? "1 minute ago" : `${minutes} minutes ago`;
    }
    if (diff < day) {
      const hours = Math.floor(diff / hour);
      return hours <= 1 ? "1 hour ago" : `${hours} hours ago`;
    }
    const days = Math.floor(diff / day);
    return days <= 1 ? "1 day ago" : `${days} days ago`;
  }

  function formatStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s === "working") return "In Progress";
    if (s === "resolved") return "Resolved";
    if (s === "fake") return "Fake";
    return "New";
  }

  function statusBadgeClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "working") return "working";
    if (s === "resolved") return "resolved";
    if (s === "fake") return "fake";
    return "new";
  }

  function initialsFrom(text) {
    const t = String(text || "User").trim();
    const parts = t.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || "").join("") || "U";
  }

  function toNumberOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function ensureLeafletAvailable() {
    return typeof window.L !== "undefined";
  }

  function renderState(title, message) {
    const feedList = document.getElementById("feed-list");
    if (!feedList) return;
    feedList.innerHTML = `
      <div class="feed-state">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  // --------------------
  // Skeleton loading
  // --------------------
  function renderSkeleton(count = 6) {
    const feedList = document.getElementById("feed-list");
    if (!feedList) return;

    feedList.innerHTML = Array.from({ length: count }).map(() => {
      return `
        <article class="feed-card" aria-hidden="true" style="pointer-events: none;">
          <div class="feed-card-body">
            <div class="feed-top">
              <div class="feed-user">
                <div class="skeleton skeleton-circle" style="width: 40px; height: 40px;"></div>
                <div class="user-meta" style="width:100%">
                  <div class="skeleton skeleton-text w-50"></div>
                  <div class="skeleton skeleton-text w-75" style="height: 10px;"></div>
                </div>
              </div>
              <div class="status-badge skeleton" style="width:80px; height:24px; border:none;"></div>
            </div>

            <div style="height:12px"></div>
            <div class="skeleton skeleton-text" style="height: 24px; width: 60%; margin-bottom: 12px;"></div>

            <div class="meta-row" style="margin-top:14px; gap: 8px;">
              <span class="skeleton" style="width: 80px; height: 20px; border-radius: 99px;"></span>
              <span class="skeleton" style="width: 100px; height: 20px; border-radius: 99px;"></span>
              <span class="skeleton" style="width: 90px; height: 20px; border-radius: 99px;"></span>
            </div>

            <div style="display:flex; flex-direction:column; gap:6px; margin-top:12px">
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text"></div>
              <div class="skeleton skeleton-text w-75"></div>
            </div>

            <div class="engagement-row" style="margin-top:18px; gap: 12px;">
              <span class="skeleton" style="width: 60px; height: 20px; border-radius: 12px;"></span>
              <span class="skeleton" style="width: 60px; height: 20px; border-radius: 12px;"></span>
              <span class="skeleton" style="width: 60px; height: 20px; border-radius: 12px;"></span>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  async function loadIssues() {
    const token = localStorage.getItem("token");
    const resp = await fetch("/api/complaints", {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error("Failed to load complaints", data);
      issues = [];
      return;
    }

    const raw = (Array.isArray(data) ? data : []);

    // ✅ Hard block: never allow fake/declared-fake posts to reach UI
    // Supports multiple possible backend fields.
    const nonFake = raw.filter((c) => {
      const status = String(c?.status || "").toLowerCase();
      const isFakeFlag = (c?.is_fake ?? c?.isFake ?? c?.fake ?? false) === true;
      return status !== "fake" && !isFakeFlag;
    });

    issues = nonFake.map((c) => {
      const created = c.created_at || c.createdAt || null;
      const createdDate = created ? new Date(created) : new Date();

      let title;
      if (c.category) {
        title = c.category;
        const busName = c.bus_name || c.busName;
        if (busName) title += ` on ${busName}`;
      } else {
        title = `Complaint #${c.id}`;
      }

      const imageUrl = c.image_url || c.imageUrl || "";

      return {
        id: c.id,
        createdAt: createdDate,
        timestamp: createdDate.getTime(),

        title,
        description: c.description || "",

        route: c.route || "",
        area: c.thana || "",
        company: c.bus_name || c.busName || c.companyName || "",

        timeAgo: computeTimeAgo(createdDate),
        category: c.category || "General",

        status: String(c.status || "new").toLowerCase(),

        imageUrl,
        latitude: toNumberOrNull(c.latitude),
        longitude: toNumberOrNull(c.longitude),

        reactions: { support: 0, angry: 0, watch: 0 },
        myReaction: null,
        comments: [],
      };
    });

    await hydrateIssuesFromDB();
  }

  async function hydrateIssuesFromDB() {
    const token = localStorage.getItem("token");
    const clientId = getClientId();

    await Promise.all(
      issues.map(async (issue) => {
        try {
          const rResp = await fetch(
            `/api/complaints/${issue.id}/reactions?clientId=${encodeURIComponent(clientId)}`,
            { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
          );
          const rData = await rResp.json().catch(() => ({}));
          if (rResp.ok) {
            issue.reactions.support = Number(rData.support || 0);
            issue.reactions.angry = Number(rData.angry || 0);
            issue.reactions.watch = Number(rData.watch || 0);
            issue.myReaction = rData.myReaction || null;
          }

          const cResp = await fetch(`/api/complaints/${issue.id}/comments`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          const cData = await cResp.json().catch(() => []);
          if (cResp.ok && Array.isArray(cData)) {
            issue.comments = cData.map((c) => ({
              author: c.author_name || "Anonymous",
              text: c.body || "",
            }));
          }
        } catch (e) {
          console.error("hydrate error", issue.id, e);
        }
      })
    );
  }

  async function refreshReactions(complaintId) {
    const token = localStorage.getItem("token");
    const clientId = getClientId();

    const resp = await fetch(
      `/api/complaints/${complaintId}/reactions?clientId=${encodeURIComponent(clientId)}`,
      { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return;

    const issue = issues.find((x) => String(x.id) === String(complaintId));
    if (!issue) return;

    issue.reactions.support = Number(data.support || 0);
    issue.reactions.angry = Number(data.angry || 0);
    issue.reactions.watch = Number(data.watch || 0);
    issue.myReaction = data.myReaction || null;
  }

  async function refreshComments(complaintId) {
    const token = localStorage.getItem("token");

    const resp = await fetch(`/api/complaints/${complaintId}/comments`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    const data = await resp.json().catch(() => []);
    if (!resp.ok) return;

    const issue = issues.find((x) => String(x.id) === String(complaintId));
    if (!issue) return;

    issue.comments = (Array.isArray(data) ? data : []).map((c) => ({
      author: c.author_name || "Anonymous",
      text: c.body || "",
    }));
  }

  function totalReacts(issue) {
    return (issue.reactions.support || 0) + (issue.reactions.angry || 0) + (issue.reactions.watch || 0);
  }

  function applyFilterAndSort() {
    let filtered = [...issues];

    // Safety: if UI somehow sets 'fake' filter, reset to all.
    if (currentFilter === "fake") currentFilter = "all";

    // Safety: if UI somehow tries to set fake, force back to all.
    if (currentFilter === "fake") currentFilter = "all";

    if (currentFilter !== "all") {
      filtered = filtered.filter((issue) => issue.status === currentFilter);
    }

    filtered.sort((a, b) => {
      if (currentSort === "recent") return b.timestamp - a.timestamp;
      if (currentSort === "top-react") return totalReacts(b) - totalReacts(a);
      if (currentSort === "top-comment") return b.comments.length - a.comments.length;
      return 0;
    });

    renderFeed(filtered);
    updateGlobalMap(filtered);
  }

  // --------------------
  // Global map
  // --------------------
  function initGlobalMap() {
    if (!ensureLeafletAvailable()) return;
    const el = document.getElementById("global-map");
    if (!el) return;

    globalMap = window.L.map(el, { zoomControl: true, scrollWheelZoom: true })
      .setView([23.8103, 90.4125], 12); // Dhaka default

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(globalMap);

    markersLayer = window.L.layerGroup().addTo(globalMap);
  }

  function clearMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    markerById.clear();
  }

  function updateGlobalMap(list) {
    const badge = document.getElementById("map-count");
    if (!globalMap || !markersLayer) return;

    clearMarkers();

    const withCoords = (list || []).filter(i => Number.isFinite(i.latitude) && Number.isFinite(i.longitude));
    if (badge) badge.textContent = `${withCoords.length} pins`;

    if (withCoords.length === 0) return;

    const bounds = [];
    withCoords.forEach((issue) => {
      const m = window.L.marker([issue.latitude, issue.longitude], { icon: blueIcon, opacity: 0.5 }).addTo(markersLayer);
      m.bindPopup(`<b>${escapeHtml(issue.title)}</b><br/>${escapeHtml(formatStatus(issue.status))}`);
      markerById.set(String(issue.id), m);
      bounds.push([issue.latitude, issue.longitude]);
    });

    try {
      globalMap.fitBounds(bounds, { padding: [24, 24] });
    } catch (_) { }
  }

  function highlightMarker(issueId, openPopup = false) {
    // Reset all to blue and semi-transparent
    markerById.forEach((marker) => {
      marker.setIcon(blueIcon);
      marker.setOpacity(0.5);
    });

    const m = markerById.get(String(issueId));
    if (!m) return;

    // Set selected to red and fully opaque
    m.setIcon(redIcon);
    m.setOpacity(1.0);

    try {
      if (openPopup) m.openPopup();
      globalMap.panTo(m.getLatLng(), { animate: true });
    } catch (_) { }
  }

  // --------------------
  // Feed rendering
  // --------------------
  function renderFeed(data) {
    const feedList = document.getElementById("feed-list");
    if (!feedList) return;

    feedList.innerHTML = "";

    if (!data || data.length === 0) {
      renderState("No reports found", "Try changing sort or status.");
      return;
    }

    data.forEach((issue) => {
      const card = document.createElement("article");
      card.className = "feed-card";
      card.dataset.id = issue.id;

      const displayName = issue.company?.trim() ? issue.company : "Anonymous";
      const avatarInitials = initialsFrom(displayName);
      const badgeClass = statusBadgeClass(issue.status);

      card.innerHTML = `
        <div class="feed-card-body">
          <div class="feed-top">
            <div class="feed-user">
              <div class="avatar" aria-hidden="true">${escapeHtml(avatarInitials)}</div>
              <div class="user-meta">
                <div class="user-name">${escapeHtml(displayName)}</div>
                <div class="user-sub">${escapeHtml(issue.timeAgo)} • #${escapeHtml(issue.id)}</div>
              </div>
            </div>
            <div class="status-badge ${badgeClass}">${escapeHtml(formatStatus(issue.status))}</div>
          </div>

          <h2 class="feed-title">${escapeHtml(issue.title)}</h2>

          <div class="meta-row">
            <span class="meta category">${escapeHtml(issue.category || "General")}</span>
            <span class="meta">${escapeHtml(issue.area || "Unknown area")}</span>
            <span class="meta">${escapeHtml(issue.route || "Route N/A")}</span>
          </div>

          <div class="feed-body">${escapeHtml(issue.description || "")}</div>

          <div class="engagement-row">
            <span class="engagement-chip">💬 ${issue.comments.length} comments</span>
            <span class="engagement-chip">👍 ${totalReacts(issue)} reacts</span>
            <span class="engagement-chip">📍 ${escapeHtml(issue.area || "Dhaka")}</span>
          </div>
        </div>
      `;

      // hover highlight pin
      card.addEventListener("mouseenter", () => highlightMarker(issue.id, false));
      // click opens detail modal
      card.addEventListener("click", () => openDetail(issue.id));

      feedList.appendChild(card);
    });
  }

  // --------------------
  // Detail modal (reactions + comments)
  // --------------------
  function modalEls() {
    return {
      modal: document.getElementById("detail-modal"),
      backdrop: document.getElementById("modal-backdrop"),
      close: document.getElementById("modal-close"),
      status: document.getElementById("detail-status"),
      title: document.getElementById("detail-title"),
      sub: document.getElementById("detail-sub"),
      meta: document.getElementById("detail-meta"),
      desc: document.getElementById("detail-desc"),
      imgWrap: document.getElementById("detail-image-wrap"),
      img: document.getElementById("detail-image"),

      support: document.getElementById("detail-support"),
      angry: document.getElementById("detail-angry"),
      watch: document.getElementById("detail-watch"),
      supportCount: document.getElementById("detail-support-count"),
      angryCount: document.getElementById("detail-angry-count"),
      watchCount: document.getElementById("detail-watch-count"),

      commentCount: document.getElementById("detail-comments-count"),
      commentList: document.getElementById("detail-comment-list"),
      commentForm: document.getElementById("detail-comment-form"),
      commentInput: document.getElementById("detail-comment-input"),
    };
  }

  function openModal() {
    const { modal, backdrop } = modalEls();
    backdrop.classList.add("open");
    modal.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const { modal, backdrop } = modalEls();
    backdrop.classList.remove("open");
    modal.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    activeIssueId = null;
  }

  function renderModal(issue) {
    const els = modalEls();
    const badgeClass = statusBadgeClass(issue.status);

    els.status.className = `status-badge ${badgeClass}`;
    els.status.textContent = formatStatus(issue.status);

    els.title.textContent = issue.title || "Report";
    els.sub.textContent = `${issue.timeAgo} • #${issue.id}`;

    els.meta.innerHTML = `
      <span class="meta category">${escapeHtml(issue.category || "General")}</span>
      <span class="meta">${escapeHtml(issue.area || "Unknown area")}</span>
      <span class="meta">${escapeHtml(issue.route || "Route N/A")}</span>
      <span class="meta">${escapeHtml(issue.company || "Anonymous")}</span>
    `;

    els.desc.textContent = issue.description || "";

    // image
    if (issue.imageUrl) {
      els.imgWrap.style.display = "";
      els.img.src = issue.imageUrl;
      els.img.onerror = () => { els.imgWrap.style.display = "none"; };
    } else {
      els.imgWrap.style.display = "none";
      els.img.src = "";
    }

    // counts + active state
    els.supportCount.textContent = issue.reactions.support || 0;
    els.angryCount.textContent = issue.reactions.angry || 0;
    els.watchCount.textContent = issue.reactions.watch || 0;

    els.support.classList.toggle("active", issue.myReaction === "support");
    els.angry.classList.toggle("active", issue.myReaction === "angry");
    els.watch.classList.toggle("active", issue.myReaction === "watch");

    // comments
    els.commentCount.textContent = `${issue.comments.length}`;
    els.commentList.innerHTML = issue.comments.length
      ? issue.comments.map(c => `
          <div class="comment-item">
            <span class="comment-author">${escapeHtml(c.author)}:</span>
            <span>${escapeHtml(c.text)}</span>
          </div>
        `).join("")
      : `<div class="comment-item"><span class="comment-author">No comments yet.</span> Be the first to comment.</div>`;
  }

  async function openDetail(issueId) {
    const issue = issues.find(x => String(x.id) === String(issueId));
    if (!issue) return;

    activeIssueId = issueId;

    // highlight pin + popup
    highlightMarker(issueId, true);

    // ensure fresh data in modal
    await refreshReactions(issueId);
    await refreshComments(issueId);

    renderModal(issue);
    openModal();
  }

  async function postReaction(type) {
    if (!activeIssueId) return;
    const issue = issues.find(x => String(x.id) === String(activeIssueId));
    if (!issue) return;

    const token = localStorage.getItem("token");
    const resp = await fetch(`/api/complaints/${issue.id}/reactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        complaint_id: issue.id,
        reactionType: type,
        clientId: getClientId(),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error("Reaction save failed", err);
      alert(err.error || "Failed to save reaction");
      return;
    }

    await refreshReactions(issue.id);
    renderModal(issue);
    applyFilterAndSort(); // keep list + map updated
  }

  async function postComment(text) {
    if (!activeIssueId) return;
    const issue = issues.find(x => String(x.id) === String(activeIssueId));
    if (!issue) return;

    const token = localStorage.getItem("token");
    const resp = await fetch(`/api/complaints/${issue.id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ author_name: "You", body: text }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error("Comment save failed", err);
      alert(err.error || "Failed to post comment");
      return;
    }

    await refreshComments(issue.id);
    renderModal(issue);
    applyFilterAndSort();
  }

  // --------------------
  // Boot
  // --------------------
  document.addEventListener("DOMContentLoaded", async () => {
    initGlobalMap();

    // show skeletons immediately
    renderSkeleton(6);

    // If your HTML still has a "fake" option, remove it (fake posts are blocked in UI anyway)
    const statusSelect = document.getElementById("status-filter");
    if (statusSelect) {
      const fakeOpt = statusSelect.querySelector('option[value="fake"], option[value="Fake"], option[value="FAKE"]');
      if (fakeOpt) fakeOpt.remove();
    }

    await loadIssues();
    applyFilterAndSort();

    // sort segmented buttons
    const sortButtons = document.querySelectorAll(".seg-btn");
    sortButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        sortButtons.forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        currentSort = btn.dataset.sort;
        applyFilterAndSort();
      });
    });

    // status filter select
    if (statusSelect) {
      statusSelect.addEventListener("change", () => {
        currentFilter = statusSelect.value;
        applyFilterAndSort();
      });
    }

    // modal handlers
    const els = modalEls();
    els.close.addEventListener("click", closeModal);
    els.backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // reaction buttons in modal
    els.support.addEventListener("click", () => postReaction("support"));
    els.angry.addEventListener("click", () => postReaction("angry"));
    els.watch.addEventListener("click", () => postReaction("watch"));

    // comment submit
    els.commentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = els.commentInput.value.trim();
      if (!text) return;
      els.commentInput.value = "";
      await postComment(text);
    });

    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) profileBtn.addEventListener("click", () => alert("Profile coming soon!"));
  });
})();
