const CONFIG = {
  authUrl: "https://api.animeunicraft.my.id",
  apiBase: "https://api.animeunicraft.my.id/servermc",
  wsUrl: "wss://api.animeunicraft.my.id",
};

const loginView = document.getElementById("login-view");
const controlView = document.getElementById("control-view");
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

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;

  setLoginBusy(true);
  hideLoginError();

  try {
    const res = await fetch(CONFIG.authUrl, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });

    const data = await res.json();
    if (data.success) {
      authToken = data.token_auth;
      showControl();
    } else {
      showLoginError("Token tidak valid.");
    }
  } catch (err) {
    showLoginError("Gagal terhubung ke server. (" + err.message + ")");
  } finally {
    setLoginBusy(false);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;

  setLoginBusy(true);
  hideLoginError();

  try {
    const res = await fetch(CONFIG.authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token }),
    });

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    if (data.success && data.token_auth) {
      authToken = data.token_auth;
      showControl();
    } else {
      showLoginError("Token tidak valid.");
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
  connectWS();
}

logoutBtn.addEventListener("click", () => {
  disconnectWS();
  authToken = "";
  controlView.hidden = true;
  loginView.hidden = false;
  hideLoginError();
});

function connectWS() {
  disconnectWS();

  const url = CONFIG.wsUrl + `?token=${authToken ?? "none"}`

  try {
    ws = new WebSocket(url);
  } catch (e) {
    setWsStatus(false);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => setWsStatus(true);

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    console.log(msg);

    if (msg.type === "log" && typeof msg.data === "string") {
      appendLog(msg.data);
    } else if (msg.type === "getlogall" && Array.isArray(msg.data)) {
      clearLog();
      msg.data.forEach((line) => appendLog(String(line)));
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

async function serverAction(action) {
  const btnMap = { start: btnStart, restart: btnRestart, stop: btnStop };
  const btn = btnMap[action];

  btn.disabled = true;
  setActionStatus("Mengirim perintah " + action + "...", "");

  if (!connected) {
    setActionStatus("Gagal mengirim perintah: Sambungan terputus");
    return;
  }

  try {
    const res = await fetch(CONFIG.apiBase + "/" + action, {
      method: "GET",
      headers: { Authorization: "Bearer " + authToken },
    });

    if (!res.ok) throw new Error("HTTP " + res.status);

    setActionStatus("Perintah " + action + " berhasil dikirim.", "ok");
  } catch (err) {
    setActionStatus("Gagal: " + err.message, "err");
  } finally {
    btn.disabled = false;
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

tokenInput.focus();