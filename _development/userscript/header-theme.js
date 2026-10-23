(() => {
  "use strict";
  const id = "local-janitor-transparent-header";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  // Match the supplied CSS-module class names without depending on build hashes.
  // Require the known character-name control to avoid unrelated site headers.
  const header = ':is([class^="_headerContainer_"], [class*=" _headerContainer_"]):has(#character-name-button)';
  const grid = ':is([class^="_headerGrid_"], [class*=" _headerGrid_"])';
  const divider = ':is([class^="_customDivider_"], [class*=" _customDivider_"])';
  const text = ':is([class^="_customDividerText_"], [class*=" _customDividerText_"])';
  const surfaces = [header, `${header} > ${grid}`, `${header} > ${divider}`, `${header} > ${divider} > ${text}`];
  const selectors = surfaces.flatMap(selector => [selector, `${selector}::before`, `${selector}::after`]);
  style.textContent = `${selectors.join(",\n")} {
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }`;
  const cls = name => `:is([class^="_${name}_"],[class*=" _${name}_"])`;
  style.textContent += `
    @media (min-width: 0px) {
      ${header} {
        position: fixed !important;
        inset: 16px auto auto 16px !important;
        transform: none !important;
        width: clamp(160px, calc((100vw - 1060px) / 2 - 32px), 260px) !important;
        min-width: 0 !important;
        max-width: none !important;
        height: auto !important;
        margin: 0 !important;
        padding: 12px !important;
        box-sizing: border-box !important;
        border: 1px solid rgba(211,152,123,.18) !important;
        border-radius: 16px !important;
        background: rgba(43,36,31,.25) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        z-index: 100 !important;
        overflow: visible !important;
      }
      ${header} > ${grid} {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        width: 100% !important;
        min-width: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      ${header} ${cls("menuWrapper")} {
        display: flex !important;
        justify-content: space-between !important;
        flex-wrap: wrap !important;
        gap: 6px !important;
      }
      ${header} > ${divider} {
        display: block !important;
        padding: 12px 0 0 !important;
        margin: 0 !important;
        text-align: left !important;
      }
      ${header} > ${divider} > ${cls("customDividerLine")} { display: none !important; }
      ${header} > ${divider} > ${text} {
        position: static !important;
        transform: none !important;
        display: block !important;
        padding: 0 !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
        color: #c6b6a6 !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
      }
      ${header} #character-name-button { text-align: left !important; }
      ${header} ${cls("accordionContainer")} {
        position: absolute !important;
        top: calc(100% + 8px) !important;
        left: 0 !important;
        width: min(480px, calc(100vw - 32px)) !important;
        max-height: calc(100vh - 220px) !important;
        overflow-y: auto !important;
        border-radius: 14px !important;
        background: rgba(36,30,26,.94) !important;
      }
      ${header}:not(:has(#character-name-button[aria-expanded="true"])) ${cls("accordionContainer")} {
        display: none !important;
      }
      ${header}:has(#character-name-button[aria-expanded="true"]) ${cls("accordionContainer")} {
        display: block !important;
        height: auto !important;
        grid-template-rows: none !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        transform: none !important;
      }
      ${header}:has(#character-name-button[aria-expanded="true"]) #bio-accordion-panel {
        position: static !important;
        display: block !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
      }
    }
    @media (max-width: 1399px) {
      ${header} { width: 180px !important; max-width: calc(100vw - 32px) !important; padding: 8px 10px !important; }
      ${header} > ${grid} { display: none !important; }
      ${header}:hover > ${grid}, ${header}:focus-within > ${grid}, ${header}:has(#character-name-button[aria-expanded="true"]) > ${grid} { display: flex !important; }
      ${header} > ${divider} { padding-top: 0 !important; }
      ${header}:hover > ${divider}, ${header}:focus-within > ${divider}, ${header}:has(#character-name-button[aria-expanded="true"]) > ${divider} { padding-top: 10px !important; }
    }
  `;
  // Keep the real proxy button and its site handler. Blur on the header itself
  // would make a fixed descendant position relative to the left-hand card.
  style.textContent += `
    ${header} {
      background: transparent !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      isolation: isolate;
    }
    ${header}::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: rgba(43,36,31,.25) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      pointer-events: none;
      z-index: -1;
    }
    ${header} > ${grid}, ${header} ${cls("menuWrapper")} {
      transform: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      contain: none !important;
      will-change: auto !important;
    }
    ${header} ${cls("apiTag")} {
      position: fixed !important;
      inset: 16px 16px auto auto !important;
      transform: none !important;
      margin: 0 !important;
      width: auto !important;
      max-width: calc(100vw - 32px) !important;
      padding: 10px 14px !important;
      border-radius: 14px !important;
      border: 1px solid rgba(230,147,87,.45) !important;
      background: rgba(194,105,57,.24) !important;
      backdrop-filter: blur(16px) !important;
      color: #ffe0c4 !important;
      visibility: visible !important;
      pointer-events: auto !important;
      z-index: 2 !important;
    }
    ${header} ${cls("apiTag")}:hover { background: rgba(194,105,57,.4) !important; }
    ${header} ${cls("apiTag")}:focus-visible {
      outline: 2px solid #d3987b !important;
      outline-offset: 3px !important;
    }
    @media (max-width: 1399px) {
      ${header} > ${grid} {
        display: flex !important;
        height: 0 !important;
        overflow: visible !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      ${header}:hover > ${grid}, ${header}:focus-within > ${grid},
      ${header}:has(#character-name-button[aria-expanded="true"]) > ${grid} {
        height: auto !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
    }
    @media (max-width: 420px) {
      ${header} ${cls("apiTag")} { top: 76px !important; }
    }
  `;
  (document.head || document.documentElement).append(style);
})();
