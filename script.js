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

  function applyOS(os) {
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.os === os);
    });

    document.querySelectorAll(".keycap").forEach(function (keycap) {
      var text = keycap.textContent.trim();

      if (text === "Alt" || text === "⌥") {
        keycap.textContent = os === "mac" ? "⌥" : "Alt";
      } else if (text === "Shift" || text === "⇧") {
        keycap.textContent = os === "mac" ? "⇧" : "Shift";
      }
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
  var now = new Date();

  document.querySelectorAll(".badge-new[data-added]").forEach(function (badge) {
    var added = new Date(badge.getAttribute("data-added"));

    if ((now - added) / 86400000 > 14) {
      badge.style.display = "none";
    }
  });
})();
