// Cookie and privacy notice. This site sets no cookies. It only stores two small values in the
// browser (the light/dark choice and this consent choice) and, if the visitor accepts, loads
// Google Fonts. Until the visitor accepts, Google is not contacted and the page uses the system fonts.
(function () {
  const KEY = "hacky-consent";
  const FONTS = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap";
  const root = document.documentElement;

  function read() {
    try {
      const value = localStorage.getItem(KEY);
      return value === "yes" || value === "no" ? value : null;
    } catch (error) {
      return null;
    }
  }
  function write(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (error) {
      // Storage can be blocked. The choice then only lasts until the page is closed.
    }
  }

  let fontsLoaded = false;
  function loadFonts() {
    if (fontsLoaded) return;
    fontsLoaded = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS;
    document.head.appendChild(link);
  }

  function apply(choice) {
    if (choice) root.dataset.consent = choice;
    else delete root.dataset.consent;
    if (choice === "yes") loadFonts();
    window.dispatchEvent(new CustomEvent("hacky:consent", { detail: choice }));
  }

  let banner = null;
  function hide() {
    if (banner) banner.remove();
    banner = null;
  }
  function choose(choice) {
    write(choice);
    apply(choice);
    hide();
  }
  function show() {
    if (banner) return;
    banner = document.createElement("div");
    banner.className = "consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookies and privacy");
    const text = document.createElement("p");
    text.append("This site sets no cookies. With your OK it loads Google Fonts, which tells Google your IP address. Without it, the page uses your system fonts. ");
    const more = document.createElement("a");
    more.href = "cookies.html";
    more.textContent = "Details";
    text.append(more, ".");
    const buttons = document.createElement("div");
    buttons.className = "consent-btns";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn btn-brand";
    accept.textContent = "Accept";
    accept.addEventListener("click", () => choose("yes"));
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "btn btn-ghost";
    decline.textContent = "Decline";
    decline.addEventListener("click", () => choose("no"));
    buttons.append(accept, decline);
    banner.append(text, buttons);
    document.body.appendChild(banner);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-cookie-settings]")) show();
  });

  const saved = read();
  apply(saved);
  if (!saved) show();
})();
