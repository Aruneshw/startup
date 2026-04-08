/**
 * leaderboard.js — Fetches and renders developer leaderboard
 */
document.addEventListener("DOMContentLoaded", () => {
  const loadingEl = document.getElementById("leaderboard-loading");
  const emptyEl = document.getElementById("leaderboard-empty");
  const wrapEl = document.getElementById("leaderboard-wrap");
  const bodyEl = document.getElementById("leaderboard-body");
  const filterChips = document.querySelectorAll(".filter-chip");

  if (!bodyEl || !loadingEl) return;

  let allDevs = [];

  function getClient() {
    const client = window.ZeroGravityAuth?.getClient();
    if (client) return client;
    if (window.supabase && window.ZERO_GRAVITY_SUPABASE_CONFIG) {
      const cfg = window.ZERO_GRAVITY_SUPABASE_CONFIG;
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    }
    return null;
  }

  function renderLeaderboard(devs) {
    bodyEl.innerHTML = "";
    if (devs.length === 0) {
      emptyEl.style.display = "block";
      wrapEl.style.display = "none";
      return;
    }
    emptyEl.style.display = "none";
    wrapEl.style.display = "block";

    devs.forEach((dev, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : "";
      const rankIcon = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      const name = dev.public_display_name || dev.full_name || "Anonymous";
      const initials = name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
      const successPct = ((dev.success_rate || 0) * 100).toFixed(0);
      const badgesHtml = (dev.badges || [])
        .slice(0, 3)
        .map(b => `<span class="zg-badge-chip" title="${b.name}">${b.icon}</span>`)
        .join("");

      const profileUrl = `./developer-profile.html?uid=${dev.auth_user_id || ""}`;

      const tr = document.createElement("tr");
      tr.className = `zg-lb-row ${rankClass}`;
      tr.innerHTML = `
        <td class="zg-lb-rank">${rankIcon}</td>
        <td class="zg-lb-dev">
          <a href="${profileUrl}" class="zg-lb-dev-link">
            <div class="zg-lb-avatar">${initials}</div>
            <div>
              <span class="zg-lb-name">${name}</span>
              <span class="zg-lb-role">${dev.public_role || dev.area_of_interest || ""}</span>
            </div>
          </a>
        </td>
        <td class="zg-lb-rep"><span class="stat-number" style="font-size:1.1rem;">${dev.reputation_score || 0}</span></td>
        <td>${dev.problems_solved || 0}</td>
        <td>${successPct}%</td>
        <td>${(dev.avg_rating || 0).toFixed(1)} ⭐</td>
        <td>
          <div class="zg-trust-bar">
            <div class="zg-trust-fill" style="width:${Math.min(dev.trust_score || 0, 100)}%"></div>
          </div>
        </td>
        <td class="zg-lb-badges">${badgesHtml || "—"}</td>
      `;
      bodyEl.appendChild(tr);
    });
  }

  async function fetchLeaderboard() {
    try {
      const client = getClient();
      if (!client) throw new Error("Supabase not initialized");

      // Fetch developers
      const { data: devs, error } = await client
        .from("zg_member_interest")
        .select("auth_user_id, full_name, public_display_name, public_role, area_of_interest, reputation_score, problems_solved, success_rate, avg_rating, trust_score, total_submissions")
        .gt("total_submissions", 0)
        .order("reputation_score", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch badges for all devs
      const userIds = (devs || []).map(d => d.auth_user_id).filter(Boolean);
      let badgesMap = {};
      if (userIds.length > 0) {
        const { data: userBadges } = await client
          .from("zg_user_badges")
          .select("user_id, badge:badge_id(name, icon)")
          .in("user_id", userIds);

        (userBadges || []).forEach(ub => {
          if (!badgesMap[ub.user_id]) badgesMap[ub.user_id] = [];
          if (ub.badge) badgesMap[ub.user_id].push(ub.badge);
        });
      }

      allDevs = (devs || []).map(d => ({ ...d, badges: badgesMap[d.auth_user_id] || [] }));
      loadingEl.style.display = "none";
      renderLeaderboard(allDevs);
    } catch (err) {
      console.error("Leaderboard error:", err);
      loadingEl.textContent = "Unable to load leaderboard. " + err.message;
    }
  }

  function sortDevs(filter) {
    const sorted = [...allDevs];
    switch (filter) {
      case "speed":
        sorted.sort((a, b) => (a.avg_response_time || 999) - (b.avg_response_time || 999));
        break;
      case "accuracy":
        sorted.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));
        break;
      case "trusted":
        sorted.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
        break;
      default:
        sorted.sort((a, b) => (b.reputation_score || 0) - (a.reputation_score || 0));
    }
    return sorted;
  }

  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      renderLeaderboard(sortDevs(chip.dataset.filter));
    });
  });

  fetchLeaderboard();
});
