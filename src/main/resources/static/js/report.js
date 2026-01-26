// report.js (FULL FIX + MAP PICKER + AI AUTO-FILL)

// ✅ Supabase config
const SUPABASE_URL = "https://ojnmpmesvbmpzhncgodt.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbm1wbWVzdmJtcHpobmNnb2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjYxMjEsImV4cCI6MjA4MzQ0MjEyMX0.2yclbJTOsRGdtjgK_EVl6G9oh97Zu7cwSW-BGvNBs3M";

const STORAGE_BUCKET = "complaints";

document.addEventListener("DOMContentLoaded", () => {

  // ==========================
  // 🤖 1. CHECK FOR AI DRAFT (From Dashboard Chat)
  // ==========================
  const aiDraft = localStorage.getItem("AI_DRAFT_DATA");
  if (aiDraft) {
    try {
      const data = JSON.parse(aiDraft);
      console.log("🤖 AI Draft Found:", data);

      // Auto-fill Text Fields
      if (data.busName) document.getElementById("busName").value = data.busName;
      if (data.busNumber) document.getElementById("busNumber").value = data.busNumber;
      if (data.location) document.getElementById("landmark").value = data.location;
      if (data.description) document.getElementById("incidentDescription").value = data.description;

      // Auto-Select Thana (Partial Match)
      if (data.thana) {
        const thanaSelect = document.getElementById("thana");
        for (let i = 0; i < thanaSelect.options.length; i++) {
          if (thanaSelect.options[i].value.toLowerCase().includes(data.thana.toLowerCase())) {
            thanaSelect.selectedIndex = i;
            break;
          }
        }
      }

      // Auto-Select Incident Type
      if (data.incidentType) {
        const typeSelect = document.getElementById("incidentType");
        for (let i = 0; i < typeSelect.options.length; i++) {
          if (typeSelect.options[i].value.includes(data.incidentType) ||
            data.incidentType.includes(typeSelect.options[i].value)) {
            typeSelect.selectedIndex = i;
            break;
          }
        }
      }

      // Notify User
      alert("🤖 AI has pre-filled your report based on your chat!\nPlease review details and add a photo.");

      // Clear draft
      localStorage.removeItem("AI_DRAFT_DATA");

    } catch (e) {
      console.error("Error parsing AI draft", e);
    }
  }

  // ==========================
  // 2. STANDARD FORM LOGIC
  // ==========================
  const anonymousCheckbox = document.getElementById("anonymous-checkbox");
  const nameInput = document.getElementById("reporterName");
  const phoneInput = document.getElementById("reporterPhone");
  const emailInput = document.getElementById("reporterEmail");

  const reportImageInput = document.getElementById("reportImage");
  const previewImg = document.getElementById("previewImg");
  const previewPlaceholder = document.querySelector(".preview-placeholder");

  const getLocationBtn = document.getElementById("getLocationBtn");
  const locationStatus = document.getElementById("locationStatus");
  const locationCoords = document.getElementById("locationCoords");
  const locationMapLink = document.getElementById("locationMapLink");

  const form = document.getElementById("report-form");
  const postToFeedBtn = document.getElementById("postToFeedBtn");

  // Map picker elements
  const useMapBtn = document.getElementById("useMapBtn");
  const mapWrap = document.getElementById("mapWrap");
  const confirmMapBtn = document.getElementById("confirmMapBtn");
  const clearMapBtn = document.getElementById("clearMapBtn");

  // Shared location setter
  function setLocation(lat, lng, accuracyLabel = null, sourceLabel = "Selected") {
    form.dataset.lat = lat;
    form.dataset.lng = lng;
    form.dataset.accuracy = accuracyLabel ?? "";

    locationStatus.textContent = `${sourceLabel} location set.`;
    locationStatus.classList.remove("loading");
    locationCoords.textContent = `Lat: ${Number(lat).toFixed(5)}, Lng: ${Number(lng).toFixed(5)}${accuracyLabel ? ` (accuracy ~${accuracyLabel}m)` : ""}`;

    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    locationMapLink.href = url;
    locationMapLink.style.display = "inline-block";
  }

  // Anonymous toggle
  anonymousCheckbox.addEventListener("change", () => {
    const anon = anonymousCheckbox.checked;
    [nameInput, phoneInput, emailInput].forEach((input) => {
      input.disabled = anon;
      if (anon) input.value = "";
    });
  });

  // Image preview
  reportImageInput.addEventListener("change", () => {
    const file = reportImageInput.files[0];
    if (!file) {
      previewImg.style.display = "none";
      previewPlaceholder.style.display = "block";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.style.display = "block";
      previewPlaceholder.style.display = "none";
    };
    reader.readAsDataURL(file);
  });

  // GPS Location
  getLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = "Geolocation is not supported.";
      return;
    }
    locationStatus.textContent = "Requesting location…";
    locationStatus.classList.add("loading");
    locationCoords.textContent = "";
    locationMapLink.style.display = "none";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation(latitude, longitude, Math.round(accuracy), "GPS");

        if (map && window.L) {
          map.setView([latitude, longitude], 15);
          if (!marker) {
            marker = window.L.marker([latitude, longitude], { draggable: true }).addTo(map);
            marker.on("dragend", () => {
              pendingLatLng = marker.getLatLng();
            });
          } else {
            marker.setLatLng([latitude, longitude]);
          }
          pendingLatLng = { lat: latitude, lng: longitude };
        }
      },
      (err) => {
        locationStatus.classList.remove("loading");
        locationStatus.textContent = err.code === err.PERMISSION_DENIED ? "Location permission denied." : "Could not get location.";
      }
    );
  });

  // Map Picker (Leaflet)
  let map = null;
  let marker = null;
  let pendingLatLng = null;

  function initMap(lat = 23.8103, lng = 90.4125, zoom = 12) {
    if (!window.L) return; // Silent return if not loaded yet
    if (!map) {
      map = window.L.map("map", { scrollWheelZoom: true }).setView([lat, lng], zoom);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);

      map.on("click", (e) => {
        pendingLatLng = e.latlng;
        if (!marker) {
          marker = window.L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(map);
          marker.on("dragend", () => pendingLatLng = marker.getLatLng());
        } else {
          marker.setLatLng(e.latlng);
        }
        locationStatus.textContent = "Pin dropped. Click ✅ Use Selected Location.";
        locationMapLink.style.display = "none";
      });
      // Force resize to ensure tiles load in the now-visible container
      setTimeout(() => map.invalidateSize(), 200);
    } else {
      map.setView([lat, lng], zoom);
    }
  }

  // Always init map now
  // Check if we have pre-filled coords (from AI draft or otherwise)
  const initialLat = form.dataset.lat ? Number(form.dataset.lat) : 23.8103;
  const initialLng = form.dataset.lng ? Number(form.dataset.lng) : 90.4125;
  const initialZoom = form.dataset.lat ? 15 : 12;

  // waiting for Leaflet to be ready if loaded via CDN
  if (typeof window.L !== 'undefined') {
    initMap(initialLat, initialLng, initialZoom);
  } else {
    setTimeout(() => initMap(initialLat, initialLng, initialZoom), 1000);
  }

  if (confirmMapBtn) {
    confirmMapBtn.addEventListener("click", () => {
      if (!pendingLatLng) return alert("Click map to choose location.");
      setLocation(pendingLatLng.lat, pendingLatLng.lng, null, "Map");
    });
  }

  if (clearMapBtn) {
    clearMapBtn.addEventListener("click", () => {
      pendingLatLng = null;
      if (marker) { marker.remove(); marker = null; }
      delete form.dataset.lat;
      delete form.dataset.lng;
      delete form.dataset.accuracy;
      locationStatus.textContent = "Location cleared.";
      locationCoords.textContent = "";
      locationMapLink.style.display = "none";
    });
  }

  // Upload Helper
  async function uploadComplaintImage(file) {
    if (!file) return null;
    if (!window.supabase || !window.supabase.createClient) {
      alert("Supabase client not loaded.");
      return null;
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]/g, "");
    const path = `complaints/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;

    const { error: uploadError } = await client.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (uploadError) {
      alert("Image upload failed: " + uploadError.message);
      return null;
    }
    const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  // Submit Logic
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const report = collectReportData(form);
    if (!validateReport(report)) return;

    const file = reportImageInput.files[0] || null;
    const imageUrl = await uploadComplaintImage(file);
    const token = localStorage.getItem("token");

    const payload = {
      category: report.incidentType,
      status: "new",
      thana: report.thana,
      route: `${report.routeFrom} → ${report.routeTo}`,
      busName: report.busName,
      busNumber: report.busNumber,
      companyName: report.companyName,
      reporterType: report.anonymous ? "Anonymous" : "Registered User",
      reporterName: report.reporterName,
      reporterEmail: report.reporterEmail,
      reporterPhone: report.reporterPhone,
      description: report.description,
      landmark: report.landmark,
      seatInfo: report.seatInfo,
      latitude: report.latitude ? Number(report.latitude) : null,
      longitude: report.longitude ? Number(report.longitude) : null,
      accuracy: report.accuracy ? Number(report.accuracy) : null,
      imageUrl: imageUrl,
      createdAt: report.createdAt,
    };

    try {
      const resp = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok) {
        alert(data.error || "Failed to submit.");
        return;
      }

      alert("Complaint submitted successfully.");
      form.reset();
      previewImg.style.display = "none";
      previewPlaceholder.style.display = "block";
      locationCoords.textContent = "";
      locationMapLink.style.display = "none";
      delete form.dataset.lat;
      delete form.dataset.lng;
      delete form.dataset.accuracy;
      if (marker) { marker.remove(); marker = null; }
      pendingLatLng = null;
      if (mapWrap) mapWrap.style.display = "none";
    } catch (err) {
      console.error(err);
      alert("Error submitting complaint.");
    }
  });

  // Post to Feed (Local)
  postToFeedBtn.addEventListener("click", () => {
    const report = collectReportData(form);
    if (!validateReport(report)) return;
    saveToLocalFeed(report);
    alert("Saved to local Community Feed.");
  });
});

function collectReportData(form) {
  const anon = document.getElementById("anonymous-checkbox").checked;
  return {
    anonymous: anon,
    reporterName: anon ? "Anonymous" : document.getElementById("reporterName").value.trim(),
    reporterPhone: anon ? "" : document.getElementById("reporterPhone").value.trim(),
    reporterEmail: anon ? "" : document.getElementById("reporterEmail").value.trim(),
    incidentType: document.getElementById("incidentType").value,
    incidentDateTime: document.getElementById("incidentDateTime").value,
    busName: document.getElementById("busName").value.trim(),
    busNumber: document.getElementById("busNumber").value.trim(),
    companyName: document.getElementById("companyName").value.trim(),
    seatInfo: document.getElementById("seatInfo").value.trim(),
    routeFrom: document.getElementById("routeFrom").value.trim(),
    routeTo: document.getElementById("routeTo").value.trim(),
    thana: document.getElementById("thana").value,
    landmark: document.getElementById("landmark").value.trim(),
    description: document.getElementById("incidentDescription").value.trim(),
    latitude: form.dataset.lat || null,
    longitude: form.dataset.lng || null,
    accuracy: form.dataset.accuracy || null,
    createdAt: new Date().toISOString(),
  };
}

function validateReport(report) {
  if (!report.incidentType) return alert("Select type of issue."), false;
  if (!report.incidentDateTime) return alert("Enter date & time."), false;
  if (!report.thana) return alert("Select a Thana."), false;
  if (!report.description) return alert("Describe what happened."), false;
  return true;
}

function saveToLocalFeed(report) {
  const key = "communityReports";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.unshift({ id: Date.now(), ...report, status: "pending" });
  localStorage.setItem(key, JSON.stringify(existing));
}