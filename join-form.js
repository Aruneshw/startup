document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("join-form");
  const toast = document.getElementById("join-toast");
  const authNote = document.getElementById("join-auth-note");

  if (!form || !toast) {
    return;
  }

  const errorNodes = form.querySelectorAll("[data-error-for]");

  const requiredFields = [
    { name: "fullName", message: "Please enter your full name." },
    { name: "email", message: "Please enter a valid email address." },
    { name: "phone", message: "Please enter your phone number." },
    { name: "college", message: "Please enter your college name." },
    { name: "department", message: "Please enter your department or course." },
    { name: "yearOfStudy", message: "Please choose your year of study." },
    { name: "areaOfInterest", message: "Please choose your area of interest." },
    { name: "preferredRole", message: "Tell us the role you want to take in the team." },
    { name: "skills", message: "Please share your key skills and tools." },
    { name: "previousWork", message: "Tell us what you have built." },
    { name: "teamContribution", message: "Tell us how you can contribute to the team." },
    { name: "motivation", message: "Tell us why you want to join Zero Gravity." },
  ];

  function setError(name, message = "") {
    const errorNode = form.querySelector(`[data-error-for="${name}"]`);
    if (errorNode) {
      errorNode.textContent = message;
    }
  }

  function clearErrors() {
    errorNodes.forEach((node) => {
      node.textContent = "";
    });
  }

  function showToast(message, isWarning = false) {
    toast.textContent = message;
    toast.classList.toggle("toast-warning", isWarning);
    toast.classList.add("is-visible");
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3600);
  }

  function getCurrentUser() {
    return window.ZeroGravityAuth?.getUser?.() || null;
  }

  function getDisplayName() {
    return window.ZeroGravityAuth?.getDisplayName?.(getCurrentUser()) || "";
  }

  function updateAuthNote() {
    if (!authNote) {
      return;
    }

    const user = getCurrentUser();

    if (user) {
      authNote.textContent = `Signed in as ${getDisplayName()}. Your application will be linked to your Supabase profile.`;
      return;
    }

    authNote.textContent =
      "Sign in with Google on the entry page first so we can connect your application to your profile.";
  }

  function prefillFromAuth() {
    const user = getCurrentUser();

    if (!user) {
      updateAuthNote();
      return;
    }

    const nameField = form.elements.namedItem("fullName");
    const emailField = form.elements.namedItem("email");

    if (nameField && !nameField.value.trim()) {
      nameField.value = getDisplayName();
    }

    if (emailField && !emailField.value.trim() && user.email) {
      emailField.value = user.email;
    }

    updateAuthNote();
  }

  function persistLocally(payload) {
    const key = "zeroGravityLocalMemberInterest";
    const existing = JSON.parse(window.localStorage.getItem(key) || "[]");
    existing.unshift(payload);
    window.localStorage.setItem(key, JSON.stringify(existing.slice(0, 25)));
  }

  async function persistToSupabase(payload) {
    const client = window.ZeroGravityAuth?.getClient?.();
    const config = window.ZERO_GRAVITY_SUPABASE_CONFIG || {};

    if (!client || !config.memberInterestTable) {
      persistLocally(payload);
      return { mode: "local" };
    }

    const { error } = await client.from(config.memberInterestTable).insert(payload);

    if (error) {
      console.warn("Zero Gravity member interest save failed:", error.message);
      persistLocally(payload);
      return { mode: "local" };
    }

    return { mode: "supabase" };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const user = getCurrentUser();

    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    let isValid = true;

    requiredFields.forEach(({ name, message }) => {
      const value = (values[name] || "").trim();

      if (!value) {
        setError(name, message);
        isValid = false;
        return;
      }

      if (name === "email") {
        const emailInput = form.elements.namedItem("email");
        if (emailInput && !emailInput.checkValidity()) {
          setError(name, message);
          isValid = false;
        }
      }
    });

    if (!isValid) {
      return;
    }

    const payload = {
      full_name: values.fullName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      college: values.college.trim(),
      department: values.department.trim(),
      year_of_study: values.yearOfStudy.trim(),
      area_of_interest: values.areaOfInterest.trim(),
      preferred_role: values.preferredRole.trim(),
      skills: values.skills.trim(),
      linkedin_url: values.linkedinUrl.trim() || null,
      github_url: values.githubUrl.trim() || null,
      portfolio_url: values.portfolioUrl.trim() || null,
      previous_work: values.previousWork.trim(),
      team_contribution: values.teamContribution.trim(),
      motivation: values.motivation.trim(),
      availability: values.availability.trim() || null,
      auth_user_id: user?.id || null,
      auth_display_name: getDisplayName() || null,
      auth_email: user?.email || null,
      source_page: window.location.pathname,
      submitted_at: new Date().toISOString(),
    };

    console.log("Team Zero Gravity member application:", payload);

    const result = await persistToSupabase(payload);
    form.reset();
    prefillFromAuth();

    if (result.mode === "supabase") {
      showToast("Application received! We'll review it and get back to you soon.");
      return;
    }

    showToast(
      "Saved locally for now. Run the updated SQL in Supabase to receive live applications.",
      true
    );
  });

  form.querySelectorAll("input, textarea, select").forEach((field) => {
    field.addEventListener("input", () => setError(field.name, ""));
    field.addEventListener("change", () => setError(field.name, ""));
  });

  window.addEventListener("zero-gravity-auth-changed", prefillFromAuth);
  prefillFromAuth();
});
