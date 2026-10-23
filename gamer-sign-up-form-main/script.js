"use strict";

(() => {
  const form = document.getElementById("signup");
  const panel = document.querySelector(".panel");
  const submitBtn = document.getElementById("submit");
  const submitLabel = submitBtn.querySelector(".btn__label");
  const statusEl = document.getElementById("form-status");
  const successView = document.getElementById("success");
  const successTitle = document.getElementById("success-title");
  const successName = document.querySelector("[data-success-name]");

  const terms = document.getElementById("terms");
  const termsField = terms.closest(".field");
  const termsError = document.getElementById("terms-error");

  const meter = document.querySelector(".meter");
  const strengthEl = document.getElementById("password-strength");

  const readyEls = document.querySelectorAll("[data-ready]");
  const operatorEl = document.querySelector("[data-operator]");

  const SUBMIT_DELAY = 1800;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  const CALLSIGN_PATTERN = /^[A-Za-z0-9_-]+$/;
  const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

  const inputs = {
    callsign: document.getElementById("callsign"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    confirm: document.getElementById("confirm"),
  };

  /* Each rule returns null when valid, or [message, readout fault code]. */
  const rules = {
    callsign(value) {
      const v = value.trim();
      if (!v) return ["Enter a callsign", "Missing"];
      if (v.length < 3) return ["Use at least 3 characters", "Too short"];
      if (v.length > 20) return ["Use 20 characters or fewer", "Too long"];
      if (!CALLSIGN_PATTERN.test(v)) return ["Use letters, numbers, _ or - only", "Bad character"];
      return null;
    },
    email(value) {
      const v = value.trim();
      if (!v) return ["Enter your email", "Missing"];
      if (!EMAIL_PATTERN.test(v)) return ["Enter a valid email, like you@example.com", "Malformed"];
      return null;
    },
    password(value) {
      if (!value) return ["Enter a password", "Missing"];
      if (value.length < 8) return ["Use at least 8 characters", "Too short"];
      return null;
    },
    confirm(value) {
      if (!value) return ["Confirm your password", "Missing"];
      if (value !== inputs.password.value) return ["Passwords don't match", "Mismatch"];
      return null;
    },
  };

  /* Fields that have been checked once re-check on every keystroke. */
  const checked = new Set();
  let termsErrorShown = false;
  let locked = false;

  /* ---------- Readout (visual mirror) ---------- */
  function setRow(name, text, state) {
    const row = document.querySelector(`[data-row="${name}"]`);
    if (!row) return;
    row.querySelector(".readout__status").textContent = text;
    row.classList.remove("is-ok", "is-fault", "is-locked");
    if (state) row.classList.add(`is-${state}`);
  }

  function updateReadyCount() {
    const ready =
      Object.keys(inputs).filter((name) => checked.has(name) && !rules[name](inputs[name].value)).length +
      (terms.checked ? 1 : 0);
    readyEls.forEach((el) => {
      el.textContent = `${ready}/5 ready`;
      el.classList.toggle("is-complete", ready === 5);
    });
  }

  function updateOperatorName() {
    const value = inputs.callsign.value.trim();
    const valid = !rules.callsign(value);
    operatorEl.textContent = valid ? value : "Unassigned";
    operatorEl.classList.toggle("is-unassigned", !valid);
  }

  function updateTermsRow() {
    if (terms.checked) setRow("terms", "OK", "ok");
    else setRow("terms", "Required", termsErrorShown ? "fault" : null);
  }

  /* ---------- Field state ---------- */
  function describe(name, hasError) {
    const input = inputs[name];
    const ids = [];
    const hint = document.getElementById(`${name}-hint`);
    if (hint && !hasError) ids.push(hint.id);
    if (hasError) ids.push(`${name}-error`);
    if (name === "password" && strengthEl.textContent) ids.push(strengthEl.id);
    if (ids.length) input.setAttribute("aria-describedby", ids.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  function validateField(name) {
    const input = inputs[name];
    const field = input.closest(".field");
    const error = document.getElementById(`${name}-error`);
    const hint = document.getElementById(`${name}-hint`);
    const result = rules[name](input.value);

    field.classList.toggle("is-invalid", Boolean(result));
    field.classList.toggle("is-valid", !result);
    input.setAttribute("aria-invalid", String(Boolean(result)));

    if (result) {
      error.querySelector(".field__error-text").textContent = result[0];
      error.hidden = false;
      if (hint) hint.hidden = true;
      setRow(name, result[1], "fault");
    } else {
      error.hidden = true;
      if (hint) hint.hidden = false;
      setRow(name, "OK", "ok");
    }

    describe(name, Boolean(result));
    updateReadyCount();
    return !result;
  }

  /* ---------- Password strength ---------- */
  function scorePassword(value) {
    if (!value) return 0;
    if (value.length < 8) return 1;
    let score = 1; // 8 or more characters
    if (value.length >= 12) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(score, 4);
  }

  let currentLevel = 0;
  function updateStrength() {
    const level = scorePassword(inputs.password.value);
    meter.dataset.level = level;
    if (level === currentLevel) return; // only touch the live region when the level changes
    currentLevel = level;
    strengthEl.dataset.level = level;
    strengthEl.innerHTML = level
      ? `<span class="sr-only">Password strength: </span>${STRENGTH_LABELS[level]}`
      : "";
    describe("password", !document.getElementById("password-error").hidden);
  }

  /* ---------- Announcements ---------- */
  let announceTimer;
  function announce(message) {
    statusEl.textContent = "";
    clearTimeout(announceTimer);
    // Clearing first lets a repeated message be read again.
    announceTimer = setTimeout(() => { statusEl.textContent = message; }, 100);
  }

  function shake() {
    panel.classList.remove("is-shaking");
    void panel.offsetWidth; // restart the animation
    panel.classList.add("is-shaking");
  }
  panel.addEventListener("animationend", () => panel.classList.remove("is-shaking"));

  /* ---------- Events ---------- */
  Object.entries(inputs).forEach(([name, input]) => {
    input.addEventListener("blur", () => {
      if (locked) return;
      // A field is checked when it loses focus with something in it.
      if (input.value !== "") {
        checked.add(name);
        validateField(name);
      }
    });

    input.addEventListener("input", () => {
      if (name === "callsign") updateOperatorName();
      if (name === "password") {
        updateStrength();
        if (checked.has("confirm")) validateField("confirm");
      }
      if (checked.has(name)) validateField(name);
    });
  });

  terms.addEventListener("change", () => {
    if (termsErrorShown) {
      termsErrorShown = false;
      termsError.hidden = true;
      termsField.classList.remove("is-invalid");
      terms.removeAttribute("aria-invalid");
      terms.removeAttribute("aria-describedby");
    }
    updateTermsRow();
    updateReadyCount();
  });

  function showTermsError() {
    termsErrorShown = true;
    termsError.hidden = false;
    termsField.classList.add("is-invalid");
    terms.setAttribute("aria-invalid", "true");
    terms.setAttribute("aria-describedby", termsError.id);
    updateTermsRow();
  }

  /* Show / hide password */
  const toggles = document.querySelectorAll(".field__toggle");
  function setRevealed(toggle, revealed) {
    const input = document.getElementById(toggle.getAttribute("aria-controls"));
    input.type = revealed ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(revealed));
  }
  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      if (locked) return;
      setRevealed(toggle, toggle.getAttribute("aria-pressed") !== "true");
    });
  });

  /* Submit */
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (locked) return;

    const invalid = [];
    Object.keys(inputs).forEach((name) => {
      checked.add(name);
      if (!validateField(name)) invalid.push(inputs[name]);
    });
    if (!terms.checked) {
      showTermsError();
      invalid.push(terms);
    }

    if (invalid.length) {
      invalid[0].focus();
      announce(`${invalid.length} ${invalid.length === 1 ? "field needs" : "fields need"} attention`);
      shake();
      return;
    }

    lockForm();
    announce("Transmitting");
    setTimeout(showSuccess, SUBMIT_DELAY);
  });

  function lockForm() {
    locked = true;
    toggles.forEach((toggle) => {
      setRevealed(toggle, false);
      toggle.disabled = true;
    });
    Object.values(inputs).forEach((input) => { input.readOnly = true; });
    terms.disabled = true;
    form.setAttribute("aria-busy", "true");
    submitBtn.setAttribute("aria-disabled", "true");
    submitBtn.classList.add("is-loading");
    submitLabel.textContent = "Transmitting";
  }

  function showSuccess() {
    // Keep the panel the same height on wide screens so the layout doesn't jump.
    if (window.matchMedia("(min-width: 72rem)").matches) {
      panel.style.minHeight = `${panel.offsetHeight}px`;
    }

    successName.textContent = inputs.callsign.value.trim();
    form.hidden = true;
    successView.hidden = false;
    successTitle.focus();

    ["callsign", "email", "password", "confirm", "terms"].forEach((name) => setRow(name, "Locked", "locked"));
    readyEls.forEach((el) => {
      el.textContent = "Provisioned";
      el.classList.add("is-complete");
    });
  }

  /* Initial state (handles values restored by the browser) */
  updateOperatorName();
  updateStrength();
  updateTermsRow();
  updateReadyCount();
})();
