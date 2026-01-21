
(function () {
    // 1. Check Token
    const token = localStorage.getItem("token");

    // 2. Normalize Path
    const path = window.location.pathname;

    // 3. Define Public Pages (pages that don't REQUIRE login to view)
    // index.html is login. signup.html is signup. emergency.html is allowed.
    const publicPages = [
        "/",
        "/index.html",
        "/login.html",
        "/signup.html",
        "/emergency.html",
        "/css/",
        "/js/",
        "/images/"
    ];

    // Helper to check if current page is public
    const isPublic = publicPages.some(p => path.endsWith(p) || path === p);

    // 4. Redirect Logic
    if (!token && !isPublic) {
        console.warn("AuthGuard: No token found. Redirecting to login.");
        window.location.replace("index.html");
        return; // Stop execution
    }

    // 5. Emergency Page Special Handling
    // "only emergency can be acess without log in but when going without log in dot allow it to go to other page"
    if (path.endsWith("emergency.html") && !token) {
        // Run this when DOM is ready or immediately if possible
        const restrictNav = () => {
            // Hide the main navbar
            const navbar = document.querySelector(".full-navbar");
            if (navbar) {
                navbar.style.display = "none";
            }

            // Or if we want to keep a "Log In" button, we could conditionally render it.
            // But requirement says "dont allow it to go to other page". Hiding nav is safest.

            // Add a simple "Back to Login" button just in case they want to leave?
            // "dont allow it to go to other page" might mean "don't allow access to PROTECTED pages".
            // Adding a login link is probably UX friendly and doesn't violate "can't go to protected pages".
            let loginBtn = document.getElementById("temp-login-btn");
            if (!loginBtn) {
                loginBtn = document.createElement("a");
                loginBtn.id = "temp-login-btn";
                loginBtn.href = "index.html";
                loginBtn.textContent = "Log In";
                loginBtn.style.cssText = "position: absolute; top: 20px; right: 20px; z-index: 9999; background: #fff; padding: 8px 16px; border-radius: 8px; text-decoration: none; color: #000; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);";
                document.body.appendChild(loginBtn);
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", restrictNav);
        } else {
            restrictNav();
        }
    }

})();
