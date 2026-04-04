(function () {
  const config = window.ZERO_GRAVITY_SUPABASE_CONFIG || {};
  let client = null;
  let currentUser = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isConfigured() {
    return Boolean(
      config.url &&
        config.anonKey &&
        window.supabase &&
        typeof window.supabase.createClient === "function"
    );
  }

  function canUseBrowserOAuth() {
    return window.location.protocol === "http:" || window.location.protocol === "https:";
  }

  function getDisplayName(user = currentUser) {
    if (!user) {
      return "";
    }

    const metadata = user.user_metadata || {};

    return (
      metadata.full_name ||
      metadata.name ||
      metadata.user_name ||
      (user.email ? user.email.split("@")[0] : "") ||
      "Friend"
    );
  }

  function getInitials(user = currentUser) {
    const name = getDisplayName(user).trim();

    if (!name) {
      return "ZG";
    }

    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "");
    return initials.join("") || name.slice(0, 2).toUpperCase();
  }

  function getRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function announceAuthChange() {
    window.dispatchEvent(
      new CustomEvent("zero-gravity-auth-changed", {
        detail: {
          user: currentUser,
          displayName: getDisplayName(currentUser),
        },
      })
    );
  }

  async function upsertProfile(user) {
    if (!client || !user) {
      return;
    }

    const payload = {
      id: user.id,
      email: user.email || null,
      full_name: getDisplayName(user),
      avatar_url: user.user_metadata?.avatar_url || null,
      last_seen_at: new Date().toISOString(),
    };

    const { error } = await client
      .from(config.profilesTable || "zg_profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.warn("Zero Gravity profile sync skipped:", error.message);
    }
  }

  function renderAuthSlot(slot) {
    if (!slot) {
      return;
    }

    if (!currentUser) {
      slot.innerHTML = "";
      return;
    }

    const displayName = escapeHtml(getDisplayName(currentUser));
    const initials = escapeHtml(getInitials(currentUser));
    const email = currentUser.email
      ? `<span>${escapeHtml(currentUser.email)}</span>`
      : "<span>Signed in with Google</span>";

    slot.innerHTML = `
      <details class="auth-user-menu">
        <summary class="auth-user-trigger">
          <span class="auth-avatar">${initials}</span>
          <span class="auth-user-name">${displayName}</span>
        </summary>
        <div class="auth-user-panel">
          <div class="auth-user-meta">
            <strong>${displayName}</strong>
            ${email}
          </div>
          <button class="auth-signout" type="button" data-auth-action="signout">Sign out</button>
        </div>
      </details>
    `;
  }

  function renderAuthSummary(container) {
    if (!container) {
      return;
    }

    if (currentUser) {
      container.innerHTML = `
        <div class="auth-summary-card">
          <div class="auth-summary-main">
            <span class="auth-avatar auth-avatar-large">${escapeHtml(getInitials(currentUser))}</span>
            <div>
              <p class="auth-summary-title">Signed in as ${escapeHtml(getDisplayName(currentUser))}</p>
              <p class="auth-summary-copy">Your details are ready and linked to your profile.</p>
            </div>
          </div>
          <button class="auth-signout" type="button" data-auth-action="signout">Sign out</button>
        </div>
      `;
      return;
    }

    container.innerHTML = "";
  }

  function updateAuthGreeting() {
    const name = getDisplayName(currentUser);

    document.querySelectorAll("[data-auth-greeting]").forEach((node) => {
      if (name) {
        node.textContent = `Welcome back, ${name}.`;
        node.hidden = false;
      } else {
        node.hidden = true;
      }
    });

    document.querySelectorAll("[data-auth-user-name]").forEach((node) => {
      node.textContent = name;
    });
  }

  async function handleSignIn() {
    if (!client) {
      return;
    }

    if (!canUseBrowserOAuth()) {
      window.alert(
        "Open the site through http://localhost:8000 or your live domain before using Google sign-in."
      );
      return;
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      console.warn("Zero Gravity sign-in failed:", error.message);
    }
  }

  async function handleSignOut() {
    if (!client) {
      return;
    }

    const { error } = await client.auth.signOut();

    if (error) {
      console.warn("Zero Gravity sign-out failed:", error.message);
    }
  }

  function bindAuthButtons() {
    document.querySelectorAll("[data-auth-action='signin']").forEach((button) => {
      button.addEventListener("click", handleSignIn);
    });

    document.querySelectorAll("[data-auth-action='signout']").forEach((button) => {
      button.addEventListener("click", handleSignOut);
    });
  }

  function updateSignInButtons() {
    document.querySelectorAll(".nav-signin").forEach((button) => {
      button.style.display = currentUser ? "none" : "";
    });
    document.querySelectorAll(".mobile-nav-signin").forEach((button) => {
      button.style.display = currentUser ? "none" : "";
    });
  }

  function renderAuth() {
    renderAuthSlot(document.getElementById("nav-auth-desktop"));
    renderAuthSlot(document.getElementById("nav-auth-mobile"));
    document.querySelectorAll("[data-auth-summary]").forEach(renderAuthSummary);
    updateAuthGreeting();
    updateSignInButtons();
    bindAuthButtons();
  }

  async function initAuth() {
    renderAuth();

    if (!isConfigured()) {
      renderAuth();
      announceAuthChange();
      return;
    }

    client = window.supabase.createClient(config.url, config.anonKey);

    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error) {
      console.warn("Zero Gravity session check failed:", error.message);
    }

    currentUser = session?.user || null;

    if (currentUser) {
      await upsertProfile(currentUser);
    }

    renderAuth();
    announceAuthChange();

    client.auth.onAuthStateChange(async (_event, nextSession) => {
      currentUser = nextSession?.user || null;

      if (currentUser) {
        await upsertProfile(currentUser);
      }

      renderAuth();
      announceAuthChange();
    });
  }

  window.ZeroGravityAuth = {
    getClient() {
      return client;
    },
    getUser() {
      return currentUser;
    },
    getDisplayName,
    getInitials,
    isConfigured,
  };

  document.addEventListener("DOMContentLoaded", initAuth);
})();
