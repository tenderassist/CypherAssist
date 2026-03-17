const backToTopButton = document.querySelector(".back-to-top");
const navBar = document.querySelector(".navbar");

if (backToTopButton && navBar) {
  backToTopButton.textContent = String.fromCodePoint(0x1F881);

  const toggleVisibility = (isVisible) => {
    backToTopButton.classList.toggle("back-to-top-visible", isVisible);
  };

  toggleVisibility(false);

  const observer = new IntersectionObserver(
    ([entry]) => {
      toggleVisibility(!entry.isIntersecting);
    },
    {
      threshold: 0,
    }
  );

  observer.observe(navBar);
}
