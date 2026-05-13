window.addEventListener("DOMContentLoaded", () => {
  const menuButton = document.getElementById("menuButton");
  const navLinks = document.getElementById("navLinks");

  menuButton?.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navLinks.classList.remove("is-open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });
});
