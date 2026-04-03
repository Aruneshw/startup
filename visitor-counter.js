(function () {
  const config = window.ZERO_GRAVITY_SUPABASE_CONFIG || {};
  const CACHE_KEY = "zg-visitor-count-cache";
  const LAST_INCREMENT_KEY = "zg-visitor-last-hit";
  const INCREMENT_WINDOW_MS = 1000 * 60 * 60 * 6;

  function getNodes() {
    return Array.from(document.querySelectorAll("[data-visitor-count]"));
  }

  function formatCount(value) {
    const numericValue = Math.max(0, Number(value) || 0);
    return new Intl.NumberFormat("en-IN").format(numericValue);
  }

  function renderCount(value) {
    getNodes().forEach((node) => {
      node.textContent = formatCount(value);
    });
  }

  function animateCount(target) {
    const nodes = getNodes();

    if (!nodes.length) {
      return;
    }

    const endValue = Math.max(0, Math.round(Number(target) || 0));
    const startValue =
      endValue > 0
        ? Math.max(0, endValue - Math.min(240, Math.max(24, Math.round(endValue * 0.18))))
        : 0;
    const duration = 1350;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (endValue - startValue) * eased);

      nodes.forEach((node) => {
        node.textContent = formatCount(currentValue);
      });

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      }
    }

    window.requestAnimationFrame(tick);
  }

  function observeAndAnimate(target) {
    const strip = document.querySelector(".footer-visitor-strip");

    if (!strip || typeof IntersectionObserver !== "function") {
      animateCount(target);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        animateCount(target);
        observer.disconnect();
      },
      {
        threshold: 0.35,
      }
    );

    observer.observe(strip);
  }

  function isSupabaseReady() {
    return Boolean(
      config.url &&
        config.anonKey &&
        window.supabase &&
        typeof window.supabase.createClient === "function"
    );
  }

  function createClient() {
    return window.supabase.createClient(config.url, config.anonKey);
  }

  function shouldIncrement() {
    try {
      const lastHit = Number(window.localStorage.getItem(LAST_INCREMENT_KEY) || 0);
      return !lastHit || Date.now() - lastHit > INCREMENT_WINDOW_MS;
    } catch (_error) {
      return true;
    }
  }

  function markIncremented() {
    try {
      window.localStorage.setItem(LAST_INCREMENT_KEY, String(Date.now()));
    } catch (_error) {
      // Ignore localStorage write failures.
    }
  }

  function getCachedCount() {
    try {
      return Number(window.localStorage.getItem(CACHE_KEY) || 0);
    } catch (_error) {
      return 0;
    }
  }

  function saveCachedCount(value) {
    try {
      window.localStorage.setItem(CACHE_KEY, String(Math.max(0, Number(value) || 0)));
    } catch (_error) {
      // Ignore localStorage write failures.
    }
  }

  function fallbackCount(increment) {
    const baseCount = getCachedCount();
    const nextCount = increment ? baseCount + 1 : baseCount;

    if (increment) {
      markIncremented();
      saveCachedCount(nextCount);
    }

    return nextCount;
  }

  async function loadVisitorCount() {
    const increment = shouldIncrement();

    if (!isSupabaseReady()) {
      return fallbackCount(increment);
    }

    const client = createClient();

    if (increment) {
      const { data, error } = await client.rpc("increment_zg_visitor_count");

      if (!error && typeof data === "number") {
        markIncremented();
        saveCachedCount(data);
        return data;
      }

      console.warn("Zero Gravity visitor increment skipped:", error?.message || "Unknown error");
    }

    const { data, error } = await client.rpc("get_zg_visitor_count");

    if (!error && typeof data === "number") {
      saveCachedCount(data);
      return data;
    }

    console.warn("Zero Gravity visitor read skipped:", error?.message || "Unknown error");
    return fallbackCount(increment);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!getNodes().length) {
      return;
    }

    renderCount(getCachedCount());

    const visitorCount = await loadVisitorCount();
    observeAndAnimate(visitorCount);
  });
})();
