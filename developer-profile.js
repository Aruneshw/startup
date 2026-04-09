/**
 * developer-profile.js — Loads full developer profile from ?uid= param
 */
document.addEventListener("DOMContentLoaded", () => {
  const headerEl = document.getElementById("profile-header");
  const statsEl = document.getElementById("profile-stats");
  const badgesEl = document.getElementById("profile-badges");
  const subsEl = document.getElementById("profile-submissions");
  const loadingEl = document.getElementById("profile-loading");

  const uid = new URLSearchParams(window.location.search).get("uid");
  if (!uid) {
    headerEl.innerHTML = `<p style="color:#ff3366;text-align:center;">No developer ID specified.</p>`;
    return;
  }

  function getClient() {
    return window.ZeroGravityAuth?.getClient?.() || null;
  }

  function getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  }

  function renderHeader(dev) {
    const name = dev.public_display_name || dev.full_name || "Developer";
    const initials = getInitials(name);
    const role = dev.public_role || dev.area_of_interest || "Member";
    const verified = dev.is_verified ? `<span class="zg-verified-badge" title="Verified">✓ Verified</span>` : "";
    const preferred = dev.is_client_preferred ? `<span class="zg-preferred-badge" title="Client Preferred">⭐ Client Preferred</span>` : "";

    headerEl.innerHTML = `
      <div class="zg-profile-hero-inner">
        <div class="zg-profile-avatar-large">${initials}</div>
        <div class="zg-profile-info">
          <h1 class="section-heading" style="font-size:2rem;margin-bottom:0.25rem;">${name}</h1>
          <p style="color:var(--accent-cyan);font-family:'JetBrains Mono',monospace;font-size:0.85rem;margin:0;">${role}</p>
          <div class="zg-profile-badges-inline" style="margin-top:0.5rem;">
            ${verified} ${preferred}
          </div>
        </div>
        <div class="zg-profile-rep-big">
          <span class="stat-number" style="font-size:2.4rem;">${dev.reputation_score || 0}</span>
          <span class="stat-label">Reputation</span>
        </div>
      </div>
    `;
  }

  function renderStats(dev) {
    const successPct = ((dev.success_rate || 0) * 100).toFixed(0);
    const avgTime = dev.avg_response_time ? dev.avg_response_time.toFixed(1) + "h" : "—";

    statsEl.style.display = "grid";
    statsEl.innerHTML = `
      <div class="zg-stat-card">
        <span class="zg-stat-icon">🧩</span>
        <span class="stat-number">${dev.problems_solved || 0}</span>
        <span class="stat-label">Solved</span>
      </div>
      <div class="zg-stat-card">
        <span class="zg-stat-icon">📊</span>
        <span class="stat-number">${successPct}%</span>
        <span class="stat-label">Success Rate</span>
      </div>
      <div class="zg-stat-card">
        <span class="zg-stat-icon">⭐</span>
        <span class="stat-number">${(dev.avg_rating || 0).toFixed(1)}</span>
        <span class="stat-label">Avg Rating</span>
      </div>
      <div class="zg-stat-card">
        <span class="zg-stat-icon">⚡</span>
        <span class="stat-number">${avgTime}</span>
        <span class="stat-label">Avg Response</span>
      </div>
      <div class="zg-stat-card">
        <span class="zg-stat-icon">🛡️</span>
        <div class="zg-trust-bar" style="width:80px;">
          <div class="zg-trust-fill" style="width:${Math.min(dev.trust_score || 0, 100)}%"></div>
        </div>
        <span class="stat-label">Trust ${dev.trust_score || 0}/100</span>
      </div>
      <div class="zg-stat-card">
        <span class="zg-stat-icon">📤</span>
        <span class="stat-number">${dev.total_submissions || 0}</span>
        <span class="stat-label">Total Submissions</span>
      </div>
    `;
  }

  async function renderBadges(client) {
    const { data: userBadges } = await client
      .from("zg_user_badges")
      .select("earned_at, badge:badge_id(name, icon, category, level)")
      .eq("user_id", uid);

    const { data: progress } = await client
      .from("zg_badge_progress")
      .select("badge_id, progress, badge:badge_id(name, icon)")
      .eq("user_id", uid);

    if ((!userBadges || userBadges.length === 0) && (!progress || progress.length === 0)) return;

    let html = "";

    // Earned badges
    if (userBadges && userBadges.length > 0) {
      html += `<div class="zg-badges-earned">`;
      userBadges.forEach(ub => {
        if (!ub.badge) return;
        const levelClass = `badge-level-${ub.badge.level || 1}`;
        html += `
          <div class="zg-badge-card ${levelClass}">
            <span class="zg-badge-icon">${ub.badge.icon || "🏅"}</span>
            <span class="zg-badge-name">${ub.badge.name}</span>
            <span class="zg-badge-date">${new Date(ub.earned_at).toLocaleDateString()}</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    // Progress on unearned
    const earnedIds = (userBadges || []).map(ub => ub.badge?.name).filter(Boolean);
    const inProgress = (progress || []).filter(p => p.badge && !earnedIds.includes(p.badge.name) && p.progress > 0 && p.progress < 100);

    if (inProgress.length > 0) {
      html += `<h3 style="font-size:1rem;margin-top:1.5rem;color:var(--text-muted);">In Progress</h3><div class="zg-badges-progress">`;
      inProgress.forEach(p => {
        html += `
          <div class="zg-badge-progress-item">
            <span>${p.badge.icon || "🏅"} ${p.badge.name}</span>
            <div class="zg-progress-bar"><div class="zg-progress-fill" style="width:${p.progress}%"></div></div>
            <span class="zg-progress-pct">${p.progress}%</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (html) badgesEl.innerHTML = html;
  }

  async function renderSubmissions(client) {
    const { data: subs } = await client
      .from("zg_submissions")
      .select("id, problem_id, solution_text, repo_url, submitted_at, status, final_score, client_rating")
      .eq("developer_id", uid)
      .order("submitted_at", { ascending: false })
      .limit(20);

    if (!subs || subs.length === 0) return;

    let html = `<div class="zg-submissions-list">`;
    subs.forEach(s => {
      const statusClass = s.status === "accepted" ? "status-accepted" : s.status === "rejected" ? "status-rejected" : "status-pending";
      const date = new Date(s.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const ratingHtml = s.client_rating ? `<span class="zg-sub-rating">${"⭐".repeat(s.client_rating)}</span>` : "";

      html += `
        <div class="zg-submission-row">
          <div class="zg-sub-left">
            <span class="zg-sub-status ${statusClass}">${s.status}</span>
            <span class="zg-sub-desc">${s.solution_text.substring(0, 100)}${s.solution_text.length > 100 ? "…" : ""}</span>
          </div>
          <div class="zg-sub-right">
            ${ratingHtml}
            <span class="zg-sub-score">Score: <strong>${(s.final_score || 0).toFixed(1)}</strong></span>
            <span class="zg-sub-date">${date}</span>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    subsEl.innerHTML = html;
  }

  async function loadProfile() {
    try {
      const client = getClient();
      if (!client) throw new Error("Supabase not initialized");

      const { data: devs, error } = await client
        .from("zg_member_interest")
        .select("*")
        .eq("auth_user_id", uid)
        .limit(1);

      if (error) throw error;
      if (!devs || devs.length === 0) throw new Error("Developer not found");

      const dev = devs[0];
      loadingEl.style.display = "none";

      renderHeader(dev);
      renderStats(dev);
      await renderBadges(client);
      await renderSubmissions(client);

      // Update page title
      document.title = `${dev.public_display_name || dev.full_name || "Developer"} | Team Zero Gravity`;
    } catch (err) {
      console.error("Profile error:", err);
      loadingEl.innerHTML = `<p style="color:#ff3366;">${err.message}</p>`;
    }
  }

  const init = async () => {
    if (window.ZeroGravityAuth?.waitForReady) {
      await window.ZeroGravityAuth.waitForReady();
    }

    loadProfile();
  };

  init();
});
