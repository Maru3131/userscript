(() => {
  "use strict";
  const id = "local-janitor-warm-composer";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  const cls = name => `:is([class^="_${name}_"],[class*=" _${name}_"])`;
  const container = `${cls("chatInputContainer")}:has(textarea)`;
  const wrapper = `${container} > ${cls("chatInputWrapper")}`;
  const inner = `${wrapper} > ${cls("chatInputInner")}`;
  const textarea = `${inner} ${cls("chatTextarea")}`;
  const send = `${inner} ${cls("sendButton")}`;
  const switcher = `${inner} ${cls("switcher")}`;
  const sparkle = `${inner} ${cls("sparkleButton")}`;
  style.textContent = `
    ${container} {
      --jif-cream: #eee6da;
      --jif-muted: #b8ab9d;
      --jif-clay: #d3987b;
      --jif-line: rgba(211,152,123,.3);
    }
    ${wrapper} {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
    ${inner} {
      background: linear-gradient(135deg, rgba(255,239,216,.065), rgba(255,239,216,.015)), rgba(43,36,31,.32) !important;
      border: 1px solid var(--jif-line) !important;
      border-radius: 18px !important;
      box-shadow: inset 0 1px 0 rgba(255,245,229,.1), 0 8px 28px rgba(0,0,0,.12) !important;
      backdrop-filter: blur(18px) saturate(115%) !important;
      -webkit-backdrop-filter: blur(18px) saturate(115%) !important;
      transition: border-color .18s, box-shadow .18s;
    }
    ${inner}:focus-within {
      border-color: rgba(211,152,123,.72) !important;
      box-shadow: 0 0 0 2px rgba(211,152,123,.1), 0 8px 28px rgba(0,0,0,.16) !important;
    }
    ${inner} > ${cls("controlsRow")} {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }
    ${textarea} {
      background: transparent !important;
      color: var(--jif-cream) !important;
      caret-color: var(--jif-clay) !important;
      border: none !important;
      box-shadow: none !important;
      outline: none !important;
    }
    ${textarea}::placeholder { color: var(--jif-muted) !important; opacity: 1 !important; }
    ${textarea}::selection { background: #795441; color: #fff8f0; }
    ${switcher} {
      background: rgba(238,230,218,.06) !important;
      color: var(--jif-cream) !important;
      border: 1px solid rgba(238,230,218,.14) !important;
      box-shadow: none !important;
      border-radius: 12px !important;
    }
    ${switcher}:hover { background: rgba(211,152,123,.14) !important; }
    ${sparkle} { color: var(--jif-clay) !important; background: transparent !important; }
    ${sparkle} svg path { fill: currentColor !important; }
    ${send} {
      background: #c78668 !important;
      color: #241a15 !important;
      border: 1px solid transparent !important;
      border-radius: 12px !important;
      box-shadow: none !important;
      opacity: 1 !important;
    }
    ${send}:hover:not(:disabled):not([aria-disabled="true"]) { background: #dea183 !important; }
    ${send}:disabled, ${send}[aria-disabled="true"] {
      background: rgba(238,230,218,.05) !important;
      color: #8a7c70 !important;
      border-color: rgba(238,230,218,.09) !important;
      cursor: default !important;
    }
    ${container} ${cls("scrollToBottomButton")} {
      background: rgba(43,36,31,.45) !important;
      backdrop-filter: blur(12px) !important;
      color: var(--jif-cream) !important;
      border: 1px solid var(--jif-line) !important;
    }
    ${inner} button:focus-visible, ${container} ${cls("scrollToBottomButton")}:focus-visible {
      outline: 2px solid var(--jif-clay) !important;
      outline-offset: 3px !important;
    }
    @media (prefers-reduced-motion: reduce) { ${inner} { transition: none; } }
  `;
  (document.head || document.documentElement).append(style);
})();
