const navbar = document.querySelector(".navbar");

if (navbar && !navbar.dataset.mobileNavReady) {
  navbar.dataset.mobileNavReady = "true";

  const navLinks = [...navbar.querySelectorAll(".navitem, .navitem-active")];
  const activeLink =
    navbar.querySelector(".navitem-active") || navLinks.find((link) => !link.href);
  const menuId = "mobileNavMenu";
  const toggleButton = document.createElement("button");
  const menu = document.createElement("div");

  toggleButton.type = "button";
  toggleButton.className = "navbar-mobile-toggle";
  if (activeLink?.classList.contains("navitem-active")) {
    toggleButton.classList.add("navbar-mobile-toggle-active");
  }
  toggleButton.setAttribute("aria-expanded", "false");
  toggleButton.setAttribute("aria-controls", menuId);
  toggleButton.textContent = activeLink?.textContent?.trim() || "Navigation";

  menu.className = "navbar-mobile-menu";
  menu.id = menuId;

  navLinks.forEach((link) => {
    if (link.classList.contains("navitem-active")) {
      link.setAttribute("aria-current", "page");
    }

    menu.appendChild(link);
  });

  navbar.replaceChildren(toggleButton, menu);

  const setOpenState = (isOpen) => {
    navbar.classList.toggle("navbar-open", isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
  };

  toggleButton.addEventListener("click", () => {
    const isOpen = toggleButton.getAttribute("aria-expanded") === "true";
    setOpenState(!isOpen);
  });

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) {
      setOpenState(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!navbar.contains(event.target)) {
      setOpenState(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpenState(false);
    }
  });
}
