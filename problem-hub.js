document.addEventListener("DOMContentLoaded", () => {
  const problemsGrid = document.getElementById("problems-grid");
  const loadingIndicator = document.getElementById("problem-hub-loading");
  const errorIndicator = document.getElementById("problem-hub-error");
  const emptyIndicator = document.getElementById("problem-hub-empty");
  const filterChips = document.querySelectorAll(".filter-chip");

  if (!problemsGrid || !loadingIndicator) return;

  let allProblems = [];

  function formatDate(isoString) {
    if (!isoString) return "Recent";
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
    }
  }

  function getInitials(name) {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

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
      
      let orgHTML = "";
      if (problem.organization) {
        orgHTML = `<span style="font-size: 0.8rem; opacity: 0.7; margin-left: auto;">${problem.organization}</span>`;
      }
      
      // Styling similar to the UI provided in the user's image
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <span class="tag-chip" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(56,189,248,0.1); color: #38bdf8; border: 1px solid rgba(56,189,248,0.2); border-radius: 4px;">
            ${projectTypeStr}
          </span>
          ${orgHTML}
        </div>
        
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #4f46e5; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.8rem;">
            ${initials}
          </div>
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600; font-size: 0.9rem;">${fullName}</span>
            <span style="font-size: 0.8rem; opacity: 0.6;">${submittedAt}</span>
          </div>
        </div>

        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; line-height: 1.4;">
          ${problem.project_description ? problem.project_description.substring(0, 80) + "..." : "No description provided"}
        </h3>
        
        <p class="project-description" style="font-size: 0.9rem; margin-bottom: 1.5rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
          ${problem.project_description || ""}
        </p>
        
        <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 0.5rem; font-size: 0.8rem; opacity: 0.7;">
            ${problem.budget_range ? `<span>💰 ${problem.budget_range}</span>` : ''}
          </div>
          <button class="button button-primary" style="padding: 0.4rem 1rem; font-size: 0.85rem;" onclick="location.href='./contact.html?ref=problem_${problem.id}'">Solve This</button>
        </div>
      `;
      problemsGrid.appendChild(card);
    });
  }

  async function fetchProblems() {
    try {
      const supabase = window.ZeroGravityAuth?.getClient();
      let client = supabase;
      
      if (!client) {
        if (window.supabase && window.ZERO_GRAVITY_SUPABASE_CONFIG) {
          const cfg = window.ZERO_GRAVITY_SUPABASE_CONFIG;
          client = window.supabase.createClient(cfg.url, cfg.anonKey);
        } else {
          throw new Error("Supabase client not initialized.");
        }
      }

      const { data, error } = await client
        .from('zg_client_problem_statements')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      allProblems = data || [];
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
        // Just mock popularity for now by shuffling/randomizing or taking top based on id
        renderProblems([...allProblems].sort((a, b) => b.id - a.id));
      }
    });
  });

  fetchProblems();
});
