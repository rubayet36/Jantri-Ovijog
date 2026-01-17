// report.js (FULL FIX + MAP PICKER)

// ✅ Supabase config
const SUPABASE_URL = "https://ojnmpmesvbmpzhncgodt.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbm1wbWVzdmJtcHpobmNnb2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4NjYxMjEsImV4cCI6MjA4MzQ0MjEyMX0.2yclbJTOsRGdtjgK_EVl6G9oh97Zu7cwSW-BGvNBs3M";

// ✅ Storage bucket name (must exist in Supabase Storage)
const STORAGE_BUCKET = "complaints";

document.addEventListener("DOMContentLoaded", () => {
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

  // ✅ Map picker elements (must exist in report.html)
  const useMapBtn = document.getElementById("useMapBtn");
  const mapWrap = document.getElementById("mapWrap");
  const confirmMapBtn = document.getElementById("confirmMapBtn");
  const clearMapBtn = document.getElementById("clearMapBtn");

  // PROFILE & LOGOUT (placeholder)
  const profileBtn = document.getElementById("profile-btn");
  const logoutBtn = document.getElementById("logout-btn");
  if (profileBtn) profileBtn.addEventListener("click", () => alert("Profile panel coming later!"));
  if (logoutBtn) logoutBtn.addEventListener("click", () => alert("Sign out – replace with real auth later."));

  // ==========================
  // Shared location setter
  // ==========================
  function setLocation(lat, lng, accuracyLabel = null, sourceLabel = "Selected") {
    // store in dataset to send with form
    form.dataset.lat = lat;
    form.dataset.lng = lng;
    form.dataset.accuracy = accuracyLabel ?? "";

    locationStatus.textContent = `${sourceLabel} location set.`;
    locationStatus.classList.remove("loading");

    locationCoords.textContent = `Lat: ${Number(lat).toFixed(5)}, Lng: ${Number(lng).toFixed(5)}${
      accuracyLabel ? ` (accuracy ~${accuracyLabel}m)` : ""
    }`;

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

  // Image preview (UI only)
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

  // ==========================
  // Current GPS location button
  // ==========================
  getLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = "Geolocation is not supported in this browser.";
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

        // If map is open, center it
        if (map && window.L) {
          map.setView([latitude, longitude], 15);
          if (!marker) {
            marker = window.L.marker([latitude, longitude], { draggable: true }).addTo(map);
            marker.on("dragend", () => {
              const p = marker.getLatLng();
              pendingLatLng = p;
            });
          } else {
            marker.setLatLng([latitude, longitude]);
          }
          pendingLatLng = { lat: latitude, lng: longitude };
        }
      },
      (err) => {
        locationStatus.classList.remove("loading");
        if (err.code === err.PERMISSION_DENIED) {
          locationStatus.textContent = "Location permission denied. You can still submit the report.";
        } else {
          locationStatus.textContent = "Could not get location. Try again.";
        }
      }
    );
  });

  // ==========================
  // MAP PICKER (Leaflet)
  // ==========================
  // NOTE: report.html must include Leaflet:
  // <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  // <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  let map = null;
  let marker = null;
  let pendingLatLng = null;

  function initMap(lat = 23.8103, lng = 90.4125, zoom = 12) {
    if (!window.L) {
      alert("Map library not loaded. Add Leaflet CSS/JS in report.html.");
      return;
    }

    if (!map) {
      map = window.L.map("map", { scrollWheelZoom: true }).setView([lat, lng], zoom);

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", (e) => {
        pendingLatLng = e.latlng;

        if (!marker) {
          marker = window.L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLatLng();
            pendingLatLng = p;
          });
        } else {
          marker.setLatLng(e.latlng);
        }

        locationStatus.textContent = "Pin dropped. Click ✅ Use Selected Location to confirm.";
        locationCoords.textContent = `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
        locationMapLink.style.display = "none";
      });

      // Fix sizing when map is shown after being hidden
      setTimeout(() => map.invalidateSize(), 200);
    } else {
      map.setView([lat, lng], zoom);
      setTimeout(() => map.invalidateSize(), 100);
    }
  }

  // Toggle map UI
  if (useMapBtn && mapWrap) {
    useMapBtn.addEventListener("click", () => {
      const isHidden = mapWrap.style.display === "none" || mapWrap.style.display === "";
      mapWrap.style.display = isHidden ? "block" : "none";

      // Center map on existing selected location if available, else Dhaka
      const lat = form.dataset.lat ? Number(form.dataset.lat) : 23.8103;
      const lng = form.dataset.lng ? Number(form.dataset.lng) : 90.4125;
      initMap(lat, lng, form.dataset.lat ? 15 : 12);

      // If there is already a selected location, place marker there
      if (form.dataset.lat && form.dataset.lng && window.L && map) {
        const existing = { lat: Number(form.dataset.lat), lng: Number(form.dataset.lng) };
        pendingLatLng = existing;

        if (!marker) {
          marker = window.L.marker([existing.lat, existing.lng], { draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLatLng();
            pendingLatLng = p;
          });
        } else {
          marker.setLatLng([existing.lat, existing.lng]);
        }
      }
    });
  }

  // Confirm selection
  if (confirmMapBtn) {
    confirmMapBtn.addEventListener("click", () => {
      if (!pendingLatLng) {
        alert("Please click on the map to choose a location first.");
        return;
      }
      setLocation(pendingLatLng.lat, pendingLatLng.lng, null, "Map");
    });
  }

  // Clear selection
  if (clearMapBtn) {
    clearMapBtn.addEventListener("click", () => {
      pendingLatLng = null;
      if (marker) {
        marker.remove();
        marker = null;
      }
      delete form.dataset.lat;
      delete form.dataset.lng;
      delete form.dataset.accuracy;

      locationStatus.textContent = "Location cleared.";
      locationCoords.textContent = "";
      locationMapLink.style.display = "none";
    });
  }

  // ✅ Upload helper
  async function uploadComplaintImage(file) {
    if (!file) return null;

    // Supabase JS must be loaded in report.html:
    // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    if (!window.supabase || !window.supabase.createClient) {
      alert("Supabase client not loaded. Add supabase-js script in report.html.");
      return null;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]/g, "");
    const path = `complaints/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;

    const { error: uploadError } = await client.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      alert("Image upload failed: " + uploadError.message);
      return null;
    }

    const { data: publicData } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    const publicUrl = publicData?.publicUrl || null;

    if (!publicUrl) {
      alert("Upload succeeded, but could not generate public URL. Make bucket public.");
    }

    return publicUrl;
  }

  // Main submit (to authorities only)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const report = collectReportData(form);
    if (!validateReport(report)) return;

    // ✅ Upload image first (if any)
    const file = reportImageInput.files[0] || null;
    const imageUrl = await uploadComplaintImage(file);

    // Prepare payload for backend
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

      // ✅ geo
      latitude: report.latitude ? Number(report.latitude) : null,
      longitude: report.longitude ? Number(report.longitude) : null,
      accuracy: report.accuracy ? Number(report.accuracy) : null,

      // ✅ image URL stored in DB
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
        console.error("Complaint submit error:", data);
        alert(data.error || "Failed to submit complaint. Please try again.");
        return;
      }

      alert("Your complaint has been submitted successfully.");

      form.reset();
      previewImg.style.display = "none";
      previewPlaceholder.style.display = "block";
      locationCoords.textContent = "";
      locationMapLink.style.display = "none";

      // reset stored location
      delete form.dataset.lat;
      delete form.dataset.lng;
      delete form.dataset.accuracy;

      // reset map state (optional)
      if (marker) {
        marker.remove();
        marker = null;
      }
      pendingLatLng = null;
      if (mapWrap) mapWrap.style.display = "none";
    } catch (err) {
      console.error(err);
      alert("An error occurred while submitting your complaint.");
    }
  });

  // Submit & share to community feed (local only)
  postToFeedBtn.addEventListener("click", () => {
    const report = collectReportData(form);
    if (!validateReport(report)) return;
    saveToLocalFeed(report);
    alert("Report saved and added to local Community Feed.\nOpen the Feed page to see it.");
  });
});

// Collect all form data into one object
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

// Minimal validation
function validateReport(report) {
  if (!report.incidentType) return alert("Please select the type of issue."), false;
  if (!report.incidentDateTime) return alert("Please enter the date and time of the incident."), false;
  if (!report.thana) return alert("Please select a Thana."), false;
  if (!report.description) return alert("Please describe what happened."), false;
  return true;
}

// Save to localStorage for feed page to read
function saveToLocalFeed(report) {
  const key = "communityReports";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.unshift({ id: Date.now(), ...report, status: "pending" });
  localStorage.setItem(key, JSON.stringify(existing));
}
