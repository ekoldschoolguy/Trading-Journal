import { TradeCanvas } from "./canvas.js";

const state = {
  trades: [],
  selectedTrade: null,
  pendingCanvasState: null,
  authConfigured: true,
  profileName: ""
};

const el = {
  btnOpenFolder: document.getElementById("btnOpenFolder"),
  btnNewTrade: document.getElementById("btnNewTrade"),
  btnCancelTrade: document.getElementById("btnCancelTrade"),
  newTradeForm: document.getElementById("newTradeForm"),
  tradeDate: document.getElementById("tradeDate"),
  tradeTime: document.getElementById("tradeTime"),
  tradeName: document.getElementById("tradeName"),
  tradeBuyPrice: document.getElementById("tradeBuyPrice"),
  tradeSellPrice: document.getElementById("tradeSellPrice"),
  tradeQty: document.getElementById("tradeQty"),
  tradePnl: document.getElementById("tradePnl"),
  tradeTags: document.getElementById("tradeTags"),
  searchName: document.getElementById("searchName"),
  searchDate: document.getElementById("searchDate"),
  searchTag: document.getElementById("searchTag"),
  tradeList: document.getElementById("tradeList"),
  activeTradeTitle: document.getElementById("activeTradeTitle"),
  btnSaveCanvas: document.getElementById("btnSaveCanvas"),
  btnDeleteItem: document.getElementById("btnDeleteItem"),
  btnViewJournal: document.getElementById("btnViewJournal"),
  btnViewAnalytics: document.getElementById("btnViewAnalytics"),
  btnZoomOut: document.getElementById("btnZoomOut"),
  btnZoomIn: document.getElementById("btnZoomIn"),
  btnZoomReset: document.getElementById("btnZoomReset"),
  btnBoardShrink: document.getElementById("btnBoardShrink"),
  btnBoardExpand: document.getElementById("btnBoardExpand"),
  btnImgSmaller: document.getElementById("btnImgSmaller"),
  btnImgBigger: document.getElementById("btnImgBigger"),
  toolSelect: document.getElementById("toolSelect"),
  toolText: document.getElementById("toolText"),
  toolArrow: document.getElementById("toolArrow"),
  toolRect: document.getElementById("toolRect"),
  statTotalPnl: document.getElementById("statTotalPnl"),
  statTradeCount: document.getElementById("statTradeCount"),
  statHitRate: document.getElementById("statHitRate"),
  statWinLoss: document.getElementById("statWinLoss"),
  overallTableBody: document.getElementById("overallTableBody"),
  detailTradeName: document.getElementById("detailTradeName"),
  detailBuyPrice: document.getElementById("detailBuyPrice"),
  detailSellPrice: document.getElementById("detailSellPrice"),
  detailQty: document.getElementById("detailQty"),
  detailPnl: document.getElementById("detailPnl"),
  detailTags: document.getElementById("detailTags"),
  btnSaveTradeDetails: document.getElementById("btnSaveTradeDetails"),
  authGate: document.getElementById("authGate"),
  authForm: document.getElementById("authForm"),
  authTitle: document.getElementById("authTitle"),
  authHint: document.getElementById("authHint"),
  authProfileRow: document.getElementById("authProfileRow"),
  authProfileName: document.getElementById("authProfileName"),
  authPassword: document.getElementById("authPassword"),
  authSubmit: document.getElementById("authSubmit"),
  profilePanel: document.getElementById("profilePanel"),
  profileName: document.getElementById("profileName"),
  btnSaveProfile: document.getElementById("btnSaveProfile"),
  btnLogout: document.getElementById("btnLogout"),
  currentPassword: document.getElementById("currentPassword"),
  newPassword: document.getElementById("newPassword"),
  btnChangePassword: document.getElementById("btnChangePassword"),
  btnProfileMenu: document.getElementById("btnProfileMenu")
};

const viewEls = {
  journalPage: document.getElementById("journalPage"),
  analyticsPage: document.getElementById("analyticsPage")
};
const mainViewEl = document.querySelector(".main");

const canvasHost = document.getElementById("canvasHost");
const tradeCanvas = new TradeCanvas(canvasHost, {
  onImageImport: importImageForCurrentTrade,
  onDeleteImage: deleteImageForCurrentTrade,
  onChange: (nextState) => {
    state.pendingCanvasState = nextState;
  }
});

bindUI();
boot();

async function boot() {
  await refreshAuthStatus();
}

async function init() {
  setDefaultTradeDateTime();
  await refreshTrades();
  await loadProfile();
  updateZoomLabel();
}

function bindUI() {
  el.btnOpenFolder.addEventListener("click", refreshTrades);

  el.btnNewTrade.addEventListener("click", () => {
    el.newTradeForm.classList.remove("hidden");
    setDefaultTradeDateTime();
  });

  el.btnCancelTrade.addEventListener("click", () => {
    el.newTradeForm.classList.add("hidden");
  });

  el.newTradeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createTradeFromForm();
  });

  [el.searchName, el.searchDate, el.searchTag].forEach((input) => {
    input.addEventListener("input", renderTradeList);
  });

  el.btnSaveCanvas.addEventListener("click", () => saveCurrentCanvas({ notify: true }));
  el.btnDeleteItem.addEventListener("click", handleDeleteSelectedItem);
  el.btnZoomOut.addEventListener("click", () => {
    tradeCanvas.zoomOut();
    updateZoomLabel();
    saveCurrentCanvas();
  });
  el.btnZoomIn.addEventListener("click", () => {
    tradeCanvas.zoomIn();
    updateZoomLabel();
    saveCurrentCanvas();
  });
  el.btnZoomReset.addEventListener("click", () => {
    tradeCanvas.resetZoom();
    updateZoomLabel();
    saveCurrentCanvas();
  });
  el.btnBoardShrink.addEventListener("click", () => resizeBoard(-600, -400));
  el.btnBoardExpand.addEventListener("click", () => resizeBoard(600, 400));
  el.btnImgSmaller.addEventListener("click", () => resizeSelectedImage(0.9));
  el.btnImgBigger.addEventListener("click", () => resizeSelectedImage(1.1));

  window.addEventListener("keydown", async (event) => {
    const targetTag = String(event.target?.tagName || "").toLowerCase();
    if (targetTag === "input" || targetTag === "textarea") return;
    if (event.key === "Delete") {
      event.preventDefault();
      await handleDeleteSelectedItem();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      resizeSelectedImage(0.9);
      return;
    }
    if (event.key === "=" || event.key === "+") {
      event.preventDefault();
      resizeSelectedImage(1.1);
    }
  });

  [
    [el.toolSelect, "select"],
    [el.toolText, "text"],
    [el.toolArrow, "arrow"],
    [el.toolRect, "rect"]
  ].forEach(([button, tool]) => {
    button.addEventListener("click", () => {
      tradeCanvas.setTool(tool);
      [el.toolSelect, el.toolText, el.toolArrow, el.toolRect].forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
    });
  });

  el.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = el.authPassword.value;
    if (!password) return;
    try {
      if (state.authConfigured) {
        await api("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password })
        });
      } else {
        const profileName = el.authProfileName.value.trim();
        await api("/api/auth/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, profile_name: profileName })
        });
      }
      el.authProfileName.value = "";
      el.authPassword.value = "";
      await refreshAuthStatus();
    } catch (error) {
      window.alert("Login failed. Check password.");
      console.error(error);
    }
  });

  el.btnSaveProfile.addEventListener("click", saveProfile);
  el.btnChangePassword.addEventListener("click", changePassword);
  el.btnLogout.addEventListener("click", logout);
  el.btnSaveTradeDetails.addEventListener("click", saveSelectedTradeDetails);
  el.btnViewJournal.addEventListener("click", () => setView("journal"));
  el.btnViewAnalytics.addEventListener("click", () => setView("analytics"));
  if (el.btnProfileMenu && el.profilePanel) {
    el.btnProfileMenu.addEventListener("click", (event) => {
      event.stopPropagation();
      el.profilePanel.classList.toggle("hidden");
    });
    el.profilePanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    document.addEventListener("click", () => {
      el.profilePanel.classList.add("hidden");
    });
  }

  setView("journal");
}

function setView(viewName) {
  const isJournal = viewName === "journal";
  if (mainViewEl) {
    mainViewEl.dataset.view = isJournal ? "journal" : "analytics";
  }
  viewEls.journalPage.classList.toggle("hidden", !isJournal);
  viewEls.analyticsPage.classList.toggle("hidden", isJournal);
  el.btnViewJournal.classList.toggle("active", isJournal);
  el.btnViewAnalytics.classList.toggle("active", !isJournal);
  [el.toolSelect, el.toolText, el.toolArrow, el.toolRect, el.btnZoomOut, el.btnZoomIn, el.btnZoomReset, el.btnBoardShrink, el.btnBoardExpand, el.btnImgSmaller, el.btnImgBigger, el.btnDeleteItem, el.btnSaveCanvas]
    .forEach((entry) => {
      if (!entry) return;
      entry.classList.toggle("hidden", !isJournal);
    });
}

function setDefaultTradeDateTime() {
  const now = new Date();
  const dateValue = now.toISOString().slice(0, 10);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.tradeDate.value = dateValue;
  el.tradeTime.value = `${hh}:${mm}`;
}

function parseNumberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

async function createTradeFromForm() {
  const date = el.tradeDate.value;
  const time = el.tradeTime.value;
  const tradeName = el.tradeName.value.trim();
  const buyPrice = parseNumberOrNull(el.tradeBuyPrice.value);
  const sellPrice = parseNumberOrNull(el.tradeSellPrice.value);
  const quantity = parseNumberOrNull(el.tradeQty.value);
  let pnl = parseNumberOrNull(el.tradePnl.value);
  if (pnl === null && buyPrice !== null && sellPrice !== null && quantity !== null) {
    pnl = Number(((sellPrice - buyPrice) * quantity).toFixed(2));
  }
  const tags = el.tradeTags.value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!date || !time || !tradeName) {
    window.alert("Date, time and trade name are required.");
    return;
  }

  const payload = {
    date,
    time,
    trade_name: tradeName,
    buy_price: buyPrice,
    sell_price: sellPrice,
    quantity,
    pnl,
    tags
  };

  const created = await api("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  el.newTradeForm.reset();
  el.newTradeForm.classList.add("hidden");
  await refreshTrades();

  const selected = state.trades.find((trade) => trade.id === created.id);
  if (selected) await selectTrade(selected);
}

async function refreshTrades() {
  try {
    const trades = await api("/api/trades");
    state.trades = Array.isArray(trades) ? trades : [];
    state.trades.sort((a, b) => String(b.sortKey || "").localeCompare(String(a.sortKey || "")));
    renderTradeList();
    await loadDashboard();
  } catch (error) {
    console.error(error);
    if (!String(error).includes("401")) {
      window.alert("API not reachable. Start server: python3 journal.py");
    }
  }
}

function filterTrades(trades) {
  const nameSearch = el.searchName.value.trim().toLowerCase();
  const dateSearch = el.searchDate.value.trim();
  const tagSearch = el.searchTag.value.trim().toLowerCase();

  return trades.filter((trade) => {
    const tradeTitle = getTradeTitle(trade.metadata).toLowerCase();
    if (nameSearch && !tradeTitle.includes(nameSearch)) return false;
    if (dateSearch && trade.metadata.date !== dateSearch) return false;
    if (tagSearch) {
      const tags = Array.isArray(trade.metadata.tags) ? trade.metadata.tags : [];
      if (!tags.some((tag) => tag.toLowerCase().includes(tagSearch))) return false;
    }
    return true;
  });
}

function renderTradeList() {
  const filtered = filterTrades(state.trades);
  el.tradeList.innerHTML = "";

  if (filtered.length === 0) {
    el.tradeList.innerHTML = "<small>No trades found.</small>";
    return;
  }

  for (const trade of filtered) {
    const entry = document.createElement("div");
    entry.className = "trade-item";
    if (state.selectedTrade?.id === trade.id) entry.classList.add("active");
    entry.innerHTML = `
      <div class="trade-item-head">
        <strong>${getTradeTitle(trade.metadata)}</strong>
        <div class="trade-actions">
          <button class="icon-btn" type="button" data-action="edit" title="Edit trade name">✎</button>
          <button class="icon-btn danger" type="button" data-action="delete" title="Delete trade">🗑</button>
        </div>
      </div>
      <small>${trade.metadata.date} ${trade.metadata.time}</small>
    `;
    entry.addEventListener("click", () => selectTrade(trade));

    const editBtn = entry.querySelector("[data-action='edit']");
    if (editBtn) {
      editBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await handleRenameTrade(trade);
      });
    }

    const deleteBtn = entry.querySelector("[data-action='delete']");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await handleDeleteTrade(trade);
      });
    }

    el.tradeList.appendChild(entry);
  }
}

async function handleRenameTrade(trade) {
  const currentName = getTradeTitle(trade.metadata);
  const nextName = window.prompt("Edit trade name:", currentName);
  if (nextName === null) return;
  const cleanName = nextName.trim();
  if (!cleanName) {
    window.alert("Trade name cannot be empty.");
    return;
  }

  await api(`/api/trades/${encodeTradeId(trade.id)}/metadata`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trade_name: cleanName })
  });

  const wasSelected = state.selectedTrade?.id === trade.id;
  await refreshTrades();
  if (wasSelected) {
    const updated = state.trades.find((entry) => entry.id === trade.id);
    if (updated) await selectTrade(updated);
  }
}

async function handleDeleteTrade(trade) {
  const title = getTradeTitle(trade.metadata);
  const ok = window.confirm(`Delete trade "${title}"?\nThis will remove metadata, canvas and images.`);
  if (!ok) return;

  await api(`/api/trades/${encodeTradeId(trade.id)}`, { method: "DELETE" });

  if (state.selectedTrade?.id === trade.id) {
    state.selectedTrade = null;
    state.pendingCanvasState = null;
    tradeCanvas.clear();
    el.activeTradeTitle.textContent = "No trade selected";
    fillSelectedTradeDetails({});
  }

  await refreshTrades();
}

async function selectTrade(trade) {
  state.selectedTrade = trade;
  state.pendingCanvasState = null;
  el.activeTradeTitle.textContent = `${trade.path} (${trade.metadata.date} ${trade.metadata.time})`;
  const canvasState = await api(`/api/trades/${encodeTradeId(trade.id)}/canvas`);
  await tradeCanvas.loadState(canvasState, (imagePath) => resolveTradeImageUrl(trade, imagePath));
  updateZoomLabel();
  fillSelectedTradeDetails(trade.metadata);
  renderTradeList();
}

async function saveCurrentCanvas({ notify = false } = {}) {
  if (!state.selectedTrade) {
    window.alert("Select a trade first.");
    return;
  }
  const payload = state.pendingCanvasState || tradeCanvas.getState();
  await api(`/api/trades/${encodeTradeId(state.selectedTrade.id)}/canvas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (notify) {
    window.alert("Canvas saved.");
  }
}

function fillSelectedTradeDetails(metadata = {}) {
  const hasData = metadata && Object.keys(metadata).length > 0;
  el.detailTradeName.value = hasData ? metadata.trade_name || getTradeTitle(metadata) : "";
  el.detailBuyPrice.value = metadata.buy_price ?? "";
  el.detailSellPrice.value = metadata.sell_price ?? "";
  el.detailQty.value = metadata.quantity ?? "";
  el.detailPnl.value = metadata.pnl ?? "";
  el.detailTags.value = Array.isArray(metadata.tags) ? metadata.tags.join(", ") : "";
}

async function saveSelectedTradeDetails() {
  if (!state.selectedTrade) {
    window.alert("Select a trade first.");
    return;
  }
  const tradeName = el.detailTradeName.value.trim();
  if (!tradeName) {
    window.alert("Trade name cannot be empty.");
    return;
  }

  const buyPrice = parseNumberOrNull(el.detailBuyPrice.value);
  const sellPrice = parseNumberOrNull(el.detailSellPrice.value);
  const quantity = parseNumberOrNull(el.detailQty.value);
  let pnl = parseNumberOrNull(el.detailPnl.value);
  if (pnl === null && buyPrice !== null && sellPrice !== null && quantity !== null) {
    pnl = Number(((sellPrice - buyPrice) * quantity).toFixed(2));
  }

  const tags = el.detailTags.value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  await api(`/api/trades/${encodeTradeId(state.selectedTrade.id)}/metadata`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trade_name: tradeName,
      buy_price: buyPrice,
      sell_price: sellPrice,
      quantity,
      pnl,
      tags
    })
  });

  const selectedId = state.selectedTrade.id;
  await refreshTrades();
  const updated = state.trades.find((entry) => entry.id === selectedId);
  if (updated) await selectTrade(updated);
  window.alert("Trade details saved.");
}

async function handleDeleteSelectedItem() {
  if (!state.selectedTrade) {
    window.alert("Select a trade first.");
    return;
  }
  const removed = await tradeCanvas.deleteSelectedItem();
  if (!removed) return;
  await saveCurrentCanvas();
}

async function resizeSelectedImage(scaleFactor) {
  if (!state.selectedTrade) {
    window.alert("Select a trade first.");
    return;
  }
  const changed = tradeCanvas.resizeSelectedImage(scaleFactor);
  if (!changed) {
    window.alert("Select an image in Select mode first.");
    return;
  }
  await saveCurrentCanvas();
}

async function resizeBoard(deltaWidth, deltaHeight) {
  if (!state.selectedTrade) {
    window.alert("Select a trade first.");
    return;
  }
  tradeCanvas.resizeBoard(deltaWidth, deltaHeight);
  updateZoomLabel();
  await saveCurrentCanvas();
}

async function importImageForCurrentTrade(file) {
  if (!state.selectedTrade) {
    window.alert("Create or select a trade first.");
    return null;
  }

  const dims = await getImageDimensionsFromFile(file);
  const safeName = `${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
  const path = await api(`/api/trades/${encodeTradeId(state.selectedTrade.id)}/images?filename=${encodeURIComponent(safeName)}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });

  return {
    path,
    url: resolveTradeImageUrl(state.selectedTrade, path),
    width: dims.width,
    height: dims.height
  };
}

async function deleteImageForCurrentTrade(imagePath) {
  if (!state.selectedTrade || !imagePath) return;
  await api(
    `/api/trades/${encodeTradeId(state.selectedTrade.id)}/images?path=${encodeURIComponent(imagePath)}`,
    { method: "DELETE" }
  );
}

function resolveTradeImageUrl(trade, imagePath) {
  if (!imagePath || !imagePath.startsWith("images/")) return "";
  return `/${trade.path}/${imagePath}`;
}

async function getImageDimensionsFromFile(file) {
  const objectUrl = URL.createObjectURL(file);
  const dims = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 600, height: 400 });
    image.src = objectUrl;
  });
  URL.revokeObjectURL(objectUrl);
  return dims;
}

function getTradeTitle(metadata) {
  if (metadata.trade_name) return metadata.trade_name;
  const symbol = metadata.symbol || "";
  const setup = metadata.setup || "";
  const legacy = `${symbol} ${setup}`.trim();
  return legacy || "Untitled Trade";
}

function encodeTradeId(tradeId) {
  return tradeId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 401) {
      showAuthGate();
    }
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} - ${text}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function loadDashboard() {
  try {
    const overall = await api("/api/overall");
    el.statTotalPnl.textContent = Number(overall.total_pnl ?? 0).toFixed(2);
    el.statTradeCount.textContent = String(overall.trade_count ?? 0);
    el.statHitRate.textContent = `${Number(overall.hit_rate ?? 0).toFixed(1)}%`;
    el.statWinLoss.textContent = `${overall.win_count ?? 0} / ${overall.loss_count ?? 0}`;
    renderOverallTable(Array.isArray(overall.trades) ? overall.trades : []);
  } catch (error) {
    console.error(error);
  }
}

function updateZoomLabel() {
  const zoomPercent = Math.round(tradeCanvas.getZoom() * 100);
  el.btnZoomReset.textContent = `${zoomPercent}%`;
}

function renderOverallTable(rows) {
  el.overallTableBody.innerHTML = "";
  const latest = rows.slice(-50).reverse();
  for (const row of latest) {
    const tr = document.createElement("tr");
    const pnlNum = Number(row.pnl ?? 0);
    tr.innerHTML = `
      <td>${row.trade_name || "Untitled"}</td>
      <td>${row.buy_price ?? "-"}</td>
      <td>${row.sell_price ?? "-"}</td>
      <td>${row.quantity ?? "-"}</td>
      <td class="${pnlNum >= 0 ? "pnl-win" : "pnl-loss"}">${pnlNum.toFixed(2)}</td>
      <td>${row.date || "-"}</td>
    `;
    el.overallTableBody.appendChild(tr);
  }
}

async function loadProfile() {
  try {
    const profile = await api("/api/profile");
    state.profileName = String(profile.profile_name || "");
    el.profileName.value = state.profileName;
  } catch (error) {
    console.error(error);
  }
}

async function saveProfile() {
  const profileName = el.profileName.value.trim();
  if (!profileName) {
    window.alert("Profile name cannot be empty.");
    return;
  }
  await api("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_name: profileName })
  });
  state.profileName = profileName;
  window.alert("Profile updated.");
}

async function changePassword() {
  const currentPassword = el.currentPassword.value;
  const newPassword = el.newPassword.value;
  if (!currentPassword || !newPassword) {
    window.alert("Enter current and new password.");
    return;
  }
  await api("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
  });
  el.currentPassword.value = "";
  el.newPassword.value = "";
  window.alert("Password changed.");
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }
  state.selectedTrade = null;
  state.pendingCanvasState = null;
  state.trades = [];
  tradeCanvas.clear();
  el.tradeList.innerHTML = "";
  el.activeTradeTitle.textContent = "No trade selected";
  fillSelectedTradeDetails({});
  showAuthGate();
}

async function refreshAuthStatus() {
  try {
    const status = await api("/api/auth/status");
    state.authConfigured = !!status.configured;
    if (status.authenticated) {
      hideAuthGate();
      await init();
      return;
    }
    showAuthGate();
  } catch (error) {
    console.error(error);
    showAuthGate();
  }
}

function showAuthGate() {
  el.authGate.classList.remove("hidden");
  if (state.authConfigured) {
    el.authTitle.textContent = "Login";
    el.authHint.textContent = "Enter password to unlock journal.";
    el.authSubmit.textContent = "Login";
    el.authProfileRow.classList.add("hidden");
  } else {
    el.authTitle.textContent = "Set Password";
    el.authHint.textContent = "First run: create a password for local access.";
    el.authSubmit.textContent = "Set Password";
    el.authProfileRow.classList.remove("hidden");
  }
}

function hideAuthGate() {
  el.authGate.classList.add("hidden");
}
