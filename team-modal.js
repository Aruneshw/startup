function populateTeamModal(card, modalElements) {
  const { name, role, tagline, description, skills, image, linkedin } = card.dataset;
  modalElements.avatar.src = image;
  modalElements.avatar.alt = `${name} avatar`;
  modalElements.name.textContent = name;
  modalElements.role.textContent = role;
  modalElements.description.textContent = description;
  modalElements.skills.innerHTML = "";

  skills.split("|").forEach((skill) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = skill;
    modalElements.skills.appendChild(chip);
  });

  modalElements.tagline.textContent = tagline;

  if (linkedin) {
    modalElements.linkedin.href = linkedin;
    modalElements.linkedin.hidden = false;
    modalElements.linkedin.setAttribute("aria-label", `${name} LinkedIn profile`);
  } else {
    modalElements.linkedin.href = "#";
    modalElements.linkedin.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const cards = document.querySelectorAll("[data-team-member]");
  const overlay = document.getElementById("member-modal-overlay");

  if (!cards.length || !overlay) {
    return;
  }

  const modalElements = {
    avatar: document.getElementById("modal-avatar"),
    name: document.getElementById("modal-name"),
    role: document.getElementById("modal-role"),
    tagline: document.getElementById("modal-tagline"),
    description: document.getElementById("modal-description"),
    skills: document.getElementById("modal-skills"),
    linkedin: document.getElementById("modal-linkedin"),
    close: document.getElementById("modal-close"),
  };

  let activeCard = null;

  const closeModal = () => {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
    if (activeCard) {
      activeCard.focus();
    }
  };

  const openModal = (card) => {
    activeCard = card;
    populateTeamModal(card, modalElements);
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => openModal(card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(card);
      }
    });
  });

  modalElements.close.addEventListener("click", closeModal);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-open")) {
      closeModal();
    }
  });
});
