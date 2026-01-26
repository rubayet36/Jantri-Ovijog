// profile.js – Load and save user profile data from localStorage

document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('profileName');
  const emailInput = document.getElementById('profileEmail');
  const phoneInput = document.getElementById('profilePhone');
  const langSelect = document.getElementById('profileLanguage');
  const themeSelect = document.getElementById('profileTheme');
  const form = document.getElementById('profileForm');

  // Load profile from localStorage or set defaults
  const stored = localStorage.getItem('userProfile');
  let profile = stored ? JSON.parse(stored) : {
    name: '',
    email: '',
    phone: '',
    language: 'en',
    theme: 'light'
  };

  // Populate form inputs
  nameInput.value = profile.name;
  emailInput.value = profile.email;
  phoneInput.value = profile.phone;
  langSelect.value = profile.language;
  themeSelect.value = profile.theme;

  // Apply theme immediately
  setTheme(profile.theme);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Update profile object
    profile = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      phone: phoneInput.value.trim(),
      language: langSelect.value,
      theme: themeSelect.value
    };
    // Persist to localStorage
    localStorage.setItem('userProfile', JSON.stringify(profile));
    // Apply theme
    setTheme(profile.theme);
    // Provide user feedback
    alert('Profile saved successfully!');
  });

  // Helper to toggle dark/light theme on html element
  function setTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
  }
});