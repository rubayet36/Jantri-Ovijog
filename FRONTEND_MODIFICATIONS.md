# Frontend integration with the Spring Boot + Supabase backend

Your original project shipped with pages that rendered dummy data inside JavaScript files. To convert this into a
fully dynamic app backed by Spring Boot and Supabase you need to replace those dummy arrays and hard‑coded
values with calls to the new backend API.

Below is a summary of the most important changes you must make. Each item includes example code. Use it as a
template and adjust to match your existing DOM structure and variable names.

## 1. Log in page (index.html / script.js)

Instead of simply redirecting to the dashboard, submit the credentials to the backend:

```javascript
// script.js
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const accountType = document.querySelector('input[name="accountType"]:checked').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (res.ok) {
    const data = await res.json();
    // store the JWT in localStorage for later requests
    localStorage.setItem('token', data.token);
    // store user object if needed
    localStorage.setItem('currentUser', JSON.stringify(data.user));
    // redirect based on role
    if (data.user.role === 'police' || accountType === 'police') {
      window.location.href = 'police-dashboard.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  } else {
    const err = await res.json();
    alert(err.error || 'Login failed');
  }
});
```

## 2. Sign‑up page (signup.html / signup.js)

Call the backend to create a new account:

```javascript
// signup.js
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const role = document.querySelector('input[name="accountType"]:checked').value; // user or police
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Account created! Please log in.');
    window.location.href = 'index.html';
  } else {
    alert(data.error || 'Sign up failed');
  }
});
```

## 3. Reports page (report.html / report.js)

Remove the dummy alerts and instead send the report data to the backend:

```javascript
// At the bottom of report.js after preparing the form values
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Build the payload from your form fields
  const payload = {
    category: document.getElementById('category').value,
    thana: document.getElementById('thana').value,
    route: document.getElementById('route').value,
    busName: document.getElementById('busName').value,
    busNumber: document.getElementById('busNumber').value,
    reporterType: anonymousCheckbox.checked ? 'Anonymous' : 'Registered User',
    description: document.getElementById('description').value,
    imageUrl: previewImg.src || null,
    createdAt: new Date().toISOString(),
    status: 'new'
  };
  const token = localStorage.getItem('token');
  const res = await fetch('/api/complaints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert('Complaint submitted successfully!');
    window.location.href = 'dashboard.html';
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to submit complaint');
  }
});
```

## 4. Emergency SOS (emergency.html / emergency.js)

After capturing the location and audio blob, send the data to the backend:

```javascript
async function sendEmergency(location, audioBlob) {
  const formData = new FormData();
  formData.append('latitude', location?.latitude || null);
  formData.append('longitude', location?.longitude || null);
  formData.append('accuracy', location?.accuracy || null);
  formData.append('audio', audioBlob); // see note below about audio storage
  const token = localStorage.getItem('token');
  const res = await fetch('/api/emergencies', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  if (!res.ok) {
    console.error('Failed to send emergency');
  }
}
```

*Note:* Browsers cannot send raw blobs directly via the Supabase REST API. You will
need to upload the audio file to Supabase Storage first (using Supabase's
signed URL endpoints) and then include the resulting URL in your
`/api/emergencies` request.

## 5. Police dashboard (police-dashboard.html / police-dashboard.js)

Replace the dummy arrays used to render complaints and emergencies with calls to
the backend. For example, in `police-complaints.js`:

```javascript
async function loadComplaints() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/complaints', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const complaints = await res.json();
  // render complaints list...
}
```

Similarly, in `police-emergency.js` call `/api/emergencies` to fetch open
emergencies.

## 6. Protecting API calls

The backend currently allows all requests. To secure your API you need to:

1. Validate the JWT on incoming requests. You can implement a
   `OncePerRequestFilter` that extracts the `Authorization` header, calls
   `JwtUtil.validateToken()` and sets a security context. For brevity, this
   sample leaves that as an exercise.
2. Set row level security policies in Supabase so that anonymous users can
   only insert data into the tables you intend to expose.

By following these guidelines and using the supplied Spring Boot backend
classes, you can replace the dummy data in your project with real persistence
and authentication powered by Supabase.