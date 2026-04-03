function setupHeroParticles() {
  const canvas = document.getElementById("hero-particles");

  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const particleCount = prefersReducedMotion ? 18 : 36;
  let width = 0;
  let height = 0;
  let animationFrame = 0;

  const particles = Array.from({ length: particleCount }, () => ({
    centerX: Math.random(),
    centerY: Math.random(),
    driftX: (Math.random() - 0.5) * 0.0005,
    driftY: (Math.random() - 0.5) * 0.0005,
    orbitRadius: 8 + Math.random() * 26,
    angle: Math.random() * Math.PI * 2,
    speed: 0.004 + Math.random() * 0.008,
    size: 1.4 + Math.random() * 2.8,
  }));

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function updateParticle(particle) {
    particle.centerX += particle.driftX;
    particle.centerY += particle.driftY;

    if (particle.centerX < 0 || particle.centerX > 1) {
      particle.driftX *= -1;
      particle.centerX = Math.min(1, Math.max(0, particle.centerX));
    }

    if (particle.centerY < 0 || particle.centerY > 1) {
      particle.driftY *= -1;
      particle.centerY = Math.min(1, Math.max(0, particle.centerY));
    }

    particle.angle += particle.speed;

    return {
      x: particle.centerX * width + Math.cos(particle.angle) * particle.orbitRadius,
      y: particle.centerY * height + Math.sin(particle.angle) * particle.orbitRadius,
      size: particle.size,
    };
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const rendered = particles.map(updateParticle);

    for (let i = 0; i < rendered.length; i += 1) {
      for (let j = i + 1; j < rendered.length; j += 1) {
        const dx = rendered[i].x - rendered[j].x;
        const dy = rendered[i].y - rendered[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 150) {
          ctx.beginPath();
          ctx.moveTo(rendered[i].x, rendered[i].y);
          ctx.lineTo(rendered[j].x, rendered[j].y);
          ctx.strokeStyle = `rgba(0, 245, 212, ${0.14 - distance / 1200})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    rendered.forEach((particle) => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 245, 212, 0.78)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 245, 212, 0.05)";
      ctx.fill();
    });

    if (!prefersReducedMotion) {
      animationFrame = window.requestAnimationFrame(draw);
    }
  }

  resizeCanvas();
  draw();

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", () => {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
  });
}

document.addEventListener("DOMContentLoaded", setupHeroParticles);
