document.addEventListener("DOMContentLoaded", () => {
  setupNavSlider();
  setupBurger();
  setupProfileLogout();
  setupThemeToggle();
});

function setupNavSlider() {
  const nav = document.getElementById("nav-pill");
  const slider = document.getElementById("nav-slider");
  const links = Array.from(document.querySelectorAll(".nav-pill-link"));

  // slider is optional (police dashboard doesn't have it)
  if (!nav || !slider || links.length === 0) return;

  const currentPage = getCurrentPageKey();
  const activeLink = links.find((l) => l.dataset.page === currentPage) || links[0];

  links.forEach((l) => l.classList.remove("active"));
  activeLink.classList.add("active");
  moveSliderTo(nav, slider, activeLink);

  const onResize = () => {
    // slider is hidden on mobile; no need to compute positions there
    if (window.matchMedia("(max-width: 768px)").matches) return;
    const currentActive = links.find((l) => l.classList.contains("active")) || links[0];
    moveSliderTo(nav, slider, currentActive);
  };

  window.addEventListener("resize", onResize);

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      // allow normal navigation, but animate slider first on desktop
      const href = link.getAttribute("href");
      if (!href) return;

      if (window.matchMedia("(max-width: 768px)").matches) return; // mobile: instant

      event.preventDefault();
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      moveSliderTo(nav, slider, link);
      setTimeout(() => {
        window.location.href = href;
      }, 180);
    });
  });
}

function moveSliderTo(nav, slider, element) {
  const navRect = nav.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const left = elRect.left - navRect.left;
  const width = elRect.width;
  slider.style.transform = `translateX(${left}px)`;
  slider.style.width = `${width}px`;
}

function getCurrentPageKey() {
  const path = window.location.pathname;
  const file = path.split("/").pop() || "dashboard.html";
  return (file.replace(".html", "") || "dashboard").toLowerCase();
}

// Mobile burger + dropdown panel
function setupBurger() {
  const header = document.querySelector(".full-navbar");
  const toggle = document.querySelector(".nav-toggle");
  const panel = document.getElementById("nav-collapsible") || document.querySelector(".nav-collapsible");
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
    const within = e.target.closest?.(".full-navbar") || e.target.closest?.(".nav-collapsible");
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
    const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    btn.textContent = next === "dark" ? "☀️" : "🌙";
  });
}
