document.addEventListener("DOMContentLoaded", () => {
  setupNavSlider();
  setupBurger();
  setupProfileLogout();
  setupThemeToggle();
});

function setupNavSlider() {
  const links = Array.from(document.querySelectorAll(".nav a"));

  if (links.length === 0) return;

  const currentPage = getCurrentPageKey();

  // Find the active link based on current page
  let activeLink = links.find((l) => l.dataset.page === currentPage);

  // If not found, maybe default to dashboard or none?
  // Existing logic defaulted to links[0], let's keep that safely
  if (!activeLink && links.length > 0) activeLink = links[0];

  if (activeLink) {
    links.forEach((l) => l.classList.remove("active"));
    activeLink.classList.add("active");
  }

  const bubble = document.querySelector(".bubble");

  links.forEach((link) => {
    // Click handling
    link.addEventListener("click", (event) => {
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });

    // Hover handling for bubble animation
    if (bubble) {
      link.addEventListener("mouseenter", () => {
        bubble.classList.add("hover");
      });
      link.addEventListener("mouseleave", () => {
        bubble.classList.remove("hover");
      });
    }
  });
}

// Helper: Get page key from URL
function getCurrentPageKey() {
  const path = window.location.pathname;
  const file = path.split("/").pop() || "dashboard.html";
  return (file.replace(".html", "") || "dashboard").toLowerCase();
}

// Mobile burger + dropdown panel
function setupBurger() {
  const header = document.querySelector(".full-navbar");
  const toggle = document.querySelector(".nav-toggle");
  const panel =
    document.getElementById("nav-collapsible") ||
    document.querySelector(".nav-collapsible");
  const backdrop = document.querySelector(".nav-backdrop");

  if (!header || !toggle) return;

  // A11y
  toggle.setAttribute("aria-expanded", "false");
  if (panel && !toggle.getAttribute("aria-controls")) {
    if (!panel.id) panel.id = "nav-collapsible";
    toggle.setAttribute("aria-controls", panel.id);
  }

  const close = () => {
    header.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    if (backdrop) backdrop.classList.remove("is-open");
  };

  const open = () => {
    header.classList.add("is-open");
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    if (backdrop) backdrop.classList.add("is-open");
  };

  const isOpen = () => header.classList.contains("is-open");

  toggle.addEventListener("click", () => {
    isOpen() ? close() : open();
  });

  // Close on backdrop click
  if (backdrop) {
    backdrop.addEventListener("click", close);
  }

  // Close on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  // Close after clicking a nav link on mobile
  document.addEventListener("click", (e) => {
    const link = e.target.closest?.(".nav-pill-link");
    if (!link) return;
    if (window.matchMedia("(max-width: 768px)").matches) close();
  });

  // Close if user taps outside header/panel (when no backdrop exists)
  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (backdrop) return; // backdrop handles this
    const within =
      e.target.closest?.(".full-navbar") ||
      e.target.closest?.(".nav-collapsible");
    if (!within) close();
  });

  // Keep things sane when resizing to desktop
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 768px)").matches && isOpen()) close();
  });
}

// Profile / logout buttons
function setupProfileLogout() {
  const profileBtn = document.getElementById("profile-btn");
  const logoutBtn = document.getElementById("logout-btn");

  if (profileBtn) {
    // When the user taps on their avatar, send them to the profile page.
    // This page will display their stored details and allow editing.
    profileBtn.addEventListener("click", () => {
      window.location.href = "profile.html";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      alert("Sign Out Clicked");
      window.location.href = "index.html"; // adjust if your login page name differs
    });
  }
}

// Dark mode toggle
function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const root = document.documentElement;
  const stored = localStorage.getItem("theme");

  if (stored === "dark") {
    root.setAttribute("data-theme", "dark");
    btn.textContent = "☀️";
  } else {
    root.setAttribute("data-theme", "light");
    btn.textContent = "🌙";
  }

  btn.addEventListener("click", () => {
    const current =
      root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btn.textContent = next === "dark" ? "☀️" : "🌙";
  });
}
