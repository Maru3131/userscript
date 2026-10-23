// ==UserScript==
// @name         JanitorAI Copy Chat
// @namespace    janitorai-copy-chat
// @version      1.0.0
// @description  Adds a button that copies the open JanitorAI chat to your clipboard as plain text.
// @match        https://janitorai.com/*
// @match        https://www.janitorai.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Maru3131/userscript/main/janitorai-copy-chat.user.js
// @downloadURL  https://raw.githubusercontent.com/Maru3131/userscript/main/janitorai-copy-chat.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---- auth: JanitorAI keeps the login in a (possibly chunked) supabase cookie ----
  const cookie = (n) => {
    const m = document.cookie.match(
      new RegExp("(?:^|; )" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
    );
    return m ? decodeURIComponent(m[1]) : "";
  };

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

  const api = async (path) => {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const r = await fetch(path, {
      headers: { accept: "application/json", authorization: "Bearer " + token },
      credentials: "include",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const chatIdFromUrl = () => (location.pathname.match(/\/chats\/(\d+)/) || [])[1];

  // ---- build the text from the API (not the page), so long chats come out complete ----
  async function buildText() {
    const id = chatIdFromUrl();
    if (!id) throw new Error("Open a chat first");

    const data = await api("/hampter/chats/" + id);

    let charName = data.character?.name || data.chat?.character?.name || "";
    if (!charName && data.chat?.character_id) {
      try {
        charName = (await api("/hampter/characters/" + data.chat.character_id)).name || "";
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

  // ---- clipboard, with fallbacks ----
  async function copy(text) {
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
    wrap.style.cssText =
      "position:fixed;inset:10%;z-index:2147483647;background:#1e1e1e;border:1px solid #555;" +
      "border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;";
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "flex:1;background:#111;color:#eee;font:13px monospace;";
    const close = document.createElement("button");
    close.textContent = "Close (press Ctrl+C first)";
    close.onclick = () => wrap.remove();
    wrap.append(ta, close);
    document.body.appendChild(wrap);
    ta.focus();
    ta.select();
  }

  // ---- button ----
  const mount = () => {
    if (document.getElementById("jai-copy-chat-btn")) return;
    const btn = document.createElement("button");
    btn.id = "jai-copy-chat-btn";
    btn.textContent = "Copy chat";
    btn.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
      "padding:8px 14px", "border-radius:10px", "border:1px solid rgba(255,255,255,.25)",
      "background:#3a3a46", "color:#fff", "font:600 13px system-ui,sans-serif",
      "cursor:pointer", "box-shadow:0 4px 14px rgba(0,0,0,.35)",
    ].join(";");

    const label = btn.textContent;
    const flash = (t) => {
      btn.textContent = t.slice(0, 32);
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 3000);
    };

    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = "Copying...";
      try {
        const { text, count } = await buildText();
        if (await copy(text)) flash(`Copied ${count} messages`);
        else {
          showManual(text);
          flash("Copy it manually");
        }
      } catch (e) {
        console.error("[Copy chat]", e);
        flash(String(e?.message ?? e));
      }
    });

    document.body.appendChild(btn);

    // JanitorAI is a single-page app: only show the button on chat pages
    setInterval(() => {
      btn.style.display = chatIdFromUrl() ? "" : "none";
    }, 500);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
