import { ref, get } from "firebase/database";
import { getBoxesCollectionPath } from "./auth.mjs";

function initQuickSearch(db, user) {
  const quicksearchInput = document.getElementById("quicksearch");
  const resultDiv = document.getElementById("quicksearchResult");
  let lastRequestId = 0;

  if (!quicksearchInput || !resultDiv || !user) return;

  const positionResult = () => {
    const rect = quicksearchInput.getBoundingClientRect();
    const viewportPadding = 12;
    const availableWidth = Math.max(
      220,
      Math.min(rect.width, window.innerWidth - viewportPadding * 2)
    );
    const left = Math.min(
      rect.left,
      window.innerWidth - availableWidth - viewportPadding
    );

    resultDiv.style.width = `${availableWidth}px`;
    resultDiv.style.left = `${Math.max(viewportPadding, left)}px`;
    resultDiv.style.top = `${rect.bottom + 6}px`;
  };

  const hideResult = () => {
    resultDiv.textContent = "";
    resultDiv.classList.remove("active", "error");
  };

  window.addEventListener("resize", () => {
    if (resultDiv.classList.contains("active")) {
      positionResult();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (resultDiv.classList.contains("active")) {
        positionResult();
      }
    },
    { passive: true }
  );

  quicksearchInput.addEventListener("input", async () => {
    const quickboxID = quicksearchInput.value.trim();
    const requestId = ++lastRequestId;

    if (quickboxID === "") {
      hideResult();
      return;
    }

    try {
      const snapshot = await get(
        ref(db, `${getBoxesCollectionPath(user)}/${quickboxID}`)
      );
      if (requestId !== lastRequestId) return;

      if (!snapshot.exists()) {
        resultDiv.textContent = "Box not found in database.";
        positionResult();
        resultDiv.classList.add("active", "error");
        return;
      }

      const quickboxData = snapshot.val();
      const quickoffice = quickboxData.boxoffice || "No office assigned";

      resultDiv.textContent = `${quickboxID} is in Office: ${quickoffice}`;
      positionResult();
      resultDiv.classList.add("active");
      resultDiv.classList.remove("error");
    } catch (error) {
      if (requestId !== lastRequestId) return;
      console.error("Error fetching data:", error);
      resultDiv.textContent = "Error retrieving data.";
      positionResult();
      resultDiv.classList.add("active", "error");
    }
  });

  quicksearchInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (!quicksearchInput.value.trim()) {
        hideResult();
      }
    }, 120);
  });
}

export { initQuickSearch };
