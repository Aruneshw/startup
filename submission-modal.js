/**
 * submission-modal.js — Reusable modal for submitting solutions
 */
(function () {
  "use strict";

  function getSupabaseClient() {
    const client = window.ZeroGravityAuth?.getClient();
    if (client) return client;
    if (window.supabase && window.ZERO_GRAVITY_SUPABASE_CONFIG) {
      const cfg = window.ZERO_GRAVITY_SUPABASE_CONFIG;
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    }
    return null;
  }

  function createModal() {
    if (document.getElementById("zg-submission-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "zg-submission-modal";
    overlay.className = "zg-modal-overlay";
    overlay.innerHTML = `
      <div class="zg-modal-content">
        <button class="zg-modal-close" id="zg-modal-close" aria-label="Close">&times;</button>
        <h2 class="section-heading" style="font-size:1.6rem;margin-bottom:0.25rem;">Submit Your Solution</h2>
        <p id="zg-modal-problem-title" style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.5rem;"></p>
        <form id="zg-submission-form" autocomplete="off">
          <input type="hidden" id="zg-modal-problem-id" />
          <div class="zg-form-group">
            <label for="zg-solution-text">Solution Description *</label>
            <textarea id="zg-solution-text" rows="6" required placeholder="Describe your approach, architecture, and implementation plan…"></textarea>
          </div>
          <div class="zg-form-group">
            <label for="zg-repo-url">Repository / Demo URL</label>
            <input type="url" id="zg-repo-url" placeholder="https://github.com/your-repo" />
          </div>
          <div id="zg-submission-error" class="zg-form-error" style="display:none;"></div>
          <div id="zg-submission-success" class="zg-form-success" style="display:none;">
            ✅ Solution submitted successfully! Your identity is hidden until the client selects a winner.
          </div>
          <button type="submit" class="button button-primary" id="zg-submit-btn" style="width:100%;margin-top:0.5rem;">
            Submit Solution
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.getElementById("zg-modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });

    // Form submit
    document.getElementById("zg-submission-form").addEventListener("submit", handleSubmit);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("zg-submit-btn");
    const errorEl = document.getElementById("zg-submission-error");
    const successEl = document.getElementById("zg-submission-success");
    errorEl.style.display = "none";
    successEl.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Submitting…";

    try {
      const client = getSupabaseClient();
      if (!client) throw new Error("Not connected to backend");

      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error("Please log in to submit a solution");

      const problemId = parseInt(document.getElementById("zg-modal-problem-id").value, 10);
      const solutionText = document.getElementById("zg-solution-text").value.trim();
      const repoUrl = document.getElementById("zg-repo-url").value.trim() || null;

      if (!solutionText) throw new Error("Solution description is required");

      const { error } = await client.from("zg_submissions").insert({
        problem_id: problemId,
        developer_id: user.id,
        developer_name: user.user_metadata?.full_name || user.email,
        solution_text: solutionText,
        repo_url: repoUrl,
      });

      if (error) throw error;

      successEl.style.display = "block";
      document.getElementById("zg-submission-form").reset();
      setTimeout(closeModal, 2500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit Solution";
    }
  }

  function openModal(problemId, problemTitle) {
    createModal();
    document.getElementById("zg-modal-problem-id").value = problemId;
    document.getElementById("zg-modal-problem-title").textContent = problemTitle || "Problem #" + problemId;
    document.getElementById("zg-submission-error").style.display = "none";
    document.getElementById("zg-submission-success").style.display = "none";
    document.getElementById("zg-submission-form").reset();
    document.getElementById("zg-submission-modal").classList.add("is-visible");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    const modal = document.getElementById("zg-submission-modal");
    if (modal) {
      modal.classList.remove("is-visible");
      document.body.classList.remove("modal-open");
    }
  }

  // Expose globally
  window.ZGSubmissionModal = { open: openModal, close: closeModal };
})();
