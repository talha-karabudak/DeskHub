const elements = Object.fromEntries([
  "session-status", "session-label", "position-current", "position-start", "position-change",
  "lap-current", "lap-remaining", "lap-context", "last-lap", "best-lap", "last-delta",
  "recent-laps", "fuel-remaining", "fuel-average", "fuel-laps", "fuel-finish",
  "fuel-context", "updated-at",
].map((id) => [id, document.getElementById(id)]));

const unavailable = "—";

function valueOrDash(value, formatter = String) {
  return typeof value === "number" && Number.isFinite(value) ? formatter(value) : unavailable;
}

function lapTime(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return unavailable;
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds - minutes * 60).toFixed(3).padStart(6, "0");
  return `${minutes}:${remainder}`;
}

function signed(value, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable;
  if (Math.abs(value) < 0.0005) return digits ? (0).toFixed(digits) : "0";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function setSemanticClass(element, value, positiveWhenAboveZero = true) {
  element.classList.remove("positive", "negative", "best-color");
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return;
  const positive = positiveWhenAboveZero ? value > 0 : value < 0;
  element.classList.add(positive ? "positive" : "negative");
}

function renderConnection(connection) {
  const state = connection.connected ? (connection.sessionActive ? "active" : "idle") : "disconnected";
  elements["session-status"].dataset.state = state;
  elements["session-label"].textContent = state === "active" ? "Session active"
    : state === "idle" ? "Connected · waiting for track" : "iRacing disconnected";
}

function renderPosition(position) {
  elements["position-current"].textContent = valueOrDash(position.current);
  elements["position-start"].textContent = valueOrDash(position.start, (value) => `P${value}`);
  elements["position-change"].textContent = valueOrDash(position.gainLoss, (value) => signed(value));
  setSemanticClass(elements["position-change"], position.gainLoss);
}

function renderLaps(laps) {
  document.body.dataset.session = laps.remaining === null ? "practice" : "race";
  elements["lap-current"].textContent = valueOrDash(laps.current);
  elements["lap-remaining"].textContent = valueOrDash(laps.remaining, (value) => Number.isInteger(value) ? String(value) : value.toFixed(1));
  elements["lap-context"].textContent = laps.remaining === null
    ? "Practice / unlimited session" : `${valueOrDash(laps.remaining)} laps estimated remaining`;
  elements["last-lap"].textContent = lapTime(laps.last);
  elements["best-lap"].textContent = lapTime(laps.best);
  elements["best-lap"].classList.toggle("best-color", laps.best !== null);
  const lastDelta = laps.last !== null && laps.best !== null ? laps.last - laps.best : null;
  elements["last-delta"].textContent = valueOrDash(lastDelta, (value) => signed(value, 3));
  elements["last-delta"].classList.toggle("best-color", lastDelta !== null && Math.abs(lastDelta) < 0.0005);
  renderRecentLaps(laps.recent);
}

function renderRecentLaps(laps) {
  elements["recent-laps"].replaceChildren();
  if (!Array.isArray(laps) || laps.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No completed laps";
    elements["recent-laps"].append(empty);
    return;
  }
  for (const lap of [...laps].reverse()) {
    const row = document.createElement("div");
    const isBest = typeof lap.deltaToBest === "number" && Math.abs(lap.deltaToBest) < 0.0005;
    row.className = `lap-row${isBest ? " best" : ""}`;
    const number = document.createElement("span");
    number.className = "lap-number";
    number.textContent = String(lap.lapNumber);
    const time = document.createElement("span");
    time.className = "lap-time";
    time.textContent = lapTime(lap.lapTime);
    const delta = document.createElement("span");
    delta.className = "lap-delta";
    delta.textContent = isBest ? "BEST" : valueOrDash(lap.deltaToBest, (value) => signed(value, 3));
    const incident = document.createElement("span");
    if (typeof lap.incidentDelta === "number" && lap.incidentDelta > 0) {
      incident.className = "incident-badge";
      incident.textContent = `${lap.incidentDelta}x`;
      incident.setAttribute("aria-label", `${lap.incidentDelta} incidents`);
    }
    row.append(number, time, delta, incident);
    elements["recent-laps"].append(row);
  }
}

function renderFuel(fuel) {
  elements["fuel-remaining"].textContent = valueOrDash(fuel.remaining, (value) => value.toFixed(1));
  elements["fuel-average"].textContent = valueOrDash(fuel.averagePerLap, (value) => `${value.toFixed(2)} L`);
  elements["fuel-laps"].textContent = valueOrDash(fuel.estimatedLaps, (value) => value.toFixed(1));
  elements["fuel-finish"].textContent = valueOrDash(fuel.estimatedAtFinish, (value) => `${signed(value, 1)} L`);
  setSemanticClass(elements["fuel-finish"], fuel.estimatedAtFinish);
  elements["fuel-context"].textContent = fuel.averagePerLap === null
    ? "Estimate pending · complete more laps" : "Estimate based on recent valid fuel samples";
}

function render(state) {
  renderConnection(state.connection);
  renderPosition(state.position);
  renderLaps(state.laps);
  renderFuel(state.fuel);
  elements["updated-at"].textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function showOffline() {
  elements["session-status"].dataset.state = "disconnected";
  elements["session-label"].textContent = "API reconnecting";
  elements["updated-at"].textContent = "Connection lost · retrying";
}

async function poll() {
  try {
    const response = await fetch("/api/race/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch {
    showOffline();
  } finally {
    window.setTimeout(poll, 1000);
  }
}

poll();
