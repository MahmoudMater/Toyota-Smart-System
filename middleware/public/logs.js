(() => {
  const DEFAULT_TABS = [
    "all",
    "elevenlabs",
    "tts",
    "stt",
    "lpr",
    "nlu",
    "sap",
    "gate",
    "notifications",
  ];

  const state = {
    integration: "all",
    filter: "",
    paused: false,
    autoscroll: true,
    lines: [],
    socket: null,
  };

  const els = {
    tabs: document.getElementById("tabs"),
    logView: document.getElementById("logView"),
    filter: document.getElementById("filter"),
    btnPause: document.getElementById("btnPause"),
    btnAutoscroll: document.getElementById("btnAutoscroll"),
    btnClear: document.getElementById("btnClear"),
    connDot: document.getElementById("connDot"),
    connLabel: document.getElementById("connLabel"),
  };

  function setConnected(on) {
    els.connDot.classList.toggle("on", on);
    els.connLabel.textContent = on ? "Connected" : "Disconnected";
  }

  function renderTabs(list) {
    const tabs = list && list.length ? ["all", ...list] : DEFAULT_TABS;
    els.tabs.innerHTML = "";
    for (const name of tabs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab" + (name === state.integration ? " active" : "");
      btn.textContent = name;
      btn.dataset.integration = name;
      btn.addEventListener("click", () => subscribe(name));
      els.tabs.appendChild(btn);
    }
  }

  function matchesFilter(line) {
    if (!state.filter) return true;
    return (line.pretty || "").toLowerCase().includes(state.filter);
  }

  function render() {
    const visible = state.lines.filter(matchesFilter);
    if (!visible.length) {
      els.logView.innerHTML =
        '<div class="empty">No log lines yet for this filter / integration.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const line of visible) {
      const div = document.createElement("div");
      div.className = `entry ${line.kind || "event"}`;
      div.textContent = line.pretty || "";
      frag.appendChild(div);
    }
    els.logView.innerHTML = "";
    els.logView.appendChild(frag);
    if (state.autoscroll) {
      els.logView.scrollTop = els.logView.scrollHeight;
    }
  }

  function appendLine(line) {
    if (state.paused) return;
    state.lines.push(line);
    if (state.lines.length > 2000) {
      state.lines.splice(0, state.lines.length - 2000);
    }
    if (!matchesFilter(line)) return;
    const empty = els.logView.querySelector(".empty");
    if (empty) els.logView.innerHTML = "";
    const div = document.createElement("div");
    div.className = `entry ${line.kind || "event"}`;
    div.textContent = line.pretty || "";
    els.logView.appendChild(div);
    if (state.autoscroll) {
      els.logView.scrollTop = els.logView.scrollHeight;
    }
  }

  function subscribe(integration) {
    state.integration = integration;
    state.lines = [];
    els.logView.innerHTML = '<div class="empty">Loading backlog…</div>';
    renderTabs(
      Array.from(els.tabs.querySelectorAll(".tab"))
        .map((t) => t.dataset.integration)
        .filter((n) => n && n !== "all"),
    );
    if (state.socket && state.socket.connected) {
      state.socket.emit("logs.subscribe", { integration }, () => {});
    }
  }

  function connect() {
    const origin = window.location.origin;
    const socket = io(`${origin}/logs`, {
      transports: ["websocket", "polling"],
    });
    state.socket = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("logs.subscribe", { integration: state.integration });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("logs.backlog", (payload) => {
      if (payload?.integrations) renderTabs(payload.integrations);
      state.lines = Array.isArray(payload?.lines) ? payload.lines : [];
      render();
    });
    socket.on("logs.line", (line) => appendLine(line));
  }

  els.filter.addEventListener("input", () => {
    state.filter = els.filter.value.trim().toLowerCase();
    render();
  });
  els.btnPause.addEventListener("click", () => {
    state.paused = !state.paused;
    els.btnPause.classList.toggle("active", state.paused);
    els.btnPause.textContent = state.paused ? "Resume" : "Pause";
  });
  els.btnAutoscroll.addEventListener("click", () => {
    state.autoscroll = !state.autoscroll;
    els.btnAutoscroll.classList.toggle("active", state.autoscroll);
  });
  els.btnClear.addEventListener("click", () => {
    state.lines = [];
    render();
  });

  renderTabs(DEFAULT_TABS.slice(1));
  connect();
})();
