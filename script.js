(function () {
  var toggle = document.getElementById("osToggle");
  if (!toggle) {
    return;
  }

  var buttons = toggle.querySelectorAll(".os-btn");

  function detectOS() {
    var platform = navigator.platform || "";
    var userAgent = navigator.userAgent || "";

    if (/Mac|iPhone|iPod|iPad/.test(platform) || /Mac/.test(userAgent)) {
      return "mac";
    }

    return "win";
  }

  if (localStorage.getItem("cc-os") && !localStorage.getItem("cc-os-manual")) {
    localStorage.removeItem("cc-os");
  }

  var saved = localStorage.getItem("cc-os") || detectOS();

  function replaceModifierText(text, os) {
    if (!text) {
      return text;
    }

    if (os === "mac") {
      return text.replaceAll("Shift", "⇧").replaceAll("Alt", "⌥");
    }

    return text.replaceAll("⇧", "Shift").replaceAll("⌥", "Alt");
  }

  function applyOS(os) {
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.os === os);
      if (button.setAttribute) {
        button.setAttribute("aria-pressed", button.dataset.os === os ? "true" : "false");
      }
    });

    document.querySelectorAll(".keycap").forEach(function (keycap) {
      var text = keycap.textContent.trim();

      if (text === "Alt" || text === "⌥") {
        keycap.textContent = os === "mac" ? "⌥" : "Alt";
      } else if (text === "Shift" || text === "⇧") {
        keycap.textContent = os === "mac" ? "⇧" : "Shift";
      }
    });

    // 中文页当前是纯文本快捷键，不是上游的 keycap 结构，切换时要同步替换修饰键前缀。
    document.querySelectorAll(".key").forEach(function (key) {
      if (key.querySelectorAll && key.querySelectorAll(".keycap").length > 0) {
        return;
      }

      key.textContent = replaceModifierText(key.textContent, os);
    });

    localStorage.setItem("cc-os", os);
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      localStorage.setItem("cc-os-manual", "1");
      applyOS(button.dataset.os);
    });
  });

  applyOS(saved);
})();

(function () {
  var root = document.documentElement;
  var toggle = document.getElementById("themeToggle");
  var buttons = toggle ? toggle.querySelectorAll(".theme-btn") : [];
  var storedTheme = localStorage.getItem("cc-theme");
  var systemPrefersDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  var initialTheme = storedTheme || (systemPrefersDark ? "dark" : "light");

  function applyTheme(theme) {
    if (!root) {
      return;
    }

    root.dataset.theme = theme;
    localStorage.setItem("cc-theme", theme);

    buttons.forEach(function (button) {
      var active = button.dataset.theme === theme;
      button.classList.toggle("active", active);
      if (button.setAttribute) {
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
  }

  if (buttons.length > 0) {
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(button.dataset.theme);
      });
    });
  }

  applyTheme(initialTheme);
})();

(function () {
  var changelog = document.getElementById("changelogPanel");
  var dismissButton = document.getElementById("dismissChangelog");

  if (!changelog || !dismissButton) {
    return;
  }

  dismissButton.addEventListener("click", function (event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    changelog.remove();
  });
})();

(function () {
  var now = new Date();

  document.querySelectorAll(".badge-new[data-added]").forEach(function (badge) {
    var added = new Date(badge.getAttribute("data-added"));

    if ((now - added) / 86400000 > 14) {
      badge.style.display = "none";
    }
  });
})();
