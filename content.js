// Pipout — content script.
// Mostra um botão de Picture-in-Picture na borda direita do vídeo sob o cursor
// e, se ativado, coloca o vídeo em PiP sozinho ao trocar de aba.
(() => {
  if (window.__pipoutLoaded) return;
  window.__pipoutLoaded = true;
  if (!document.pictureInPictureEnabled && !("requestPictureInPicture" in HTMLVideoElement.prototype)) return;

  // ---------- parâmetros de layout ----------
  const SIZE = 36; // botão (px)
  const GAP = 10; // distância da borda direita do vídeo
  const HEIGHT_FROM_BOTTOM = 0.35; // centro do botão a 35% da altura, contando de baixo
  const MIN_W = 200; // vídeos menores que isso (miniaturas, ícones) são ignorados
  const MIN_H = 110;
  const HIDE_DELAY = 450; // ms após o cursor sair do vídeo

  const DEFAULTS = { enabled: true, autoOnTabSwitch: false, disabledSites: [] };
  let settings = { ...DEFAULTS };

  function alive() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function siteDisabled() {
    const host = location.hostname.replace(/^www\./, "");
    return (settings.disabledSites || []).some((s) => host === s || host.endsWith("." + s));
  }
  const active = () => alive() && settings.enabled && !siteDisabled();

  try {
    chrome.storage.sync.get(DEFAULTS, (s) => {
      settings = { ...DEFAULTS, ...s };
      syncAutoHandler();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
      if (!active()) hide(true);
      syncAutoHandler();
    });
  } catch (_) {}

  // ---------- localizar vídeos ----------
  function visibleArea(r) {
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  function usable(v) {
    if (!v.isConnected) return false;
    if (!(v.currentSrc || v.src || v.srcObject || v.readyState > 0)) return false;
    const r = v.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    const cs = getComputedStyle(v);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  }

  // Inclui vídeos dentro de shadow DOM aberto (players como o do Reddit usam isso)
  function allVideos(root = document) {
    const out = Array.from(root.querySelectorAll("video"));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.shadowRoot) out.push(...allVideos(n.shadowRoot));
    }
    return out;
  }

  function videoAt(x, y) {
    const contains = (v) => {
      const r = v.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    let hits = Array.from(document.getElementsByTagName("video")).filter((v) => contains(v) && usable(v));
    if (!hits.length) {
      // procura em shadow roots abertos dos elementos sob o cursor
      for (const el of document.elementsFromPoint(x, y)) {
        if (!el.shadowRoot) continue;
        hits = allVideos(el.shadowRoot).filter((v) => contains(v) && usable(v));
        if (hits.length) break;
      }
    }
    if (!hits.length) return null;
    // vários vídeos sobrepostos: fica com o maior
    return hits.reduce((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height > ra.width * ra.height ? b : a;
    });
  }

  // ---------- botão ----------
  const ICON_PIP = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1.2" fill="currentColor" stroke="none"/></svg>`;
  const ICON_EXIT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M16 9l-6 6M10 10.5V15h4.5"/></svg>`;

  const CSS = `
    :host { all: initial; }
    button {
      all: unset; box-sizing: border-box; cursor: pointer;
      width: ${SIZE}px; height: ${SIZE}px; border-radius: 50%;
      display: grid; place-items: center;
      color: #fff; background: rgba(18, 18, 22, .68);
      border: 1px solid rgba(255, 255, 255, .22);
      box-shadow: 0 2px 10px rgba(0, 0, 0, .35);
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
      opacity: 0; transform: scale(.9);
      transition: opacity .15s ease, transform .15s ease, background .15s ease;
    }
    :host([data-show]) button { opacity: 1; transform: scale(1); }
    button:hover { background: rgba(18, 18, 22, .88); transform: scale(1.07); }
    button:active { transform: scale(.95); }
    button.err { background: rgba(200, 40, 60, .85); }
  `;

  let host = null, btn = null;
  let current = null; // vídeo que o botão está servindo
  let hideTimer = 0, rafId = 0;

  function ensureButton() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-pipout", "");
    host.style.cssText = `position:fixed;z-index:2147483647;top:0;left:0;width:${SIZE}px;height:${SIZE}px;display:none;margin:0;padding:0;`;
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    btn = document.createElement("button");
    btn.type = "button";
    root.append(style, btn);
    updateIcon();
  }

  function mountPoint() {
    const fs = document.fullscreenElement;
    // em tela cheia, só o elemento em fullscreen aparece: o botão precisa ir para dentro dele
    if (fs && !(fs instanceof HTMLVideoElement)) return fs;
    return document.documentElement;
  }

  function place() {
    if (!current || !host) return;
    if (!usable(current) || visibleArea(current.getBoundingClientRect()) === 0) return hide(true);
    const r = current.getBoundingClientRect();
    let top = r.bottom - r.height * HEIGHT_FROM_BOTTOM - SIZE / 2;
    let left = r.right - GAP - SIZE;
    // vídeo parcialmente fora da tela: mantém o botão na parte visível
    top = Math.min(Math.max(top, Math.max(r.top, 0) + 4), Math.min(r.bottom, innerHeight) - SIZE - 4);
    left = Math.min(Math.max(left, Math.max(r.left, 0) + 4), Math.min(r.right, innerWidth) - SIZE - 4);
    host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function loop() {
    place();
    if (current) rafId = requestAnimationFrame(loop);
  }

  function show(video) {
    ensureButton();
    clearTimeout(hideTimer);
    const mp = mountPoint();
    if (host.parentNode !== mp) mp.appendChild(host);
    if (current !== video) {
      current = video;
      updateIcon();
    }
    host.style.display = "block";
    place();
    requestAnimationFrame(() => host && host.setAttribute("data-show", ""));
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function hide(now) {
    clearTimeout(hideTimer);
    const doHide = () => {
      current = null;
      cancelAnimationFrame(rafId);
      rafId = 0;
      if (!host) return;
      host.removeAttribute("data-show");
      host.style.display = "none";
    };
    if (now) doHide();
    else hideTimer = setTimeout(doHide, HIDE_DELAY);
  }

  function updateIcon() {
    if (!btn) return;
    const inPip = current && document.pictureInPictureElement === current;
    btn.innerHTML = inPip ? ICON_EXIT : ICON_PIP;
    const label = inPip ? "Voltar o vídeo para a página" : "Abrir em Picture-in-Picture";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function flashError() {
    if (!btn) return;
    btn.classList.add("err");
    btn.title = "Este vídeo não permite Picture-in-Picture";
    setTimeout(() => btn && btn.classList.remove("err"), 900);
  }

  // ---------- PiP ----------
  async function enterPip(video) {
    // alguns sites bloqueiam o PiP com o atributo disablePictureInPicture
    if (video.disablePictureInPicture) video.disablePictureInPicture = false;
    await video.requestPictureInPicture();
  }

  async function toggle(video) {
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await enterPip(video);
    } catch (_) {
      flashError();
    }
  }

  document.addEventListener("enterpictureinpicture", updateIcon, true);
  document.addEventListener("leavepictureinpicture", updateIcon, true);

  // ---------- eventos ----------
  let lastX = -1, lastY = -1, pending = false;

  function check() {
    pending = false;
    if (!active()) return hide(true);
    const el = document.elementFromPoint(lastX, lastY);
    if (host && el === host) return clearTimeout(hideTimer); // cursor em cima do botão
    const v = videoAt(lastX, lastY);
    if (v) show(v);
    else if (current) hide(false);
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(check);
      }
    },
    { capture: true, passive: true }
  );
  document.addEventListener("mouseleave", () => current && hide(false), true);
  document.addEventListener("fullscreenchange", () => {
    if (current) show(current);
  });

  // O clique no botão não deve chegar ao site (ex.: o YouTube pausa o vídeo ao clicar no player).
  // Registrado em document_start, roda antes dos listeners da página.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "auxclick"]) {
    window.addEventListener(
      type,
      (e) => {
        if (!host || e.target !== host) return;
        e.stopImmediatePropagation();
        if (type === "mousedown") e.preventDefault(); // não rouba o foco do player
        if (type === "click" && e.button === 0 && current) toggle(current);
      },
      true
    );
  }

  // ---------- PiP automático ao trocar de aba ----------
  // Caminho principal: o recurso de PiP automático do próprio navegador. Ao registrar a ação
  // "enterpictureinpicture" do Media Session, o navegador chama este handler quando a aba sai
  // de foco com um vídeo tocando, já com permissão para abrir o PiP.
  let autoRegistered = false;
  let autoEntered = false;

  function bestPlayingVideo() {
    const playing = allVideos().filter((v) => !v.paused && !v.ended && v.readyState >= 2 && usable(v));
    if (!playing.length) return null;
    return playing.reduce((a, b) =>
      visibleArea(b.getBoundingClientRect()) > visibleArea(a.getBoundingClientRect()) ? b : a
    );
  }

  async function autoEnter() {
    if (document.pictureInPictureElement) return;
    const v = bestPlayingVideo();
    if (!v) return;
    try {
      await enterPip(v);
      autoEntered = true;
    } catch (_) {}
  }

  function syncAutoHandler() {
    const want = active() && settings.autoOnTabSwitch;
    if (!("mediaSession" in navigator)) return;
    try {
      if (want && !autoRegistered) {
        navigator.mediaSession.setActionHandler("enterpictureinpicture", autoEnter);
        autoRegistered = true;
      } else if (!want && autoRegistered) {
        navigator.mediaSession.setActionHandler("enterpictureinpicture", null);
        autoRegistered = false;
      }
    } catch (_) {
      // navegador sem suporte à ação: fica só o plano B abaixo
    }
  }

  // Plano B: tenta ao esconder a aba (o navegador costuma exigir um clique recente na página).
  document.addEventListener("visibilitychange", () => {
    if (!active() || !settings.autoOnTabSwitch) return;
    if (document.hidden) {
      autoEnter();
    } else if (autoEntered) {
      autoEntered = false;
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    }
  });
  // Se o usuário fechar a janelinha manualmente, não "devolvemos" nada ao voltar
  document.addEventListener("leavepictureinpicture", () => (autoEntered = false), true);
})();
