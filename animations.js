function setupPageTransition() {
  requestAnimationFrame(() => {
    document.body.classList.add("page-ready");
  });
}

function setupRevealAnimations() {
  const revealNodes = document.querySelectorAll(".reveal");

  if (!revealNodes.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.15,
    }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function animateValue(node) {
  const targetValue = Number(node.dataset.count || 0);
  const after = node.dataset.after || "";
  const duration = 1300;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextValue = Math.round(targetValue * eased);
    node.textContent = `${nextValue}${after}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    node.textContent = `${targetValue}${after}`;
  }

  requestAnimationFrame(tick);
}

function setupStatAnimations() {
  const statItems = document.querySelectorAll(".stat-item");
  const statNumbers = document.querySelectorAll("[data-count]");

  if (!statItems.length || !statNumbers.length) {
    return;
  }

  const startAnimation = () => {
    statItems.forEach((item) => item.classList.add("is-animated"));
    statNumbers.forEach((node) => {
      if (node.dataset.animated === "true") {
        return;
      }

      node.dataset.animated = "true";
      animateValue(node);
    });
  };

  const statsSection = document.querySelector(".stats-bar");

  if (!statsSection || !("IntersectionObserver" in window)) {
    startAnimation();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          startAnimation();
          observer.disconnect();
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.3,
    }
  );

  observer.observe(statsSection);
}

document.addEventListener("DOMContentLoaded", () => {
  setupPageTransition();
  setupRevealAnimations();
  setupStatAnimations();
});
