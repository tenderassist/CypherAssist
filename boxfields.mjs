function initDynamicBoxFields(container, addButton, placeholder = "e.g. '24'") {
  if (!container || !addButton) {
    return {
      getValues: () => [],
      clear: () => {},
    };
  }

  const addField = () => {
    const row = document.createElement("div");
    row.className = "box-input";
    row.innerHTML = `
      <input type="text" class="boxNumber" placeholder="${placeholder}">
      <button class="removeBox" type="button" tabindex="-1">x</button>
    `;

    row.querySelector(".removeBox").addEventListener("click", () => {
      row.remove();
    });

    container.appendChild(row);
    row.querySelector(".boxNumber")?.focus();
  };

  addButton.addEventListener("click", addField);

  return {
    getValues() {
      const fields = container.querySelectorAll(".boxNumber");
      return [...new Set(
        Array.from(fields)
          .map((input) => input.value.trim())
          .filter(Boolean)
      )];
    },
    clear() {
      container.innerHTML = "";
    },
  };
}

export { initDynamicBoxFields };
