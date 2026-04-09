document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("approved-members-grid");
  const emptyState = document.getElementById("approved-members-empty");

  if (!grid) {
    return;
  }

  if (window.ZeroGravityAuth?.waitForReady) {
    await window.ZeroGravityAuth.waitForReady();
  }

  const client = window.ZeroGravityAuth?.getClient?.();

  if (!client) {
    return;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) {
      return "ZG";
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }

  function createLink(label, href) {
    if (!href) {
      return "";
    }

    return `<a class="social-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(
      label
    )}</a>`;
  }

  try {
    const { data: rows, error } = await client
      .from("zg_member_interest")
      .select(
        "full_name, public_display_name, preferred_role, public_role, area_of_interest, team_contribution, motivation, public_headline, skills, public_skills, college, linkedin_url, github_url, portfolio_url, public_avatar_url, display_order, submitted_at"
      )
      .eq("approval_status", "approved")
      .eq("show_on_team_page", true)
      .order("display_order", { ascending: true })
      .order("submitted_at", { ascending: true });

    if (error) {
      console.warn("Zero Gravity approved member load failed:", error.message);
      return;
    }

    const data = (rows || []).map((row) => ({
      display_name: row.public_display_name || row.full_name,
      role_title: row.public_role || row.preferred_role || `${row.area_of_interest} Contributor`,
      headline: row.public_headline || row.team_contribution || row.motivation || "Approved member of Team Zero Gravity",
      skills: row.public_skills || row.skills || row.area_of_interest,
      college: row.college,
      linkedin_url: row.linkedin_url,
      github_url: row.github_url,
      portfolio_url: row.portfolio_url,
      avatar_url: row.public_avatar_url || null,
      display_order: row.display_order
    }));

    if (!data || !data.length) {
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }

    if (emptyState) {
      emptyState.hidden = true;
    }

    grid.innerHTML = data
      .map((member) => {
        const skills = String(member.skills || "")
          .split(/[|,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 5)
          .map((skill) => `<span class="tag-chip">${escapeHtml(skill)}</span>`)
          .join("");

        const links = [
          createLink("LinkedIn", member.linkedin_url),
          createLink("GitHub", member.github_url),
          createLink("Portfolio", member.portfolio_url),
        ]
          .filter(Boolean)
          .join("");

        const avatar = member.avatar_url
          ? `<img class="approved-member-avatar-image" src="${escapeHtml(
              member.avatar_url
            )}" alt="${escapeHtml(member.display_name)} portrait" />`
          : `<div class="approved-member-avatar-fallback">${escapeHtml(
              getInitials(member.display_name)
            )}</div>`;

        return `
          <article class="member-card approved-member-card">
            <div class="approved-member-avatar">${avatar}</div>
            <h3 class="member-name">${escapeHtml(member.display_name)}</h3>
            <p class="member-role">${escapeHtml(member.role_title || "Approved Member")}</p>
            <p class="approved-member-college">${escapeHtml(member.college || "")}</p>
            <p class="approved-member-headline">${escapeHtml(
              member.headline || "Approved to join Team Zero Gravity."
            )}</p>
            <div class="member-preview-tags">${skills}</div>
            <div class="approved-member-links">${links}</div>
          </article>
        `;
      })
      .join("");
  } catch (loadError) {
    console.warn("Zero Gravity approved member load failed:", loadError);
  }
});
