document.addEventListener("DOMContentLoaded", async () => {
  const problemsGrid = document.getElementById("problems-grid");
  const loadingIndicator = document.getElementById("problem-hub-loading");
  const errorIndicator = document.getElementById("problem-hub-error");
  const emptyIndicator = document.getElementById("problem-hub-empty");
  const filterChips = document.querySelectorAll(".filter-chip");

  if (!problemsGrid || !loadingIndicator) return;

  let allProblems = [];

  function getClient() {
    return window.ZeroGravityAuth?.getClient?.() || null;
  }

  function formatDate(isoString) {
    if (!isoString) return "Recent";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  }

  const difficultyMeta = {
    easy:     { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  label: "Easy" },
    medium:   { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Medium" },
    hard:     { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "Hard" },
    critical: { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "Critical" },
  };

  function renderProblems(problems) {
    problemsGrid.innerHTML = "";

    if (problems.length === 0) {
      emptyIndicator.style.display = "block";
      problemsGrid.style.display = "none";
      return;
    }

    emptyIndicator.style.display = "none";
    problemsGrid.style.display = "grid";

    problems.forEach((problem) => {
      const card = document.createElement("article");
      card.className = "project-card card-hover";

      const projectTypeStr = problem.project_type || "General";
      const submittedAt = formatDate(problem.submitted_at);
      const fullName = problem.full_name || "Anonymous";
      const initials = getInitials(fullName);
      const diff = difficultyMeta[problem.difficulty] || difficultyMeta.medium;
      const subCount = problem.submission_count || 0;

      let orgHTML = "";
      if (problem.organization) {
        orgHTML = `<span style="font-size:0.8rem;opacity:0.7;margin-left:auto;">${problem.organization}</span>`;
      }

      const descPreview = problem.project_description
        ? problem.project_description.substring(0, 80) + (problem.project_description.length > 80 ? "…" : "")
        : "No description provided";

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:0.5rem;flex-wrap:wrap;">
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <span class="tag-chip" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:rgba(56,189,248,0.1);color:#38bdf8;border:1px solid rgba(56,189,248,0.2);border-radius:4px;">
              ${projectTypeStr}
            </span>
            <span class="zg-difficulty-chip" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:${diff.bg};color:${diff.color};border:1px solid ${diff.color}33;border-radius:4px;font-weight:600;">
              ${diff.label}
            </span>
          </div>
          ${orgHTML}
        </div>

        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
          <div style="width:32px;height:32px;border-radius:50%;background:#4f46e5;color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:0.8rem;">
            ${initials}
          </div>
          <div style="display:flex;flex-direction:column;">
            <span style="font-weight:600;font-size:0.9rem;">${fullName}</span>
            <span style="font-size:0.8rem;opacity:0.6;">${submittedAt}</span>
          </div>
        </div>

        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;line-height:1.4;">
          ${descPreview}
        </h3>

        <p class="project-description" style="font-size:0.9rem;margin-bottom:1.5rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
          ${problem.project_description || ""}
        </p>

        <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <div style="display:flex;gap:0.75rem;font-size:0.8rem;opacity:0.7;align-items:center;">
            ${problem.budget_range ? `<span>💰 ${problem.budget_range}</span>` : ""}
            <span title="${subCount} submissions">📝 ${subCount}</span>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button class="button button-ghost" style="padding:0.4rem 0.8rem;font-size:0.8rem;min-height:36px;" onclick="window.ZGSubmissionModal && window.ZGSubmissionModal.open(${problem.id}, '${descPreview.replace(/'/g, "\\'")}')">
              Submit Solution
            </button>
            <button class="button button-primary" style="padding:0.4rem 1rem;font-size:0.85rem;min-height:36px;" onclick="location.href='./workspace.html?problem_id=${problem.id}'">
              Solve This
            </button>
          </div>
        </div>
      `;
      problemsGrid.appendChild(card);
    });
  }

  async function fetchProblems() {
    try {
      const client = getClient();
      if (!client) throw new Error("Supabase client not initialized.");

      const { data, error } = await client
        .from("zg_client_problem_statements")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      // Fetch submission counts
      const problemIds = (data || []).map(p => p.id);
      let subCounts = {};
      if (problemIds.length > 0) {
        const { data: subs } = await client
          .from("zg_submissions")
          .select("problem_id")
          .in("problem_id", problemIds);

        (subs || []).forEach(s => {
          subCounts[s.problem_id] = (subCounts[s.problem_id] || 0) + 1;
        });
      }

      allProblems = (data || []).map(p => ({ ...p, submission_count: subCounts[p.id] || 0 }));
      loadingIndicator.style.display = "none";
      renderProblems(allProblems);
    } catch (err) {
      console.error("Error fetching problems:", err);
      loadingIndicator.style.display = "none";
      errorIndicator.style.display = "block";
      errorIndicator.textContent = "Unable to load problem statements. " + err.message;
    }
  }

  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");

      const filter = chip.dataset.filter;
      if (filter === "Latest") {
        renderProblems([...allProblems].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)));
      } else if (filter === "Popular") {
        renderProblems([...allProblems].sort((a, b) => (b.submission_count || 0) - (a.submission_count || 0)));
      } else if (["easy", "medium", "hard", "critical"].includes(filter)) {
        renderProblems(allProblems.filter(p => p.difficulty === filter));
      }
    });
  });

  if (window.ZeroGravityAuth?.waitForReady) {
    await window.ZeroGravityAuth.waitForReady();
  }

  fetchProblems();
});
