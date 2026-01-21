// emergency.js (updated)

let mediaRecorder = null;
let audioChunks = [];
let countdownInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  const sosButton = document.getElementById("sosButton");
  const locationStatus = document.getElementById("locationStatus");
  const recordingStatus = document.getElementById("recordingStatus");
  const countdownStatus = document.getElementById("countdownStatus");
  const sendingStatus = document.getElementById("sendingStatus");
  const locationCoords = document.getElementById("locationCoords");
  const locationMapLink = document.getElementById("locationMapLink");
  const audioInfo = document.getElementById("audioInfo");
  const audioPreview = document.getElementById("audioPreview");

  let currentLocation = null;

  // basic profile/logout placeholders
  const profileBtn = document.getElementById("profile-btn");
  const logoutBtn = document.getElementById("logout-btn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () =>
      alert("Profile panel coming later.")
    );
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () =>
      alert("Sign out – connect to auth later.")
    );
  }

  sosButton.addEventListener("click", async () => {
    // prevent starting again while active
    if (sosButton.classList.contains("active")) return;

    sosButton.classList.add("active");
    sendingStatus.textContent = "Waiting to send…";
    recordingStatus.textContent = "Preparing...";
    countdownStatus.textContent = "--";
    audioInfo.textContent = "No audio recorded yet.";
    if (audioPreview) {
      audioPreview.removeAttribute("src");
      audioPreview.style.display = "none";
    }
    if (locationMapLink) {
      locationMapLink.style.display = "none";
      locationMapLink.removeAttribute("href");
    }
    if (locationCoords) locationCoords.textContent = "";

    // 1) Get location (continue even if denied)
    locationStatus.textContent = "Requesting location…";
    currentLocation = await getLocationSafe(
      locationStatus,
      locationCoords,
      locationMapLink
    );

    // 1.5) Capture Image (Parallel or Sequential - let's do sequential for simplicity)
    const imageInfo = document.getElementById("imageInfo");
    const imagePreview = document.getElementById("imagePreview");
    if (imageInfo) imageInfo.textContent = "Capturing image...";

    let imageBlob = null;
    try {
      imageBlob = await captureImage();
      if (imageBlob && imagePreview) {
        const imgUrl = URL.createObjectURL(imageBlob);
        imagePreview.src = imgUrl;
        imagePreview.style.display = "block";
        if (imageInfo) imageInfo.textContent = "Image captured.";
      } else {
        if (imageInfo) imageInfo.textContent = "Image capture failed or denied.";
      }
    } catch (e) {
      console.error("Image capture error", e);
    }

    // 2) Start 10s recording
    const stream = await getAudioStreamSafe(recordingStatus);

    if (!stream) {
      // fail gracefully (no microphone)
      sosButton.classList.remove("active");
      countdownStatus.textContent = "--";
      sendingStatus.textContent = "Failed (no microphone).";
      return;
    }

    recordingStatus.textContent = "Recording…";
    startRecording(stream, 10, countdownStatus)
      .then((audioBlob) => {
        recordingStatus.textContent = "Finished.";
        sosButton.classList.remove("active");

        // Update audio preview
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPreview.src = audioUrl;
        audioPreview.style.display = "block";
        audioInfo.textContent = "10 second audio clip captured.";

        // 3) Send to backend
        sendingStatus.textContent = "Sending...";
        sendEmergencyToBackend(currentLocation, audioBlob, imageBlob)
          .then(() => {
            sendingStatus.textContent = "Emergency alert sent successfully.";
          })
          .catch((err) => {
            console.error(err);
            sendingStatus.textContent = "Failed to send emergency alert.";
          });
      })
      .catch((err) => {
        console.error(err);
        recordingStatus.textContent = "Error during recording.";
        sosButton.classList.remove("active");
        countdownStatus.textContent = "--";
        sendingStatus.textContent = "Failed.";
      });
  });
});

// ===============================
// LOCATION HELPERS
// ===============================
function getLocationSafe(statusEl, coordsEl, mapLinkEl) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation not supported.";
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        statusEl.textContent = "Location captured.";

        if (coordsEl) {
          coordsEl.textContent = `Lat: ${latitude.toFixed(
            5
          )}, Lng: ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`;
        }

        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        if (mapLinkEl) {
          mapLinkEl.href = url;
          mapLinkEl.style.display = "inline-block";
        }

        resolve({ latitude, longitude, accuracy });
      },
      (err) => {
        console.warn("Location error:", err);

        // ✅ code 1 = PERMISSION_DENIED
        if (err && err.code === err.PERMISSION_DENIED) {
          statusEl.textContent =
            "Location permission denied. SOS will still send audio only.";
        } else {
          statusEl.textContent = "Could not get location.";
        }

        resolve(null); // still continue without location
      },
      // Optional: slightly more reliable defaults
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ===============================
// AUDIO HELPERS
// ===============================
async function getAudioStreamSafe(recordingStatus) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    recordingStatus.textContent = "Audio not supported on this browser.";
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return stream;
  } catch (err) {
    console.warn("getUserMedia error:", err);

    // ✅ Better error messages
    if (err && err.name === "NotFoundError") {
      recordingStatus.textContent =
        "No microphone found. Please connect/enable a mic.";
    } else if (err && err.name === "NotAllowedError") {
      recordingStatus.textContent = "Microphone permission denied.";
    } else if (err && err.name === "NotReadableError") {
      recordingStatus.textContent =
        "Microphone is busy (being used by another app).";
    } else {
      recordingStatus.textContent = "Microphone error occurred.";
    }

    return null;
  }
}

function startRecording(stream, seconds, countdownEl) {
  return new Promise((resolve, reject) => {
    audioChunks = [];
    let remaining = seconds;
    if (countdownEl) countdownEl.textContent = `${remaining}s`;

    // Countdown
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.textContent = remaining > 0 ? `${remaining}s` : "0s";
      if (remaining <= 0) clearInterval(countdownInterval);
    }, 1000);

    try {
      mediaRecorder = new MediaRecorder(stream);
    } catch (err) {
      if (countdownInterval) clearInterval(countdownInterval);
      // stop tracks
      stream.getTracks().forEach((t) => t.stop());
      reject(err);
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });
      // stop tracks
      stream.getTracks().forEach((t) => t.stop());
      resolve(blob);
    };

    mediaRecorder.onerror = (e) => {
      if (countdownInterval) clearInterval(countdownInterval);
      stream.getTracks().forEach((t) => t.stop());
      reject(e.error || e);
    };

    mediaRecorder.start();

    // stop after `seconds`
    setTimeout(() => {
      try {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      } catch (e) {
        // if stop fails, still cleanup
        stream.getTracks().forEach((t) => t.stop());
        reject(e);
      }
    }, seconds * 1000);
  });
}

// ===============================
// Convert blob to Base64 string
// ===============================
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = String(result).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

// ===============================
// IMAGE HELPERS
// ===============================
async function captureImage() {
  const video = document.getElementById("hiddenVideo");
  const canvas = document.getElementById("hiddenCanvas");

  // Request camera
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    // Wait for video to be ready
    await new Promise(resolve => video.onloadedmetadata = resolve);
    video.play();

    // Wait a brief moment for auto-exposure
    await new Promise(r => setTimeout(r, 500));

    // Draw to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop stream
    stream.getTracks().forEach(t => t.stop());

    // Convert to Blob
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.7));
  } catch (err) {
    console.warn("Camera capture failed:", err);
    if (stream) stream.getTracks().forEach(t => t.stop());
    return null;
  }
}

// ===============================
// Send emergency report to backend
// ===============================
function sendEmergencyToBackend(location, audioBlob, imageBlob) {
  return new Promise(async (resolve, reject) => {
    try {
      const token = localStorage.getItem("token");

      // Convert audio to base64 string (optional)
      const audioBase64 = await blobToBase64(audioBlob);

      let imageBase64 = null;
      if (imageBlob) {
        imageBase64 = await blobToBase64(imageBlob);
      }

      // Derive current user name
      let currentUser = null;
      try {
        currentUser = JSON.parse(localStorage.getItem("currentUser"));
      } catch (_) { }

      const payload = {
        latitude: location ? location.latitude : null,
        longitude: location ? location.longitude : null,
        accuracy: location ? location.accuracy : null,
        audio: audioBase64,
        image: imageBase64,
        createdAt: new Date().toISOString(),
        status: "new",
        passenger: currentUser && currentUser.name ? currentUser.name : "Unknown",
        type: "SOS",
        location: location
          ? `Lat ${location.latitude.toFixed(4)}, Lng ${location.longitude.toFixed(4)}`
          : "Unknown location",
        description: "Emergency SOS alert",
      };

      const resp = await fetch("/api/emergencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        return reject(data.error || data.message || "Failed to send emergency report.");
      }

      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
}
