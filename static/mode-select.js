document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("mode-modal");
  if (!modal) return;

  const titleEl = document.getElementById("mode-modal-title");
  const modeButtons = Array.from(modal.querySelectorAll("[data-mode-choice]"));
  const closeButtons = Array.from(modal.querySelectorAll("[data-mode-close]"));
  const exerciseLinks = Array.from(document.querySelectorAll("a[data-uebung-link]"));
  let pendingHref = null;

  const openModal = (href, title) => {
    pendingHref = href;
    if (titleEl && title) {
      titleEl.textContent = title;
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
    pendingHref = null;
  };

  // Central mode picker before navigation to any exercise page.
  exerciseLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const titleNode = link.querySelector(".btn-title");
      const title = titleNode ? titleNode.textContent.trim() : "Uebung starten";
      openModal(link.getAttribute("href"), title);
    });
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.modeChoice;
      if (!pendingHref || !mode) return;
      const url = new URL(pendingHref, window.location.href);
      url.searchParams.set("mode", mode);
      try {
        localStorage.setItem("uebungMode", mode);
      } catch (err) {
        // Ignore storage errors so navigation still works.
      }
      window.location.href = url.toString();
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal.querySelector(".mode-modal-backdrop")) {
      closeModal();
    }
  });
});
