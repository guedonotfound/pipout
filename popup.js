const DEFAULTS = { enabled: true, autoOnTabSwitch: false, disabledSites: [] };
const $ = (id) => document.getElementById(id);

(async () => {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };

  let host = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const u = new URL(tab && tab.url ? tab.url : "");
    if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, "");
  } catch (_) {}

  $("enabled").checked = s.enabled;
  $("autoOnTabSwitch").checked = s.autoOnTabSwitch;
  $("autoNote").hidden = !s.autoOnTabSwitch;

  if (host) {
    $("siteName").textContent = host;
    $("site").checked = !s.disabledSites.includes(host);
  } else {
    $("siteRow").hidden = true;
  }

  const save = (patch) => chrome.storage.sync.set(patch);

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  $("autoOnTabSwitch").addEventListener("change", (e) => {
    save({ autoOnTabSwitch: e.target.checked });
    $("autoNote").hidden = !e.target.checked;
  });
  $("site").addEventListener("change", async (e) => {
    const cur = (await chrome.storage.sync.get({ disabledSites: [] })).disabledSites;
    const set = new Set(cur);
    if (e.target.checked) set.delete(host);
    else set.add(host);
    save({ disabledSites: [...set] });
  });

  $("openAutoSetting").addEventListener("click", () =>
    chrome.tabs.create({ url: "chrome://settings/content/autoPictureInPicture" })
  );
})();
