document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const toast = document.getElementById("contact-toast");
  const authNote = document.getElementById("contact-auth-note");

  if (!form || !toast) {
    return;
  }

  const errorNodes = form.querySelectorAll("[data-error-for]");

  const requiredFields = [
    { name: "fullName", message: "Please enter your full name." },
    { name: "email", message: "Please enter a valid email address." },
    { name: "projectType", message: "Please choose a project type." },
    {
      name: "projectDescription",
      message: "Please describe the problem statement or idea clearly.",
    },
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
      authNote.textContent = `Signed in as ${getDisplayName()}. Your enquiry will be saved with your Supabase profile.`;
      return;
    }

    authNote.textContent =
      "You can use this form normally without signing in.";
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

  function showToast(message, isWarning = false) {
    toast.textContent = message;
    toast.classList.toggle("toast-warning", isWarning);
    toast.classList.add("is-visible");
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3600);
  }

  function persistLocally(payload) {
    const key = "zeroGravityLocalProblemStatements";
    const existing = JSON.parse(window.localStorage.getItem(key) || "[]");
    existing.unshift(payload);
    window.localStorage.setItem(key, JSON.stringify(existing.slice(0, 25)));
  }

  async function persistToSupabase(payload) {
    const client = window.ZeroGravityAuth?.getClient?.();
    const config = window.ZERO_GRAVITY_SUPABASE_CONFIG || {};

    if (!client || !config.enquiriesTable) {
      persistLocally(payload);
      return { mode: "local" };
    }

    const { error } = await client.from(config.enquiriesTable).insert(payload);

    if (error) {
      console.warn("Zero Gravity enquiry save failed:", error.message);
      persistLocally(payload);
      return { mode: "local" };
    }

    return { mode: "supabase" };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

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

    const user = getCurrentUser();
    const payload = {
      full_name: values.fullName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      organization: values.organization.trim() || null,
      project_type: values.projectType.trim(),
      project_description: values.projectDescription.trim(),
      budget_range: values.budgetRange.trim() || null,
      discovery_source: values.source.trim() || null,
      auth_user_id: user?.id || null,
      auth_display_name: getDisplayName() || null,
      auth_email: user?.email || null,
      source_page: window.location.pathname,
      submitted_at: new Date().toISOString(),
    };

    console.log("Team Zero Gravity problem statement:", payload);

    const result = await persistToSupabase(payload);
    form.reset();
    prefillFromAuth();

    if (result.mode === "supabase") {
      showToast("Problem statement received! We'll reach out within 48 hours.");
      return;
    }

    showToast(
      "Saved locally for now. Add Supabase keys to start receiving live submissions.",
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
