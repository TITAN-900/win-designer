(function () {
  const body = document.body;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function setYear() {
    $$(".js-year").forEach((node) => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function initNavigation() {
    const nav = $(".site-nav");
    const menuToggle = $(".menu-toggle");
    const navLinks = $$(".nav-links a");
    const hero = $(".intro, .hero, .project-hero");

    menuToggle?.addEventListener("click", () => {
      const isOpen = body.classList.toggle("menu-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        body.classList.remove("menu-open");
        menuToggle?.setAttribute("aria-expanded", "false");
      });
    });

    if (nav && hero && "IntersectionObserver" in window) {
      const navObserver = new IntersectionObserver((entries) => {
        nav.classList.toggle("is-solid", entries[0].intersectionRatio < 0.82);
      }, { threshold: [0, 0.82, 1] });
      navObserver.observe(hero);
    } else {
      nav?.classList.add("is-solid");
    }

    const sections = $$("[data-nav-section]");
    if (!sections.length) return;

    // Tall editorial sections may never meet an intersection-ratio threshold.
    // Track a reading line below the header instead, including reverse scroll.
    function syncActiveSection() {
      const readingLine = (nav?.getBoundingClientRect().bottom || 78) + 48;
      const visible = sections.find(section => {
        const bounds = section.getBoundingClientRect();
        return bounds.top <= readingLine && bounds.bottom > readingLine;
      });
      navLinks.forEach((link) => {
        const destination = new URL(link.href, location.href);
        const samePage = destination.pathname === location.pathname ||
          (destination.pathname.endsWith("/index.html") && location.pathname.endsWith("/"));
        link.classList.toggle("is-active", Boolean(link.getAttribute("aria-current") === "page" ||
          (samePage && visible && destination.hash === `#${visible.id}`)));
      });
    }
    let pending = false;
    function scheduleSectionSync() {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(() => {
        pending = false;
        syncActiveSection();
      });
    }
    window.addEventListener('scroll', scheduleSectionSync, { passive: true });
    window.addEventListener('resize', scheduleSectionSync, { passive: true });
    syncActiveSection();
  }

  function initReveal() {
    const revealItems = $$("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });

    revealItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const startsInView = rect.top < window.innerHeight * 0.95 && rect.bottom > 0;
      if (startsInView) {
        item.classList.add("is-visible");
        return;
      }

      item.classList.add("reveal-ready");
      revealObserver.observe(item);
    });
  }

  function initLightbox() {
    const lightbox = $("#lightbox");
    if (!lightbox) return;

    const image = $("#lightboxImage", lightbox);
    const caption = $("#lightboxCaption", lightbox);
    const close = $("[data-lightbox-close]", lightbox);
    const prev = $("[data-lightbox-prev]", lightbox);
    const next = $("[data-lightbox-next]", lightbox);
    let items = [];
    let index = 0;
    let lastFocus = null;

    function setImage(nextIndex) {
      if (!items.length) return;
      index = (nextIndex + items.length) % items.length;
      const item = items[index];
      image.src = item.src;
      image.alt = item.alt;
      caption.textContent = item.alt;
    }

    function open(trigger) {
      const group = trigger.dataset.lightboxGroup;
      items = $$("[data-lightbox-group]").filter((node) => node.dataset.lightboxGroup === group).map((node) => ({
        src: node.dataset.lightboxSrc,
        alt: node.dataset.lightboxAlt
      }));
      index = Number(trigger.dataset.lightboxIndex || 0);
      lastFocus = document.activeElement;
      setImage(index);
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      body.classList.add("lightbox-open");
      close.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      body.classList.remove("lightbox-open");
      lastFocus?.focus?.();
    }

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-lightbox-src]");
      if (!trigger) return;
      open(trigger);
    });

    close.addEventListener("click", closeLightbox);
    prev.addEventListener("click", () => setImage(index - 1));
    next.addEventListener("click", () => setImage(index + 1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") setImage(index - 1);
      if (event.key === "ArrowRight") setImage(index + 1);
    });
  }

  function boot() {
    setYear();
    initNavigation();
    initLightbox();
    initReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
