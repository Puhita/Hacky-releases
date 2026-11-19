// Hacky remote: a small page that talks to the database as the logged-in person. It shows the chats the
// desktop app shares, and leaves commands the app picks up. Everything is that person's own data
// (row rules), and nothing here uses innerHTML, so what a chat said can't run as code.
// The login lives in sessionStorage: closing the tab logs out.
(function () {
  "use strict";
  // No other site may show this page in a frame (a host that sends no headers can't forbid it).
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }
  var cfg = window.HACKY_REMOTE;
  var $ = function (id) { return document.getElementById(id); };
  var session = null;
  var current = null; // the open chat's row
  var timer = null;
  var view = "login";

  function load() { try { session = JSON.parse(sessionStorage.getItem("hacky-remote") || "null"); } catch (e) { session = null; } }
  function save() { if (session) sessionStorage.setItem("hacky-remote", JSON.stringify(session)); else sessionStorage.removeItem("hacky-remote"); }
  function keep(data) { session = { access: data.access_token, refresh: data.refresh_token, at: Date.now() + (data.expires_in - 60) * 1000 }; save(); }

  async function auth(body, grant) {
    var res = await fetch(cfg.url + "/auth/v1/token?grant_type=" + grant, { method: "POST", headers: { apikey: cfg.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error_description || data.msg || "Couldn't log in.");
    keep(data);
  }

  async function token() {
    if (!session) throw new Error("Log in first.");
    if (Date.now() > session.at) await auth({ refresh_token: session.refresh }, "refresh_token");
    return session.access;
  }

  async function db(path, options) {
    var access = await token();
    var res = await fetch(cfg.url + "/rest/v1/" + path, Object.assign({}, options, { headers: Object.assign({ apikey: cfg.key, Authorization: "Bearer " + access, "Content-Type": "application/json" }, options && options.headers) }));
    if (!res.ok) throw new Error("Something went wrong (" + res.status + ").");
    return res.status === 204 ? null : res.json().catch(function () { return null; });
  }

  function el(tag, cls, text) { var node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }

  function show(which) {
    view = which;
    $("login").hidden = which !== "login";
    $("list").hidden = which !== "list";
    $("chat").hidden = which !== "chat";
    $("foot").hidden = which !== "chat";
    $("back").hidden = which !== "chat";
    $("logo").hidden = which === "chat";
    $("out").hidden = which === "login";
    if (which !== "chat") $("title").textContent = "Hacky remote";
    document.title = which === "chat" && current ? (current.title || "Chat") + " · Hacky" : "Hacky remote";
    measure();
  }

  // The yes/no card sticks above the message box, so it needs to know how tall that is.
  function measure() { document.documentElement.style.setProperty("--composer", ($("foot").offsetHeight || 0) + 8 + "px"); }

  var STATE = { idle: "Idle", busy: "Working", waiting: "Needs you" };

  async function refreshList() {
    var rows = await db("remote_chats?select=*&order=updated_at.desc");
    var box = $("chats");
    box.textContent = "";
    var fresh = rows.some(function (row) { return Date.now() - new Date(row.updated_at).getTime() < 60000; });
    $("offline").hidden = fresh || rows.length === 0;
    $("none").hidden = rows.length > 0;
    rows.sort(function (a, b) { return (b.state === "waiting") - (a.state === "waiting"); });
    rows.forEach(function (row) {
      var button = el("button", "chat-card" + (row.state === "waiting" ? " needs" : ""));
      button.type = "button";
      var top = el("div", "top");
      top.appendChild(el("span", "dot " + row.state));
      top.appendChild(el("span", "name", row.title || "New chat"));
      top.appendChild(el("span", "pill " + row.state, STATE[row.state] || row.state));
      button.appendChild(top);
      button.appendChild(el("div", "meta", row.folder_name + (row.used_pct === null ? "" : " · context " + row.used_pct + "%") + (row.cost_usd === null ? "" : " · $" + Number(row.cost_usd).toFixed(2))));
      if (row.used_pct !== null) {
        var meter = el("div", "meter" + (row.used_pct >= 90 ? " full" : row.used_pct >= 70 ? " hot" : ""));
        meter.setAttribute("role", "img");
        meter.setAttribute("aria-label", "Context " + row.used_pct + "% used");
        var fill = el("i");
        fill.style.width = row.used_pct + "%";
        meter.appendChild(fill);
        button.appendChild(meter);
      }
      button.onclick = function () { current = row; openChat(); };
      box.appendChild(button);
    });
  }

  async function refreshChat() {
    var ref = encodeURIComponent(current.ref);
    var rows = await db("remote_chats?select=*&ref=eq." + ref);
    if (rows[0]) current = rows[0];
    var events = (await db("remote_events?select=*&ref=eq." + ref + "&order=id.desc&limit=30")).reverse();
    $("title").textContent = current.title || "New chat";
    document.title = (current.title || "Chat") + " · Hacky";
    var box = $("events");
    var wasAtEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    box.textContent = "";
    if (events.length === 0) box.appendChild(el("div", "bubble sys", "Replies and questions show up here as they happen."));
    var lastAsk = null;
    events.forEach(function (event) {
      if (event.kind === "approval") { lastAsk = event; box.appendChild(el("div", "bubble sys", "Asked: " + event.body)); return; }
      box.appendChild(el("div", "bubble" + (event.kind === "user" ? " you" : event.kind === "error" ? " fail" : ""), event.body));
    });
    var waiting = current.state === "waiting" && lastAsk && lastAsk.request_id;
    $("asking").hidden = !waiting;
    if (waiting) { $("askText").textContent = lastAsk.body; $("asking").dataset.request = lastAsk.request_id; }
    else if (current.state === "waiting") { $("asking").hidden = false; $("askText").textContent = "Answer this on the computer."; $("asking").dataset.request = ""; }
    $("yes").hidden = $("no").hidden = !waiting;
    $("stop").hidden = current.state !== "busy";
    $("sendBtn").disabled = current.state !== "idle" || !$("text").value.trim();
    $("text").placeholder = current.state === "idle" ? "Message the agent" : current.state === "busy" ? "The agent is working…" : "Answer the question first";
    measure();
    if (wasAtEnd || waiting) window.scrollTo(0, document.body.scrollHeight);
  }

  async function command(kind, body, requestId) {
    $("sendErr").textContent = "";
    try {
      await db("remote_commands", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ref: current.ref, kind: kind, body: body || null, request_id: requestId || null }) });
      setTimeout(poll, 800);
    } catch (e) { $("sendErr").textContent = e.message; }
  }

  function openChat() { show("chat"); $("events").textContent = ""; poll(); }

  async function poll() {
    try {
      if (!session) return;
      if (view === "chat" && current) await refreshChat(); else await refreshList();
    } catch (e) {
      if (!session || /Log in|refresh|Invalid/i.test(e.message)) logout();
    }
  }

  function start() { show("list"); poll(); clearInterval(timer); timer = setInterval(poll, 3000); }
  function logout() { session = null; save(); clearInterval(timer); current = null; show("login"); }

  $("login").onsubmit = async function (event) {
    event.preventDefault();
    $("loginErr").textContent = "";
    $("loginBtn").disabled = true;
    try { await auth({ email: $("email").value.trim(), password: $("pass").value }, "password"); $("pass").value = ""; start(); }
    catch (e) { $("loginErr").textContent = e.message; }
    $("loginBtn").disabled = false;
  };
  $("out").onclick = logout;
  $("back").onclick = function () { current = null; show("list"); poll(); };
  $("send").onsubmit = function (event) {
    event.preventDefault();
    var text = $("text").value.trim();
    if (!text || $("sendBtn").disabled) return;
    $("text").value = "";
    grow();
    $("sendBtn").disabled = true;
    command("send", text);
  };
  function grow() { var box = $("text"); box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 140) + "px"; measure(); }
  $("text").oninput = function () { grow(); if (current) $("sendBtn").disabled = current.state !== "idle" || !$("text").value.trim(); };
  $("yes").onclick = function () { command("approve", null, $("asking").dataset.request); };
  $("no").onclick = function () { command("deny", null, $("asking").dataset.request); };
  $("stop").onclick = function () { command("stop"); };
  window.addEventListener("resize", measure);

  load();
  if (session) start(); else show("login");
})();
