document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("journal-list");
  const empty = document.getElementById("journal-empty");
  if (!list || !empty) return;

  let entries = [];
  try {
    const raw = localStorage.getItem("uebungAttempts");
    entries = raw ? JSON.parse(raw) : [];
  } catch (err) {
    entries = [];
  }

  if (!entries.length) {
    empty.hidden = false;
    return;
  }

  entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const name = entry.name || "Unbekannt";
      const date = entry.datetime || "-";
      const score = entry.score || "-";
      const mode = entry.mode || "-";
      const path = entry.path || "-";
      const title = entry.title || "Uebung";
      const id = entry.id;
      const link =
        id && path
          ? (() => {
              const url = new URL(path, window.location.href);
              url.searchParams.set("attemptId", id);
              url.searchParams.set("view", "1");
              return url.toString();
            })()
          : "";
      const retryLink =
        path
          ? (() => {
              const url = new URL(path, window.location.href);
              return url.toString();
            })()
          : "";
      const card = document.createElement("div");
      card.className = "journal-entry";
      card.innerHTML = `
        <div class="journal-row">
          <strong>${name}</strong>
          <span class="muted">${date}</span>
        </div>
        <div class="journal-row">
          <span>Ergebnis: ${score}</span>
          <span>Modus: ${mode}</span>
        </div>
        <div class="muted journal-path">${title}</div>
        <div class="journal-actions">
          ${link ? `<a class="btn btn-small" href="${link}">Ergebnis ansehen</a>` : ""}
          ${retryLink ? `<a class="btn btn-small" href="${retryLink}">Uebung erneut</a>` : ""}
        </div>
      `;
      list.appendChild(card);
    });
});
