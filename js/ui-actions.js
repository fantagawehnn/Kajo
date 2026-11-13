/* KAJO modal actions: move dialogs to the document root to avoid hidden/stacked app containers. */
(() => {
  function promoteModalToViewport(modal, zIndex) {
    if (!modal) throw new Error("Dialogelement wurde nicht gefunden.");
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.style.setProperty("position", "fixed", "important");
    modal.style.setProperty("inset", "0", "important");
    modal.style.setProperty("z-index", String(zIndex), "important");
    modal.style.setProperty("visibility", "visible", "important");
    modal.style.setProperty("pointer-events", "auto", "important");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("kajo-modal-open");
    return modal;
  }

  window.kajoOpenProfile = function(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    try {
      if (typeof window.openProfileModal !== "function") throw new Error("Profilnavigation ist nicht verfügbar.");
      window.openProfileModal();
    } catch (error) {
      console.error("KAJO: Athletenprofil konnte nicht geöffnet werden.", error);
      window.alert("Das Athletenprofil konnte nicht geöffnet werden. Details stehen in der Browser-Konsole.");
    }
  };

  window.kajoOpenCheckin = function(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    try {
      const modal = promoteModalToViewport(document.getElementById("daily-checkin-modal"), 2147483646);
      const content = document.getElementById("daily-checkin-modal-content");
      const panel = document.getElementById("daily-checkin-panel");
      if (!content || !panel) throw new Error("Check-in-Inhalt wurde nicht gefunden.");
      if (panel.parentElement !== content) content.appendChild(panel);
      if (typeof window.openDailyCheckinModal === "function") window.openDailyCheckinModal();
      modal.style.setProperty("display", "block", "important");
      modal.style.setProperty("visibility", "visible", "important");
    } catch (error) {
      console.error("KAJO: Check-in-Fenster konnte nicht geöffnet werden.", error);
      window.alert("Der tägliche Check-in konnte nicht geöffnet werden. Details stehen in der Browser-Konsole.");
    }
  };
})();
