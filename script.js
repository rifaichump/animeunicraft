const CONFIG = {
  authUrl: "https://api.animeunicraft.my.id/login/token",
  apiBase: "https://api.animeunicraft.my.id/servermc",
  checkTokenUrl: "https://api.animeunicraft.my.id", 
  wsUrl: "wss://api.animeunicraft.my.id"
};

const loginView = document.getElementById("login-view");
const controlView = document.getElementById("control-view");
const loadingView = document.getElementById("loading-view");
const loginForm = document.getElementById("login-form");
const tokenInput = document.getElementById("token-input");
const loginBtn = document.getElementById("login-btn");
const loginError = document.getElementById("login-error");

const logBox = document.getElementById("log");
const wsStatus = document.getElementById("ws-status");
const logoutBtn = document.getElementById("logout-btn");
const clearLogBtn = document.getElementById("clear-log-btn");
const autoscrollCheck = document.getElementById("autoscroll-check");

const btnStart = document.getElementById("btn-start");
const btnRestart = document.getElementById("btn-restart");
const btnStop = document.getElementById("btn-stop");
const actionStatus = document.getElementById("action-status");

let authToken = "";
let ws = null;
let connected = false;
let wsRetryTimer = null;
const MAX_LOG_LINES = 1000;
const TOKEN_KEY = "anime_unicraft_token";

let serverOnline = false;
let stateRefreshTimer = null;

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;

  setLoginBusy(true);
  hideLoginError();

  try {
    const res = await fetch(CONFIG.authUrl, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token
      })
    });

    const data = await res.json();
    if (data.success) {
      authToken = token;
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
      showControl();
    } else {
      showLoginError(data.message);
    }
  } catch (err) {
    showLoginError("Gagal terhubung ke server. (" + err.message + ")");
  } finally {
    setLoginBusy(false);
  }
});

function setLoginBusy(busy) {
  loginBtn.disabled = busy;
  loginBtn.textContent = busy ? "Memeriksa..." : "Masuk";
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

function hideLoginError() {
  loginError.hidden = true;
}

function showControl() {
  loginView.hidden = true;
  controlView.hidden = false;
  tokenInput.value = "";
  clearLog();
  appendLog("Terhubung. Menunggu log...");
  applyButtonState("busy");
  checkServer();
  connectWS();
}

logoutBtn.addEventListener("click", () => {
  disconnectWS();
  authToken = "";
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  controlView.hidden = true;
  loginView.hidden = false;
  hideLoginError();
  tokenInput.focus();
});

async function checkSession() {
  let saved = "";
  try {
    try { saved = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) {};

    const res = await fetch(CONFIG.checkTokenUrl, {
      method: "GET",
      headers: { Authorization: "Bearer " + saved },
    });

    const data = await res.json();
    return data.success
  } catch (e) {
    return false;
  }
}

async function boot() {
  const ok = await checkSession();
  loadingView.hidden = true;

  if (ok) {
    let saved = "";
    try { saved = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) {}
    if (saved) {
      authToken = saved;
      showControl();
      return;
    }
  }

  loginView.hidden = false;
  tokenInput.focus();
}

boot();

function connectWS() {
  disconnectWS();

  const url = CONFIG.wsUrl + `?token=${authToken ?? "none"}`;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    setWsStatus(false);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    setWsStatus(true);
    checkServer();
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === "log" && typeof msg.data === "string") {
      appendLog(msg.data);
    } else if (msg.type === "getlogall" && Array.isArray(msg.data)) {
      clearLog();
      msg.data.forEach((line) => appendLog(String(line)));
    } else if (msg.type === "action") {
      handleActionSignal(msg.data);
    } else if (typeof msg.type === "string") {
      handleActionSignal(msg.type);
    }
  };

  ws.onclose = () => {
    setWsStatus(false);
    scheduleReconnect();
  };

  ws.onerror = () => {
    try { ws.close(); } catch (e) {}
  };
}

function disconnectWS() {
  clearTimeout(wsRetryTimer);
  wsRetryTimer = null;
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    try { ws.close(); } catch (e) {}
    ws = null;
  }
  setWsStatus(false);
}

function scheduleReconnect() {
  if (!authToken || wsRetryTimer) return;
  wsRetryTimer = setTimeout(() => {
    wsRetryTimer = null;
    if (authToken) connectWS();
  }, 3000);
}

function setWsStatus(online) {
  connected = online;
  wsStatus.textContent = online ? "Terhubung" : "Terputus";
  wsStatus.className = "badge " + (online ? "badge-on" : "badge-off");
}

function appendLog(text) {
  const empty = logBox.querySelector(".log-empty");
  if (empty) empty.remove();

  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = "[" + timeNow() + "] " + text;
  logBox.appendChild(line);

  while (logBox.children.length > MAX_LOG_LINES) {
    logBox.removeChild(logBox.firstChild);
  }

  if (autoscrollCheck.checked) {
    logBox.scrollTop = logBox.scrollHeight;
  }
}

function clearLog() {
  logBox.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "log-line log-empty";
  empty.textContent = "Belum ada log.";
  logBox.appendChild(empty);
}

function timeNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

clearLogBtn.addEventListener("click", clearLog);
clearLog();
applyButtonState("offline");

function applyButtonState(state) {
  if (state === "busy") {
    btnStart.disabled = true;
    btnRestart.disabled = true;
    btnStop.disabled = true;
    return;
  }

  const online = state === "online";
  btnStart.disabled = online;
  btnRestart.disabled = !online;
  btnStop.disabled = !online;
}

function handleActionSignal(name) {
  const n = String(name || "").trim().toLowerCase();

  if (n === "started") {
    clearTimeout(stateRefreshTimer);
    stateRefreshTimer = null;
    serverOnline = true;
    applyButtonState("online");
  } else if (n === "stoped" || n === "stopped") {
    clearTimeout(stateRefreshTimer);
    stateRefreshTimer = null;
    serverOnline = false;
    applyButtonState("offline");
  } else if (n === "starting" || n === "stopping" || n === "restarting") {
    applyButtonState("busy");
  }
}

function scheduleStateRefresh() {
  clearTimeout(stateRefreshTimer);
  stateRefreshTimer = setTimeout(() => {
    stateRefreshTimer = null;
    checkServer();
  }, 4000);
}

async function checkServer() {
  if (!authToken) return;

  try {
    const res = await fetch(CONFIG.apiBase + "/check/server", {
      method: "GET",
      headers: { Authorization: "Bearer " + authToken },
    });

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const online = Boolean(
      data.isOnline !== undefined ? data.isOnline : data.data && data.data.isOnline
    );

    serverOnline = online;
    applyButtonState(online ? "online" : "offline");
  } catch (err) {}
}

async function serverAction(action) {
  if (!connected) {
    setActionStatus("Gagal mengirim perintah: Sambungan terputus", "err");
    setTimeout(() => (actionStatus.hidden = true), 4000);
    return;
  }

  appendLog(">> Melakukan: " + action);
  applyButtonState("busy");

  try {
    const res = await fetch(CONFIG.apiBase + "/" + action, {
      method: "GET",
      headers: { Authorization: "Bearer " + authToken },
    });

    if (!res.ok) throw new Error("HTTP " + res.status);
    scheduleStateRefresh();
  } catch (err) {
    applyButtonState(serverOnline ? "online" : "offline");
  } finally {
    setTimeout(() => (actionStatus.hidden = true), 4000);
  }
}

function setActionStatus(msg, kind) {
  actionStatus.textContent = msg;
  actionStatus.className = "action-status " + kind;
  actionStatus.hidden = false;
}

btnStart.addEventListener("click", () => serverAction("start"));
btnRestart.addEventListener("click", () => serverAction("restart"));
btnStop.addEventListener("click", () => serverAction("stop"));
