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

function initStickyOffsets() {
  var root = document.documentElement;
  var header = document.querySelector(".header");

  if (!root || !root.style || typeof root.style.setProperty !== "function" || !header) {
    return;
  }

  if (typeof header.getBoundingClientRect !== "function") {
    return;
  }

  function updateStickyOffsets() {
    var headerRect = header.getBoundingClientRect();
    var stickyShellTop = Math.round(Math.max(headerRect.top, 0) + headerRect.height + 12);
    var stickyScrollMargin = stickyShellTop + 24;

    // 顶部 header 固定后，其余 sticky 区域和锚点偏移都跟着 header 实高走，避免遮挡和错位。
    root.style.setProperty("--sticky-shell-top", stickyShellTop + "px");
    root.style.setProperty("--sticky-scroll-margin", stickyScrollMargin + "px");
  }

  updateStickyOffsets();

  if (window && typeof window.addEventListener === "function") {
    window.addEventListener("resize", updateStickyOffsets);
  }
}

function resolveSectionPanelFromHash(hash) {
  if (!hash) {
    return null;
  }

  var hashId = hash.charAt(0) === "#" ? hash.slice(1) : hash;
  if (!hashId) {
    return null;
  }

  var target = document.getElementById(hashId);
  if (!target) {
    return null;
  }

  if (typeof target.hasAttribute === "function" && target.hasAttribute("data-section-panel")) {
    return target;
  }

  if (typeof target.closest === "function") {
    return target.closest("[data-section-panel]");
  }

  return null;
}

function initSectionSwitcher() {
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".section-switcher-btn"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-section-panel]"));

  if (buttons.length === 0 || panels.length === 0) {
    return;
  }

  function getButtonTarget(button) {
    return button.dataset.sectionTarget || button.getAttribute("data-section-target");
  }

  function getPanelTarget(panel) {
    if (!panel) {
      return "";
    }

    return panel.dataset && panel.dataset.sectionPanel ? panel.dataset.sectionPanel : panel.getAttribute("data-section-panel") || "";
  }

  function findPanelByTarget(target) {
    if (!target) {
      return null;
    }

    for (var i = 0; i < panels.length; i += 1) {
      if (getPanelTarget(panels[i]) === target) {
        return panels[i];
      }
    }

    return null;
  }

  function syncHashWithoutScroll(activeTarget) {
    if (!activeTarget) {
      return;
    }

    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(null, "", "#" + activeTarget);
      return;
    }

    window.location.hash = "#" + activeTarget;
  }

  function alignPanelToSidebar(activePanel) {
    var sidebar = document.querySelector(".page-sidebar");
    if (!sidebar || !activePanel) {
      return;
    }

    if (typeof sidebar.getBoundingClientRect !== "function" || typeof activePanel.getBoundingClientRect !== "function") {
      return;
    }

    if (typeof window.scrollBy !== "function") {
      return;
    }

    var sidebarRect = sidebar.getBoundingClientRect();
    var panelRect = activePanel.getBoundingClientRect();
    var isSideBySide = sidebarRect.right <= panelRect.left || panelRect.right <= sidebarRect.left;

    if (!isSideBySide) {
      return;
    }

    var sidebarTop = sidebarRect.top;
    var panelTop = panelRect.top;
    var offset = panelTop - sidebarTop;

    if (Math.abs(offset) < 2) {
      return;
    }

    window.scrollBy({
      top: offset,
      left: 0,
      behavior: "auto"
    });
  }

  function setActivePanel(activePanel, syncHash) {
    var activeTarget = getPanelTarget(activePanel);

    panels.forEach(function (panel) {
      var isActive = panel === activePanel;

      panel.hidden = !isActive;
    });

    buttons.forEach(function (button) {
      var isActive = getButtonTarget(button) === activeTarget;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (syncHash) {
      syncHashWithoutScroll(activeTarget);
    }
  }

  function activateFromHash(hash, syncHash) {
    var panel = resolveSectionPanelFromHash(hash) || panels[0];
    if (panel) {
      setActivePanel(panel, syncHash);
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var target = getButtonTarget(button);
      var panel = findPanelByTarget(target);
      if (!panel && typeof button.closest === "function") {
        panel = button.closest("[data-section-panel]");
      }

      if (panel) {
        var wasActive = !panel.hidden;
        setActivePanel(panel, true);
        if (!wasActive) {
          alignPanelToSidebar(panel);
        }
      }
    });
  });

  window.addEventListener("hashchange", function () {
    activateFromHash(window.location.hash, false);
  });

  activateFromHash(window.location.hash, false);
}

function initChangelogPopover() {
  var trigger = document.querySelector(".changelog-trigger");
  var panel = document.getElementById("changelogPanel");

  if (!trigger || !panel) {
    return;
  }

  function setOpen(open) {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closePopover() {
    setOpen(false);
  }

  trigger.addEventListener("click", function (event) {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }

    setOpen(panel.hidden);
  });

  document.addEventListener("click", function (event) {
    var target = event && event.target ? event.target : null;

    if (!target || target === trigger) {
      return;
    }

    if (typeof target.closest === "function") {
      if (target.closest(".changelog-panel") || target.closest(".changelog-trigger")) {
        return;
      }
    }

    closePopover();
  });

  document.addEventListener("keydown", function (event) {
    if (event && event.key === "Escape") {
      closePopover();
    }
  });

  setOpen(!panel.hidden);
}

function initSiteVisitCounter() {
  var countEl = document.getElementById("siteVisitCount");

  if (!countEl || typeof Counter !== "function") {
    return;
  }

  var namespace = countEl.getAttribute("data-counter-namespace") || "cc-quick";
  var name = countEl.getAttribute("data-counter-name") || "site-visits";

  function setCounterState(state, text) {
    countEl.textContent = text;
    countEl.setAttribute("data-counter-state", state);
  }

  // CounterAPI v2 需要预创建 workspace；这里使用 v1 namespace，静态页可直接计数。
  new Counter({ namespace: namespace, version: "v1" })
    .up(name)
    .then(function (result) {
      var count = result && typeof result.count === "number" ? result.count : null;

      if (count === null) {
        setCounterState("error", "暂不可用");
        return;
      }

      setCounterState("ready", count.toLocaleString("zh-CN"));
    })
    .catch(function () {
      setCounterState("error", "暂不可用");
    });
}

(function () {
  initStickyOffsets();
  initSectionSwitcher();
  initChangelogPopover();
  initSiteVisitCounter();
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
