window.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuButton");
  const navLinks = document.getElementById("navLinks");

  const getMenuLabel = (isOpen) => {
    const isEnglish = document.documentElement.lang === "en";
    if (isEnglish) return isOpen ? "Close navigation" : "Open navigation";
    return isOpen ? "Navigatie sluiten" : "Navigatie openen";
  };

  const setMenuState = (isOpen) => {
    navLinks?.classList.toggle("is-open", isOpen);
    menuButton?.setAttribute("aria-expanded", String(isOpen));
    menuButton?.setAttribute("aria-label", getMenuLabel(isOpen));
  };

  menuButton?.addEventListener("click", () => {
    const isOpen = !navLinks?.classList.contains("is-open");
    setMenuState(isOpen);
  });

  navLinks?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      setMenuState(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (navLinks?.classList.contains("is-open") && !navLinks.contains(event.target) && !menuButton?.contains(event.target)) {
      setMenuState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navLinks?.classList.contains("is-open")) {
      setMenuState(false);
      menuButton?.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 761px)").matches) setMenuState(false);
  });

  document.addEventListener("fijnstof:languagechange", () => {
    setMenuState(navLinks?.classList.contains("is-open") ?? false);
  });

  setMenuState(false);
});
