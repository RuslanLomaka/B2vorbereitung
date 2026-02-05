function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("check-btn");
  if (!button) return;

  function extractSentence(el) {
    if (el.dataset.sentence) return el.dataset.sentence;
    const li = el.closest("li");
    if (!li) return "";
    let sentence = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        sentence += node.textContent;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "INPUT") {
        sentence += node.dataset.answer || "";
        return;
      }
      if (node.tagName === "BR") {
        sentence += " ";
        return;
      }
      node.childNodes.forEach(walk);
    };
    li.childNodes.forEach(walk);
    return sentence.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  }

  button.addEventListener("click", () => {
    const targets = Array.from(document.querySelectorAll("[data-answer]"));
    const results = document.getElementById("results");
    const resultsList = document.getElementById("results-list");
    const scoreEl = document.getElementById("score");
    let correct = 0;

    resultsList.innerHTML = "";

    const groups = new Map();
    targets.forEach((el, idx) => {
      const li = el.closest("li");
      const key = li || el;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          items: [],
          label: li ? `Satz ${groups.size + 1}` : el.dataset.label || `Frage ${idx + 1}`,
        });
      }
      groups.get(key).items.push(el);
    });

    groups.forEach((group) => {
      const sentence = extractSentence(group.key);
      let groupOk = true;
      const parts = group.items.map((el, idx) => {
        const expected = el.dataset.answer || "";
        const label = el.dataset.label || `Teil ${idx + 1}`;
        let actual = "";

        if (el.tagName === "INPUT") {
          actual = el.value;
        } else {
          const checked = el.querySelector("input:checked");
          actual = checked ? checked.value : "";
        }

        const ok = normalizeText(expected) === normalizeText(actual);
        if (!ok) groupOk = false;
        return { label, actual, expected, ok };
      });

      if (groupOk) correct += 1;

      const item = document.createElement("div");
      item.className = `result-item ${groupOk ? "good" : "bad"}`;
      item.innerHTML = `
        <div>
          <span class="tag ${groupOk ? "good" : "bad"}">${groupOk ? "Richtig" : "Fehler"}</span>
          <strong>${group.label}</strong>
        </div>
        <div class="muted"><strong>Satz:</strong> ${sentence || "(kein Satz gefunden)"}</div>
        ${parts
          .map((part) => {
            if (part.ok) {
              return `
                <div class="part part-good">
                  <strong>${part.label}:</strong> Deine Antwort: ${part.actual || "(leer)"} ist korrekt.
                </div>`;
            }
            return `
              <div class="part part-bad">
                <strong>${part.label}:</strong> Deine Antwort: ${part.actual || "(leer)"}
              </div>
              <div class="part part-bad">
                <strong>${part.label}:</strong> Korrekt: ${part.expected}
              </div>`;
          })
          .join("")}
      `;
      resultsList.appendChild(item);
    });

    scoreEl.textContent = `Punkte: ${correct} von ${groups.size}`;
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth" });
  });
});
