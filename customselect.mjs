function initCustomSelect(select) {
  if (!select || select.dataset.customSelectReady === "true") {
    return;
  }

  select.dataset.customSelectReady = "true";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "custom-select-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "custom-select-button-label";
  button.appendChild(label);

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");

  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  select.classList.add("custom-select-native");

  function closeMenu() {
    wrapper.classList.remove("custom-select-open");
    button.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    wrapper.classList.add("custom-select-open");
    button.setAttribute("aria-expanded", "true");
  }

  function syncFromSelect() {
    const selectedOption = select.options[select.selectedIndex];
    const selectedLabel = selectedOption?.textContent?.trim() || "Select...";
    const hasValue = Boolean(select.value);

    label.textContent = selectedLabel;
    button.classList.toggle("custom-select-button-placeholder", !hasValue);

    menu.querySelectorAll(".custom-select-option").forEach((optionButton) => {
      const isSelected = optionButton.dataset.value === select.value;
      optionButton.classList.toggle("custom-select-option-active", isSelected);
      optionButton.setAttribute("aria-selected", String(isSelected));
    });
  }

  Array.from(select.options).forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "custom-select-option";
    optionButton.dataset.value = option.value;
    optionButton.textContent = option.textContent || "";
    optionButton.setAttribute("role", "option");
    optionButton.setAttribute("aria-selected", "false");

    optionButton.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncFromSelect();
      closeMenu();
      button.focus();
    });

    menu.appendChild(optionButton);
  });

  button.addEventListener("click", () => {
    if (wrapper.classList.contains("custom-select-open")) {
      closeMenu();
      return;
    }

    openMenu();
  });

  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openMenu();
    const activeOption =
      menu.querySelector(".custom-select-option-active") ||
      menu.querySelector(".custom-select-option");
    activeOption?.focus();
  });

  menu.addEventListener("keydown", (event) => {
    const options = [...menu.querySelectorAll(".custom-select-option")];
    const currentIndex = options.indexOf(document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      button.focus();
      return;
    }

    if (event.key === "ArrowDown" && currentIndex < options.length - 1) {
      event.preventDefault();
      options[currentIndex + 1]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex > 0) {
        options[currentIndex - 1]?.focus();
      } else {
        button.focus();
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      closeMenu();
    }
  });

  select.addEventListener("change", syncFromSelect);
  syncFromSelect();
}

export { initCustomSelect };
