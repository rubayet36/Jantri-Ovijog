
document.addEventListener("DOMContentLoaded", () => {
    initLoginMap();
});

async function initLoginMap() {
    // 1. Check Leaflet
    if (typeof L === "undefined") return;

    const mapEl = document.getElementById("loginMap");
    if (!mapEl) return;

    // 2. Init Map (Dhaka Center)
    const map = L.map(mapEl, {
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false
    }).setView([23.8103, 90.4125], 12);

    // 3. Tile Layer (Dark/Light aware ideally, but let's stick to a nice one)
    // Using CartoDB for a clean look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // 4. Fetch Data
    try {
        const res = await fetch('/api/complaints');
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();

        // 5. Markers
        const markers = L.featureGroup();

        data.forEach(item => {
            const lat = Number(item.latitude);
            const lng = Number(item.longitude);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Simple circle marker for visualization
                L.circleMarker([lat, lng], {
                    radius: 6,
                    fillColor: "#ef4444",
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.7
                })
                    .bindPopup(`<b>${escapeHtml(item.category || 'Incident')}</b><br>${new Date(item.created_at).toLocaleDateString()}`)
                    .addTo(markers);
            }
        });

        markers.addTo(map);

        // Fit bounds if we have markers
        if (data.length > 0) {
            try {
                map.fitBounds(markers.getBounds(), { padding: [50, 50] });
            } catch (e) { }
        }

    } catch (err) {
        console.error("Map data load error:", err);
    }
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
