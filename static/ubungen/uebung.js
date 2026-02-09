function normalizeSoft(text) {
    return text
      .toLowerCase()
      .replace(/[\u00e4\u00f6\u00fc]/g, (ch) => ({ "\u00e4": "a", "\u00f6": "o", "\u00fc": "u" }[ch]))
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeHard(text) {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function isFlexibleMatch(expected, actual) {
    const normExpected = normalizeSoft(expected);
    const normActual = normalizeSoft(actual);

    if (normExpected === normActual) return true;
    if (!normExpected || !normActual) return false;

    const expectedLen = normExpected.length;
    const actualLen = normActual.length;

    if (actualLen === expectedLen) {
      let mismatchIndex = -1;
      for (let i = 0; i < expectedLen; i += 1) {
        if (normExpected[i] !== normActual[i]) {
          if (mismatchIndex !== -1) return false;
          mismatchIndex = i;
        }
      }
      return mismatchIndex !== -1 && mismatchIndex !== expectedLen - 1;
    }

    if (actualLen === expectedLen - 1) {
      let skipped = false;
      let i = 0;
      let j = 0;
      while (i < expectedLen && j < actualLen) {
        if (normExpected[i] === normActual[j]) {
          i += 1;
          j += 1;
          continue;
        }
        if (skipped) return false;
        if (i === expectedLen - 1) return false;
        skipped = true;
        i += 1;
      }
      if (i === expectedLen - 1 && j === actualLen) return false;
      return true;
    }

    return false;
  }

  function isStrictMatch(expected, actual) {
    const normExpected = normalizeHard(expected);
    const normActual = normalizeHard(actual);
    return normExpected === normActual;
  }

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

  function getAllTargets() {
    return Array.from(document.querySelectorAll("[data-answer]"));
  }

  function collectAnswers() {
    return getAllTargets().map((el) => {
      if (el.tagName === "INPUT") return el.value;
      const checked = el.querySelector("input:checked");
      return checked ? checked.value : "";
    });
  }

  function evaluateItem(item, match) {
    const parts = Array.from(item.querySelectorAll("[data-answer]"));
    if (!parts.length) return false;
    return parts.every((el) => {
      const expected = el.dataset.answer || "";
      let actual = "";
      if (el.tagName === "INPUT") {
        actual = el.value;
      } else {
        const checked = el.querySelector("input:checked");
        actual = checked ? checked.value : "";
      }
      return match(expected, actual);
    });
  }

  function isItemComplete(item) {
    const answers = Array.from(item.querySelectorAll("[data-answer]"));
    if (!answers.length) return true;
    return answers.every((el) => {
      if (el.tagName === "INPUT") {
        return el.value.trim().length > 0;
      }
      const checked = el.querySelector("input:checked");
      return Boolean(checked && checked.value);
    });
  }

  function applyAttempt(entry) {
    const targets = getAllTargets();
    const answers = Array.isArray(entry.answers) ? entry.answers : [];
    targets.forEach((el, idx) => {
      const value = answers[idx] ?? "";
      if (el.tagName === "INPUT") {
        el.value = value;
        el.disabled = true;
        return;
      }
      const options = Array.from(el.querySelectorAll("input"));
      options.forEach((option) => {
        option.checked = option.value === value;
        option.disabled = true;
      });
    });
  }

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("check-btn");
  if (!button) return;

  const modeChooser = document.getElementById("mode-chooser");
  const modeStatus = document.getElementById("mode-status");
  const modeButtons = modeChooser ? Array.from(modeChooser.querySelectorAll("[data-mode]")) : [];
  let currentMode = null;
  const isValidMode = (value) => value === "soft" || value === "hard";
  const listItems = Array.from(document.querySelectorAll("ol > li"));
  const hardState = {
    active: false,
    items: [],
    index: 0,
    nextButton: null,
    prevButton: null,
    controls: null,
    checked: false,
  };
  const progressState = { wrapper: null, fill: null, label: null, segments: [] };
  const solutionDetails = Array.from(document.querySelectorAll("details"));
  let saveSection = null;
  let warningEl = null;
  let completionListenersBound = false;
  let hardNavBound = false;
  let copyButton = null;
  const buttonHome = { parent: button.parentNode, nextSibling: button.nextSibling };
  let lastFocusedInput = null;
  const resultsSection = button.closest("section");
  const params = new URLSearchParams(window.location.search);
  const viewAttemptId = params.get("attemptId");
  const viewMode = params.get("view") === "1" && viewAttemptId;
  const exerciseTitleEl = document.querySelector("h1");
  const exerciseTitle = exerciseTitleEl ? exerciseTitleEl.textContent.trim() : "Uebung";
  let saveModal = null;
  let checkModal = null;
  let deleteModal = null;
  let checkPending = false;

  button.textContent = "Überprüfen";

  if (!viewMode) {
    document.body.classList.add("soft-mode");
  }

  const setPracticeEnabled = (enabled) => {
    const inputs = Array.from(document.querySelectorAll("[data-answer]"));
    inputs.forEach((el) => {
      if (el.tagName === "INPUT") {
        el.disabled = !enabled;
      }
      const radios = el.querySelectorAll ? el.querySelectorAll("input") : [];
      radios.forEach((radio) => {
        radio.disabled = !enabled;
      });
    });
    button.disabled = !enabled;
  };

  const lockInputs = () => {
    const inputs = Array.from(document.querySelectorAll("[data-answer]"));
    inputs.forEach((el) => {
      if (el.tagName === "INPUT") {
        el.disabled = true;
      }
      const radios = el.querySelectorAll ? el.querySelectorAll("input") : [];
      radios.forEach((radio) => {
        radio.disabled = true;
      });
    });
  };

  const ensureProgressBar = () => {
    if (progressState.wrapper) return progressState;
    const main = document.querySelector("main");
    if (!main) return progressState;
    const wrapper = document.createElement("div");
    wrapper.className = "progress-wrapper";
    const label = document.createElement("div");
    label.className = "progress-label muted";
    label.textContent = "Fortschritt: 0/0";
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    bar.appendChild(fill);
    wrapper.appendChild(label);
    wrapper.appendChild(bar);
    main.insertAdjacentElement("afterbegin", wrapper);
    progressState.wrapper = wrapper;
    progressState.fill = fill;
    progressState.label = label;
    return progressState;
  };

  const ensureWarning = () => {
    if (warningEl) return warningEl;
    warningEl = document.createElement("p");
    warningEl.className = "warning-text";
    warningEl.hidden = true;
    warningEl.textContent =
      "Du hast noch leere Felder. Bitte fuelle alles aus, um deine Leistung zu pruefen.";
    return warningEl;
  };

  const insertAtCursor = (input, value) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = `${before}${value}${after}`;
    const nextPos = start + value.length;
    input.setSelectionRange(nextPos, nextPos);
    input.focus();
  };

  const buildResultsText = () => {
    const lines = [];
    const title = exerciseTitle || "Uebung";
    const modeLabel = currentMode || (hardState.active ? "hard" : "soft");
    const match = modeLabel === "hard" ? isStrictMatch : isFlexibleMatch;
    lines.push(`Test: ${title}`);
    lines.push(`Mode: ${modeLabel}`);
    lines.push("");
    const targets = getAllTargets();
    const groups = new Map();
    targets.forEach((el, idx) => {
      const li = el.closest("li");
      const key = li || el;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          items: [],
          label: li ? `Item ${groups.size + 1}` : el.dataset.label || `Item ${idx + 1}`,
        });
      }
      groups.get(key).items.push(el);
    });
    let correctGroups = 0;
    groups.forEach((group) => {
      const sentence = extractSentence(group.key);
      let groupOk = true;
      lines.push(`${group.label}:`);
      lines.push(`Sentence: ${sentence || "(kein Satz gefunden)"}`);
      group.items.forEach((el, idx) => {
        const expected = el.dataset.answer || "";
        const label = el.dataset.label || `Teil ${idx + 1}`;
        let actual = "";
        if (el.tagName === "INPUT") {
          actual = el.value;
        } else {
          const checked = el.querySelector("input:checked");
          actual = checked ? checked.value : "";
        }
        const ok = match(expected, actual);
        if (!ok) groupOk = false;
        lines.push(
          `${label} | Your answer: ${actual || "(empty)"} | Correct: ${expected || "(empty)"} | Result: ${
            ok ? "correct" : "wrong"
          }`
        );
      });
      if (groupOk) correctGroups += 1;
      lines.push("");
    });
    const totalGroups = groups.size;
    const accuracy = totalGroups ? Math.round((correctGroups / totalGroups) * 100) : 0;
    lines.push(`Score: ${correctGroups}/${totalGroups}`);
    lines.push(`Accuracy: ${accuracy}%`);
    lines.push(
      "Prompt: I have completed a German test: " +
        `${title}.\n\n` +
        "My score is " +
        `${correctGroups}/${totalGroups} (${accuracy}%).\n\n` +
        "Please analyze my results.\n\n" +
        "First:\n" +
        "- Summarize what I did well.\n" +
        "- If many sentences are correct, describe them as my strong side.\n\n" +
        "Then write: BUT\n\n" +
        "After BUT:\n" +
        "- Look at my mistakes.\n" +
        "- Find patterns (same type of mistake).\n" +
        "- Group similar mistakes together.\n" +
        "- Explain each mistake type only once.\n" +
        "- If a mistake appears many times, say that I should pay special attention to it.\n" +
        "- If mistakes are different (different grammar topics), explain each one briefly.\n\n" +
        "Do not analyze every sentence separately if the mistakes are the same.\n\n" +
        "For each mistake type:\n" +
        "- Explain the problem in very simple German (A2)\n" +
        "- Give the correct rule (short)\n" +
        "- Give one simple example\n\n" +
        "At the end:\n" +
        "- What grammar I should practice now\n" +
        "- Simple tips for learning\n\n" +
        "Important:\n" +
        "- Write only in very easy German (A2 level)\n" +
        "- Use short sentences\n" +
        "- Be positive and encouraging\n" +
        "- Do not overthink or invent complex linguistic analysis"
    );
    return lines.join("\n");
  };

  const ensureCopyButton = () => {
    if (!resultsSection) return null;
    if (document.getElementById("copy-results-btn")) {
      return document.getElementById("copy-results-btn");
    }
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn";
    copyButton.id = "copy-results-btn";
    copyButton.textContent = "Kopiere Ergebnisse/Report";
    copyButton.addEventListener("click", async () => {
      const text = buildResultsText();
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (err) {
          copied = false;
        }
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          copied = document.execCommand("copy");
        } catch (err) {
          copied = false;
        }
        document.body.removeChild(textarea);
      }
      const original = copyButton.textContent;
      copyButton.textContent = copied ? "Copied!" : "Copy failed";
      window.setTimeout(() => {
        copyButton.textContent = original;
      }, 1500);
    });
    copyButton.hidden = true;
    resultsSection.appendChild(copyButton);
    return copyButton;
  };

  const ensureSpecialKeys = () => {
    if (viewMode) return;
    if (document.getElementById("umlaut-keys")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const wrapper = document.createElement("div");
    wrapper.className = "umlaut-panel";
    wrapper.id = "umlaut-keys";
    wrapper.innerHTML = `
      <p class="muted umlaut-hint">Tipp: Nutze deine Tastatur. Druecke 1-4 fuer Sonderzeichen.</p>
      <div class="umlaut-keys">
        <button class="umlaut-key" type="button" data-char="ä" data-digit="1">
          <span class="umlaut-letter">ä</span>
          <span class="umlaut-digit">1</span>
        </button>
        <button class="umlaut-key" type="button" data-char="ö" data-digit="2">
          <span class="umlaut-letter">ö</span>
          <span class="umlaut-digit">2</span>
        </button>
        <button class="umlaut-key" type="button" data-char="ü" data-digit="3">
          <span class="umlaut-letter">ü</span>
          <span class="umlaut-digit">3</span>
        </button>
        <button class="umlaut-key" type="button" data-char="ß" data-digit="4">
          <span class="umlaut-letter">ß</span>
          <span class="umlaut-digit">4</span>
        </button>
      </div>
    `;
    main.insertAdjacentElement("afterbegin", wrapper);
    wrapper.querySelectorAll(".umlaut-key").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = lastFocusedInput;
        if (!target || target.disabled) return;
        const ch = btn.dataset.char;
        if (!ch) return;
        insertAtCursor(target, ch);
      });
    });
  };

  const focusFirstEmptyField = (item) => {
    if (!item) return false;
    const inputs = Array.from(item.querySelectorAll("input[type=\"text\"][data-answer]"));
    const target = inputs.find((input) => input.value.trim().length === 0);
    if (target) {
      target.focus();
      return true;
    }
    if (inputs.length) {
      inputs[0].focus();
      return true;
    }
    return false;
  };

  const applyCheckSegments = (match) => {
    if (!hardState.active || !progressState.segments.length) return;
    hardState.checked = true;
    let completed = 0;
    hardState.items.forEach((item, idx) => {
      const complete = isItemComplete(item);
      if (complete) completed += 1;
      const ok = evaluateItem(item, match);
      const segment = progressState.segments[idx];
      if (!segment) return;
      segment.classList.toggle("is-complete", complete);
      segment.classList.toggle("is-correct", ok);
      segment.classList.toggle("is-wrong", !ok);
      segment.classList.toggle("is-active", idx === hardState.index);
    });
    setProgress(completed, hardState.items.length);
  };

  const buildSegments = () => {
    if (!progressState.wrapper || progressState.segments.length) return;
    const bar = progressState.wrapper.querySelector(".progress-bar");
    if (!bar) return;
    bar.innerHTML = "";
    progressState.fill = null;
    const container = document.createElement("div");
    container.className = "progress-segments";
    progressState.segments = hardState.items.map(() => {
      const segment = document.createElement("span");
      segment.className = "progress-segment";
      segment.addEventListener("click", () => {
        if (!hardState.active) return;
        const index = progressState.segments.indexOf(segment);
        if (index === -1) return;
        showHardItem(index);
        if (warningEl) warningEl.hidden = true;
        focusFirstEmptyField(hardState.items[hardState.index]);
      });
      container.appendChild(segment);
      return segment;
    });
    bar.appendChild(container);
  };

  const setProgress = (current, total) => {
    const safeTotal = total || 1;
    const percent = Math.round((current / safeTotal) * 100);
    if (progressState.label) {
      progressState.label.textContent = `Fortschritt: ${current}/${total}`;
    }
    if (progressState.fill) {
      progressState.fill.style.width = `${percent}%`;
    }
  };

  const updateSegments = () => {
    if (!hardState.active || !progressState.segments.length) return;
    if (hardState.checked) return;
    let completed = 0;
    hardState.items.forEach((item, idx) => {
      const complete = isItemComplete(item);
      if (complete) completed += 1;
      const segment = progressState.segments[idx];
      if (!segment) return;
      segment.classList.toggle("is-complete", complete);
      segment.classList.toggle("is-active", idx === hardState.index);
    });
    setProgress(completed, hardState.items.length);
  };

  const shuffleItems = (items) => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const setItemVisibility = (item, visible) => {
    item.style.display = visible ? "" : "none";
  };

  const showHardItem = (index) => {
    hardState.items.forEach((item, idx) => setItemVisibility(item, idx === index));
    hardState.index = index;
    if (hardState.prevButton) {
      hardState.prevButton.disabled = index === 0;
    }
    if (hardState.nextButton) {
      hardState.nextButton.disabled = index === hardState.items.length - 1;
      hardState.nextButton.textContent =
        index === hardState.items.length - 1 ? "Letzter Satz" : "Naechster Satz";
    }
    const shouldShowCheck = !hardState.active || index === hardState.items.length - 1;
    button.hidden = !shouldShowCheck;
    button.style.display = shouldShowCheck ? "" : "none";
    updateSegments();
  };

  const ensurePrevButton = () => {
    if (hardState.prevButton) {
      hardState.prevButton.hidden = false;
      return hardState.prevButton;
    }
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "btn";
    prevButton.id = "prev-btn";
    prevButton.textContent = "Vorheriger Satz";
    prevButton.addEventListener("click", () => {
      if (!hardState.active || prevButton.disabled) return;
      if (hardState.index === 0) return;
      showHardItem(hardState.index - 1);
      if (warningEl) warningEl.hidden = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    hardState.prevButton = prevButton;
    return prevButton;
  };

  const ensureNextButton = () => {
    if (hardState.nextButton) {
      hardState.nextButton.hidden = false;
      return hardState.nextButton;
    }
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "btn";
    nextButton.id = "next-btn";
    nextButton.textContent = "Naechster Satz";
    nextButton.addEventListener("click", () => {
      if (!hardState.active || nextButton.disabled) return;
      if (hardState.index >= hardState.items.length - 1) return;
      showHardItem(hardState.index + 1);
      if (warningEl) warningEl.hidden = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    hardState.nextButton = nextButton;
    return nextButton;
  };

  const ensureControlsContainer = () => {
    if (hardState.controls) return hardState.controls;
    const container = document.createElement("div");
    container.className = "hard-controls";
    const warning = ensureWarning();
    const prevButton = ensurePrevButton();
    const nextButton = ensureNextButton();
    container.appendChild(warning);
    container.appendChild(prevButton);
    container.appendChild(nextButton);
    container.appendChild(button);
    const list = document.querySelector("ol");
    if (list) {
      list.insertAdjacentElement("afterend", container);
    }
    hardState.controls = container;
    return container;
  };

  const restoreCheckButtonHome = () => {
    if (!buttonHome.parent) return;
    if (buttonHome.nextSibling && buttonHome.nextSibling.parentNode === buttonHome.parent) {
      buttonHome.parent.insertBefore(button, buttonHome.nextSibling);
    } else {
      buttonHome.parent.appendChild(button);
    }
    button.hidden = false;
  };

  // Hard mode shows one shuffled sentence at a time and unlocks "next" after checking.
  const startHardMode = () => {
    if (!listItems.length) return;
    hardState.active = true;
    hardState.checked = false;
    hardState.items = shuffleItems(listItems);
    hardState.index = 0;
    ensureControlsContainer();
    button.hidden = true;
    button.style.display = "none";
    if (resultsSection) resultsSection.classList.add("hard-hidden");
    showHardItem(0);
    ensureProgressBar();
    if (progressState.wrapper) progressState.wrapper.hidden = false;
    buildSegments();
    updateSegments();
    solutionDetails.forEach((detail) => {
      detail.hidden = true;
    });
    if (!completionListenersBound) {
      completionListenersBound = true;
      const inputs = Array.from(document.querySelectorAll("[data-answer]"));
      inputs.forEach((el) => {
        if (el.tagName === "INPUT") {
          el.addEventListener("input", updateSegments);
          el.addEventListener("keydown", (event) => {
            if (!hardState.active) return;
            const isForwardKey = event.key === "Enter" || (event.key === "Tab" && !event.shiftKey);
            if (!isForwardKey) return;
            event.preventDefault();
            const currentItem = el.closest("li");
            if (!currentItem) return;
            if (!isItemComplete(currentItem)) {
              focusFirstEmptyField(currentItem);
              return;
            }
            if (hardState.index < hardState.items.length - 1) {
              showHardItem(hardState.index + 1);
              focusFirstEmptyField(hardState.items[hardState.index]);
              return;
            }
            button.focus();
          });
          el.addEventListener("keydown", (event) => {
            if (event.ctrlKey || event.altKey || event.metaKey) return;
            if (!["1", "2", "3", "4"].includes(event.key)) return;
            const map = { "1": "ä", "2": "ö", "3": "ü", "4": "ß" };
            const ch = map[event.key];
            if (!ch) return;
            event.preventDefault();
            insertAtCursor(el, ch);
          });
          el.addEventListener("focus", () => {
            lastFocusedInput = el;
          });
        }
        const radios = el.querySelectorAll ? el.querySelectorAll("input") : [];
        radios.forEach((radio) => radio.addEventListener("change", updateSegments));
      });
    }
    if (!hardNavBound) {
      hardNavBound = true;
      document.addEventListener("keydown", (event) => {
        if (!hardState.active) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const target = event.target;
        if (target && target.closest) {
          const input = target.closest("input[type=\"text\"], textarea");
          if (input) {
            const value = input.value ?? "";
            const start = input.selectionStart ?? 0;
            const end = input.selectionEnd ?? start;
            const atStart = start === 0 && end === 0;
            const atEnd = start === value.length && end === value.length;
            if (event.key === "ArrowLeft" && !atStart) return;
            if (event.key === "ArrowRight" && !atEnd) return;
          } else if (target.closest("[contenteditable=\"true\"]")) {
            return;
          }
        }
        const nextIndex = hardState.index + (event.key === "ArrowLeft" ? -1 : 1);
        if (nextIndex < 0 || nextIndex >= hardState.items.length) return;
        event.preventDefault();
        showHardItem(nextIndex);
        if (warningEl) warningEl.hidden = true;
        window.scrollTo({ top: 0, behavior: "smooth" });
        focusFirstEmptyField(hardState.items[hardState.index]);
      });
    }
    ensureWarning();
    focusFirstEmptyField(hardState.items[hardState.index]);
  };

  const stopHardMode = () => {
    if (!hardState.active) return;
    hardState.active = false;
    hardState.checked = false;
    listItems.forEach((item) => setItemVisibility(item, true));
    if (hardState.controls) {
      hardState.controls.remove();
      hardState.controls = null;
    }
    if (hardState.nextButton) hardState.nextButton.hidden = true;
    if (hardState.prevButton) hardState.prevButton.hidden = true;
    restoreCheckButtonHome();
    if (resultsSection) resultsSection.classList.remove("hard-hidden");
    if (progressState.wrapper) progressState.wrapper.hidden = true;
    solutionDetails.forEach((detail) => {
      detail.hidden = false;
    });
    if (warningEl) warningEl.hidden = true;
  };

  const ensureSaveSection = () => {
    if (viewMode) return null;
    if (saveSection) return saveSection;
    const results = document.getElementById("results");
    if (!results) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "save-attempt";
    wrapper.innerHTML = `
      <p class="muted">Speichere dein Ergebnis, damit du spaeter deinen Fortschritt siehst.</p>
      <div class="save-actions">
        <button class="btn" type="button" id="save-attempt-btn">Versuch speichern</button>
        <span class="muted" id="save-attempt-status"></span>
      </div>
    `;
    results.appendChild(wrapper);
    saveSection = wrapper;
    return wrapper;
  };

  const ensureSaveModal = () => {
    if (saveModal) return saveModal;
    const modal = document.createElement("div");
    modal.className = "save-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="save-modal-backdrop"></div>
      <div class="save-modal-card" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
        <h2 class="save-modal-title" id="save-modal-title">Versuch speichern</h2>
        <div class="save-modal-summary">
          <div><strong>Uebung:</strong> <span id="save-modal-title-text"></span></div>
          <div><strong>Datum:</strong> <span id="save-modal-date"></span></div>
          <div><strong>Ergebnis:</strong> <span id="save-modal-score"></span></div>
        </div>
        <label class="save-label" for="save-modal-name">Dein Name</label>
        <input id="save-modal-name" type="text" placeholder="Name eingeben" />
        <div class="save-modal-actions">
          <button class="btn" type="button" id="save-modal-confirm">Speichern</button>
          <button class="btn-link save-modal-cancel" type="button" id="save-modal-cancel">Abbrechen</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    saveModal = modal;
    const cancel = modal.querySelector("#save-modal-cancel");
    const backdrop = modal.querySelector(".save-modal-backdrop");
    [cancel, backdrop].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", () => {
        modal.hidden = true;
        document.body.style.overflow = "";
      });
    });
    return modal;
  };

  const ensureCheckModal = () => {
    if (checkModal) return checkModal;
    const modal = document.createElement("div");
    modal.className = "check-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="check-modal-backdrop"></div>
      <div class="check-modal-card" role="dialog" aria-modal="true" aria-labelledby="check-modal-title">
        <h2 class="check-modal-title" id="check-modal-title">Jetzt überprüfen?</h2>
        <p class="muted">
          Nach dem Überprüfen kannst du deine Antworten nicht mehr ändern.
        </p>
        <div class="check-modal-actions">
          <button class="btn" type="button" id="check-modal-confirm">Überprüfen</button>
          <button class="btn-link check-modal-cancel" type="button" id="check-modal-cancel">Abbrechen</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    checkModal = modal;
    const cancel = modal.querySelector("#check-modal-cancel");
    const backdrop = modal.querySelector(".check-modal-backdrop");
    [cancel, backdrop].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", () => {
        modal.hidden = true;
        document.body.style.overflow = "";
        checkPending = false;
      });
    });
    return modal;
  };

  const ensureDeleteModal = () => {
    if (deleteModal) return deleteModal;
    const modal = document.createElement("div");
    modal.className = "save-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="save-modal-backdrop"></div>
      <div class="save-modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
        <h2 class="save-modal-title" id="delete-modal-title">Eintrag loeschen</h2>
        <p class="muted" id="delete-modal-owner"></p>
        <p class="muted">Tippe den Namen exakt wie gespeichert, um die Loeschung abzuschliessen.</p>
        <label class="save-label" for="delete-modal-name">Name</label>
        <input id="delete-modal-name" type="text" placeholder="Name exakt eingeben" />
        <p class="warning-text" id="delete-modal-status" hidden>Name stimmt nicht.</p>
        <div class="save-modal-actions">
          <button class="btn" type="button" id="delete-modal-confirm">Eintrag loeschen</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const backdrop = modal.querySelector(".save-modal-backdrop");
    [backdrop].forEach((el) => {
      if (!el) return;
      el.addEventListener("click", () => {
        modal.hidden = true;
        document.body.style.overflow = "";
      });
    });
    deleteModal = modal;
    return modal;
  };

  const openCheckModal = (onConfirm) => {
    if (checkPending) return;
    checkPending = true;
    const modal = ensureCheckModal();
    if (!modal) return;
    const confirm = modal.querySelector("#check-modal-confirm");
    const handler = () => {
      modal.hidden = true;
      document.body.style.overflow = "";
      checkPending = false;
      if (typeof onConfirm === "function") onConfirm();
      confirm.removeEventListener("click", handler);
    };
    if (confirm) {
      confirm.addEventListener("click", handler);
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const openDeleteModal = ({ expectedName, onConfirm }) => {
    const modal = ensureDeleteModal();
    if (!modal) return;
    const nameInput = modal.querySelector("#delete-modal-name");
    const status = modal.querySelector("#delete-modal-status");
    const ownerText = modal.querySelector("#delete-modal-owner");
    const confirm = modal.querySelector("#delete-modal-confirm");
    if (nameInput) nameInput.value = "";
    if (status) status.hidden = true;
    if (ownerText) {
      ownerText.textContent = `Dieser Eintrag wurde von "${expectedName}" erstellt.`;
    }
    const handler = () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (name !== expectedName) {
        if (status) status.hidden = false;
        if (nameInput) nameInput.focus();
        return;
      }
      modal.hidden = true;
      document.body.style.overflow = "";
      if (typeof onConfirm === "function") onConfirm();
      confirm.removeEventListener("click", handler);
    };
    if (confirm) {
      confirm.addEventListener("click", handler);
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const openSaveModal = ({ scoreText, onConfirm }) => {
    const modal = ensureSaveModal();
    if (!modal) return;
    const titleEl = modal.querySelector("#save-modal-title-text");
    const dateEl = modal.querySelector("#save-modal-date");
    const scoreEl = modal.querySelector("#save-modal-score");
    const nameInput = modal.querySelector("#save-modal-name");
    const confirm = modal.querySelector("#save-modal-confirm");
    const nowText = new Date().toLocaleString();
    if (titleEl) titleEl.textContent = exerciseTitle;
    if (dateEl) dateEl.textContent = nowText;
    if (scoreEl) scoreEl.textContent = scoreText;
    if (nameInput) nameInput.value = "";
    const handler = () => {
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) {
        if (nameInput) nameInput.focus();
        return;
      }
      modal.hidden = true;
      document.body.style.overflow = "";
      if (typeof onConfirm === "function") onConfirm({ nowText, name });
      confirm.removeEventListener("click", handler);
    };
    if (confirm) {
      confirm.addEventListener("click", handler);
    }
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const findFirstIncompleteIndex = () => {
    for (let i = 0; i < hardState.items.length; i += 1) {
      if (!isItemComplete(hardState.items[i])) return i;
    }
    return -1;
  };

  const handleSaveAttempt = (scoreText) => {
    const wrapper = ensureSaveSection();
    if (!wrapper) return;
    const status = wrapper.querySelector("#save-attempt-status");
    const buttonEl = wrapper.querySelector("#save-attempt-btn");
    if (!status || !buttonEl) return;
    if (wrapper.dataset.bound === "true") return;
    wrapper.dataset.bound = "true";
    buttonEl.addEventListener("click", () => {
      openSaveModal({
        scoreText,
        onConfirm: ({ nowText, name }) => {
          const entry = {
            id: Date.now(),
            name,
            datetime: nowText,
            score: scoreText,
            mode: "hard",
            path: window.location.pathname,
            title: exerciseTitle,
            answers: collectAnswers(),
          };
          try {
            const raw = localStorage.getItem("uebungAttempts");
            const data = raw ? JSON.parse(raw) : [];
            data.push(entry);
            localStorage.setItem("uebungAttempts", JSON.stringify(data));
            status.textContent = "Gespeichert.";
          } catch (err) {
            status.textContent = "Speichern nicht moeglich.";
          }
        },
      });
    });
  };

  const applyMode = (mode, buttonEl = null) => {
    if (!isValidMode(mode)) return;
    currentMode = mode;
    document.body.classList.toggle("soft-mode", currentMode === "soft");
    document.body.classList.toggle("hard-mode", currentMode === "hard");
    document.body.dataset.mode = currentMode;
    document.querySelectorAll("ol").forEach((list) => {
      list.classList.toggle("soft-spaced", currentMode === "soft");
    });
    if (modeButtons.length) {
      modeButtons.forEach((btn) => {
        const isSelected = buttonEl ? btn === buttonEl : btn.dataset.mode === mode;
        btn.classList.toggle("selected", isSelected);
        btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      });
    }
    if (modeStatus) {
      modeStatus.textContent =
        currentMode === "hard"
          ? "Hard-Modus aktiv: Umlaute muessen stimmen, Gross-/Kleinschreibung egal."
          : "Soft-Modus aktiv: Du kannst sofort pruefen und bekommst direkte Rueckmeldung.";
    }
    setPracticeEnabled(true);
    if (currentMode === "soft") {
      button.disabled = false;
    }
    if (currentMode === "hard") {
      startHardMode();
    } else {
      stopHardMode();
    }
  };

  // Mode comes from the topic-level chooser via URL or saved preference.
  const modeFromUrl = new URLSearchParams(window.location.search).get("mode");
  const modeFromStorage = (() => {
    try {
      return localStorage.getItem("uebungMode");
    } catch (err) {
      return null;
    }
  })();
  const initialMode = isValidMode(modeFromUrl)
    ? modeFromUrl
    : isValidMode(modeFromStorage)
      ? modeFromStorage
      : null;

  if (isValidMode(modeFromUrl)) {
    try {
      localStorage.setItem("uebungMode", modeFromUrl);
    } catch (err) {
      // Ignore storage errors so the exercise still works.
    }
  }

  if (!viewMode) {
    ensureSpecialKeys();
    }

  // Mode selection gates the exercise and controls the matching strictness.
  if (modeChooser && !viewMode) {
    setPracticeEnabled(false);
    if (modeStatus) {
      modeStatus.textContent = "Bitte waehle einen Modus, bevor du startest.";
    }

    modeButtons.forEach((modeButton) => {
      modeButton.addEventListener("click", () => {
        applyMode(modeButton.dataset.mode, modeButton);
      });
    });

    if (initialMode) {
      const matchingButton = modeButtons.find((btn) => btn.dataset.mode === initialMode);
      applyMode(initialMode, matchingButton || null);
    }
  } else if (initialMode && !viewMode) {
    applyMode(initialMode);
  } else if (!viewMode) {
    currentMode = "soft";
    document.body.classList.add("soft-mode");
    document.body.dataset.mode = "soft";
    document.querySelectorAll("ol").forEach((list) => {
      list.classList.add("soft-spaced");
    });
    button.disabled = false;
  }

  const runCheck = ({ skipWarnings = false, skipSave = false, applySegments = true } = {}) => {
    if (hardState.active && !skipWarnings) {
      const firstIncomplete = findFirstIncompleteIndex();
      if (firstIncomplete !== -1) {
        showHardItem(firstIncomplete);
        ensureWarning();
        warningEl.hidden = false;
        return;
      }
      if (warningEl) warningEl.hidden = true;
      openCheckModal(() => runCheck({ skipWarnings: true, skipSave, applySegments }));
      return;
    }

    const targets = getAllTargets();
    const results = document.getElementById("results");
    const resultsList = document.getElementById("results-list");
    const scoreEl = document.getElementById("score");
    let correct = 0;

    const match = currentMode === "hard" ? isStrictMatch : isFlexibleMatch;
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

        const ok = match(expected, actual);
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
    if (resultsSection) resultsSection.classList.remove("hard-hidden");
    results.hidden = false;
    if (copyButton) copyButton.hidden = false;
    results.scrollIntoView({ behavior: "smooth" });
    if (hardState.active && !skipSave) {
      // Hard mode shows results only after all fields are filled and enables saving.
      handleSaveAttempt(`${correct}/${groups.size}`);
    }
    if (hardState.active && applySegments) {
      applyCheckSegments(match);
      lockInputs();
    }
  };

  button.addEventListener("click", () => {
    runCheck();
  });

  copyButton = ensureCopyButton();

  if (viewMode) {
    let attempt = null;
    try {
      const raw = localStorage.getItem("uebungAttempts");
      const data = raw ? JSON.parse(raw) : [];
      attempt = data.find((item) => String(item.id) === String(viewAttemptId));
    } catch (err) {
      attempt = null;
    }
    if (attempt) {
      currentMode = attempt.mode === "hard" ? "hard" : "soft";
      document.body.classList.toggle("soft-mode", currentMode === "soft");
      document.body.classList.toggle("hard-mode", currentMode === "hard");
      document.querySelectorAll("ol").forEach((list) => {
        list.classList.toggle("soft-spaced", currentMode === "soft");
      });
      if (hardState.active) {
        stopHardMode();
      }
      listItems.forEach((item) => setItemVisibility(item, true));
      applyAttempt(attempt);
      if (resultsSection) resultsSection.classList.remove("hard-hidden");
      if (button) {
        button.disabled = true;
        button.hidden = true;
        button.style.display = "none";
      }
      const umlautPanel = document.getElementById("umlaut-keys");
      if (umlautPanel) umlautPanel.hidden = true;
      runCheck({ skipWarnings: true, skipSave: true, applySegments: true });
      if (resultsSection) {
        const retry = document.createElement("a");
        retry.className = "btn btn-retry";
        retry.textContent = "Uebung erneut starten";
        const url = new URL(window.location.href);
        url.searchParams.delete("attemptId");
        url.searchParams.delete("view");
        retry.setAttribute("href", url.toString());
        resultsSection.appendChild(retry);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-retry btn-delete";
        deleteBtn.type = "button";
        deleteBtn.textContent = "Eintrag im Journal loeschen";
        deleteBtn.addEventListener("click", () => {
          const expectedName = String(attempt.name || "Unbekannt");
          openDeleteModal({
            expectedName,
            onConfirm: () => {
              try {
                const raw = localStorage.getItem("uebungAttempts");
                const data = raw ? JSON.parse(raw) : [];
                const next = data.filter((item) => String(item.id) !== String(viewAttemptId));
                localStorage.setItem("uebungAttempts", JSON.stringify(next));
                const journalUrl = new URL("../journal.html", window.location.href);
                window.location.href = journalUrl.toString();
              } catch (err) {
                // Ignore deletion failures silently to avoid breaking the view page.
              }
            },
          });
        });
        resultsSection.appendChild(deleteBtn);
      }
    }
  }
});
