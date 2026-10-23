(() => {
  "use strict";
  // Chat export (formerly the separate "JanitorAI Copy Chat" script, v1.0.0).
  // Copies the open chat as plain text. Messages come from JanitorAI's API, not
  // the page, so long chats are complete and none of our own overlays (floating
  // images, labels, notes, notices, theme UI) can end up in the export.
  const buttonId = "jai-copy-chat-btn"; // same id as the old script: never two buttons
  if (document.getElementById(buttonId)) return;

  const chatIdFromUrl = () => (String(location.pathname || "").match(/\/chats\/(\d+)/) || [])[1];

  const cookie = (n) => {
    const m = document.cookie.match(
      new RegExp("(?:^|; )" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
    );
    return m ? decodeURIComponent(m[1]) : "";
  };

  // JanitorAI keeps the login in a (possibly chunked) supabase cookie.
  const getToken = () => {
    try {
      let raw = cookie("sb-auth-auth-token");
      if (!raw) {
        for (let i = 0, part; (part = cookie(`sb-auth-auth-token.${i}`)); i++) raw += part;
      }
      raw = raw.replace(/^base64-/, "").replace(/-/g, "+").replace(/_/g, "/");
      raw += "=".repeat((4 - (raw.length % 4)) % 4);
      return JSON.parse(atob(raw)).access_token || null;
    } catch {
      return null;
    }
  };

  // This script runs in Violentmonkey's content context. In Firefox a plain
  // fetch() there is made by the extension, not the page; content.fetch() makes
  // the same request as the page itself (as the old @grant none script did).
  // The body is read as text and parsed here so no page-side objects leak in.
  async function getJSON(path) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const url = new URL(path, location.origin || location.href).href;
    const init = {
      headers: { accept: "application/json", authorization: "Bearer " + token },
      credentials: "include",
    };
    let response;
    if (typeof content !== "undefined" && content?.fetch && typeof cloneInto === "function") {
      response = await content.fetch(url, cloneInto(init, content));
    } else {
      response = await fetch(url, init);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(await response.text());
  }

  async function buildChatText() {
    const id = chatIdFromUrl();
    if (!id) throw new Error("Open a chat first");

    const data = await getJSON("/hampter/chats/" + id);

    let charName = data.character?.name || data.chat?.character?.name || "";
    if (!charName && data.chat?.character_id) {
      try {
        charName = (await getJSON("/hampter/characters/" + data.chat.character_id)).name || "";
      } catch {}
    }
    charName = charName || "Bot";
    const userName = data.personas?.[0]?.name || data.profile?.name || "User";

    const fill = (s) =>
      String(s ?? "")
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName)
        .trim();

    // is_main:false = a swipe you rejected; skip those
    const msgs = (data.chatMessages || [])
      .filter((m) => m.is_main !== false)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (msgs.length === 0) throw new Error("No messages found");

    const body = msgs
      .map((m) => `${m.is_bot ? charName : userName}:\n${fill(m.message)}`)
      .join("\n\n---\n\n");

    return { text: `# ${charName} (JanitorAI chat ${id})\n\n${body}\n`, count: msgs.length };
  }

  // GM_setClipboard works without a fresh click (needed in the content context
  // and from the script menu); the browser clipboard paths are fallbacks.
  async function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      try {
        await GM_setClipboard(text, "text");
        return true;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }

  // Last resort: show the text so it can be copied by hand
  function showManual(text) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-jai-copy-chat-ui", "");
    wrap.style.cssText =
      "position:fixed;inset:10%;z-index:2147483647;background:#241e1a;border:1px solid rgba(211,152,123,.45);" +
      "border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;";
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "flex:1;background:#17130f;color:#eee6da;font:13px monospace;border:1px solid rgba(211,152,123,.3);border-radius:8px;";
    const close = document.createElement("button");
    close.textContent = "Close (press Ctrl+C first)";
    close.style.cssText = "background:#c78668;color:#241a15;border:0;border-radius:10px;padding:8px;font:600 13px system-ui,sans-serif;cursor:pointer;";
    close.onclick = () => wrap.remove();
    wrap.append(ta, close);
    document.body.appendChild(wrap);
    ta.focus();
    ta.select();
  }

  let busy = false;
  async function copyChat(report) {
    if (busy) return;
    busy = true;
    report("Copying...");
    try {
      const { text, count } = await buildChatText();
      if (await copyText(text)) report(`Copied ${count} messages`, true);
      else {
        showManual(text);
        report("Copy it manually", true);
      }
    } catch (e) {
      console.error("[Copy chat]", e);
      report(String(e?.message ?? e), true);
    } finally {
      busy = false;
    }
  }

  const mount = () => {
    if (document.getElementById(buttonId)) return;
    const btn = document.createElement("button");
    btn.id = buttonId;
    btn.type = "button";
    btn.setAttribute("data-jai-copy-chat-ui", "");
    btn.textContent = "Copy chat";
    // Warm glass to match the composer. Kept below the floating image layers.
    btn.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147480000",
      "padding:8px 14px", "border-radius:12px", "border:1px solid rgba(230,147,87,.45)",
      "background:rgba(194,105,57,.24)", "backdrop-filter:blur(16px)", "-webkit-backdrop-filter:blur(16px)",
      "color:#ffe0c4", "font:600 13px system-ui,sans-serif",
      "cursor:pointer", "box-shadow:0 4px 14px rgba(0,0,0,.25)",
    ].join(";");

    const label = btn.textContent;
    let resetTimer;
    const report = (t, done) => {
      clearTimeout(resetTimer);
      btn.textContent = t.slice(0, 32);
      btn.disabled = !done;
      if (done) resetTimer = setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 3000);
    };
    btn.addEventListener("click", () => void copyChat(report));
    document.body.appendChild(btn);

    // JanitorAI is a single-page app: only show the button on chat pages
    setInterval(() => {
      btn.style.display = chatIdFromUrl() ? "" : "none";
    }, 500);
  };

  GM_registerMenuCommand("Copy chat to clipboard", () => {
    void copyChat((t, done) => { if (done) toast(t); });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
