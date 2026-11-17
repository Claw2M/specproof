/**
 * Renders the SpecProof Team Cloud & Open-Core web interface styled with the Framer
 * dark-canvas design system (#090909 artboard, #141414 / #1c1c1c surface lift, binary
 * #ffffff / #999999 ink hierarchy, #0099ff signal accent, white/charcoal pill CTAs,
 * gradient spotlight tiles, native <dialog> modals/drawer, and accessible <details> FAQ).
 */
export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>SpecProof — Execution-Backed Proof for AI Code</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #ffffff;
      --on-primary: #000000;
      --accent-blue: #0099ff;
      --ink: #ffffff;
      --ink-muted: #999999;
      --canvas: #090909;
      --surface-1: #141414;
      --surface-2: #1c1c1c;
      --hairline: #262626;
      --hairline-soft: #1a1a1a;
      --scrollbar-thumb: #3a3a3a;
      --gradient-magenta: #d44df0;
      --gradient-violet: #6a4cf5;
      --gradient-orange: #ff7a3d;
      --gradient-coral: #ff5577;
      --semantic-success: #22c55e;

      --rounded-xs: 4px;
      --rounded-sm: 6px;
      --rounded-md: 10px;
      --rounded-lg: 15px;
      --rounded-xl: 20px;
      --rounded-xxl: 30px;
      --rounded-pill: 100px;
      --rounded-full: 9999px;

      --space-hair: 1px;
      --space-xxs: 4px;
      --space-xs: 8px;
      --space-sm: 12px;
      --space-md: 15px;
      --space-lg: 20px;
      --space-xl: 30px;
      --space-xxl: 40px;
      --space-section: 96px;

      color-scheme: dark;
      accent-color: var(--accent-blue);
      scrollbar-color: var(--scrollbar-thumb) var(--canvas);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
      background: var(--canvas);
      overflow-x: clip;
    }

    body {
      margin: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      font-weight: 400;
      line-height: 1.3;
      letter-spacing: -0.15px;
      font-feature-settings: "cv01" 1, "cv05" 1, "cv09" 1, "cv11" 1, "ss03" 1, "ss07" 1, "dlig" 1;
      -webkit-font-smoothing: antialiased;
      overflow-x: clip;
    }

    a {
      color: var(--accent-blue);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .container {
      max-inline-size: 1199px;
      margin-inline: auto;
      padding-inline: var(--space-xl);
    }

    /* Top Nav (56px, solid canvas, binary ink, pill pair) */
    .top-nav {
      position: sticky;
      inset-block-start: 0;
      z-index: 30;
      block-size: 56px;
      background: var(--canvas);
      border-block-end: 1px solid var(--hairline-soft);
    }

    .top-nav-inner {
      max-inline-size: 1199px;
      block-size: 100%;
      margin-inline: auto;
      padding-inline: var(--space-xl);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-lg);
    }

    .nav-left {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .wordmark {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--ink);
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.4px;
    }

    .wordmark:hover {
      text-decoration: none;
    }

    .wordmark-mark {
      inline-size: 22px;
      block-size: 22px;
      border-radius: var(--rounded-sm);
      background: var(--primary);
      color: var(--on-primary);
      display: grid;
      place-items: center;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: var(--space-xl);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.14px;
    }

    .nav-links a {
      color: var(--ink-muted);
      transition: color 120ms ease;
    }

    .nav-links a:hover {
      color: var(--ink);
      text-decoration: none;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }

    .mobile-menu-btn {
      display: none;
      inline-size: 40px;
      block-size: 40px;
      border-radius: var(--rounded-full);
      border: none;
      background: var(--surface-1);
      color: var(--ink);
      font-size: 18px;
      cursor: pointer;
      place-items: center;
    }

    /* Pill Buttons */
    .btn-primary,
    .btn-secondary,
    .btn-translucent,
    .btn-icon-circular {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-block-size: 44px;
      padding: 10px 15px;
      border-radius: var(--rounded-pill);
      border: none;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      line-height: 1;
      letter-spacing: -0.14px;
      cursor: pointer;
      text-decoration: none;
      transition: transform 110ms ease, background-color 140ms ease;
      white-space: nowrap;
    }

    .btn-primary {
      background: var(--primary);
      color: var(--on-primary);
    }

    .btn-primary:hover {
      text-decoration: none;
      opacity: 0.94;
    }

    .btn-primary:active,
    .btn-secondary:active {
      transform: scale(0.97);
    }

    .btn-secondary {
      background: var(--surface-1);
      color: var(--ink);
    }

    .btn-secondary:hover {
      background: var(--surface-2);
      text-decoration: none;
    }

    /* Surface lift inside surface-1 cards so secondary pills never vanish */
    .control-panel .btn-secondary,
    .subcard .btn-secondary {
      background: var(--surface-2);
    }

    .control-panel .btn-secondary:hover,
    .subcard .btn-secondary:hover {
      background: var(--hairline);
    }

    .btn-translucent {
      background: var(--surface-2);
      color: var(--ink);
      border-radius: var(--rounded-xxl);
      padding: 10px 16px;
      min-block-size: 44px;
    }

    .btn-icon-circular {
      inline-size: 36px;
      block-size: 36px;
      min-block-size: 36px;
      padding: 0;
      border-radius: var(--rounded-full);
      background: var(--surface-2);
      color: var(--ink-muted);
    }

    .btn-icon-circular:hover {
      color: var(--ink);
      background: var(--hairline);
    }

    /* Poster Hero */
    .hero {
      padding-block: var(--space-section) 64px;
      text-align: center;
    }

    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: var(--rounded-pill);
      background: var(--surface-2);
      color: var(--ink-muted);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.13px;
      margin-block-end: var(--space-xl);
    }

    .hero-eyebrow strong {
      color: var(--ink);
      font-weight: 500;
    }

    .display-hero {
      margin: 0 auto var(--space-xl);
      max-inline-size: 920px;
      font-size: clamp(2.5rem, 7.2vw, 5.3125rem);
      font-weight: 500;
      line-height: 0.94;
      letter-spacing: -0.05em;
      color: var(--ink);
      font-feature-settings: "ss02" 1;
    }

    .hero-subhead {
      margin: 0 auto var(--space-xxl);
      max-inline-size: 620px;
      font-size: 18px;
      font-weight: 400;
      line-height: 1.35;
      letter-spacing: -0.18px;
      color: var(--ink-muted);
    }

    .hero-ctas {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-sm);
    }

    /* Sections & Bento Showcase */
    .section {
      padding-block: 64px;
    }

    .section-header {
      margin-block-end: var(--space-xxl);
    }

    .display-lg {
      margin: 0 0 var(--space-md);
      font-size: clamp(2rem, 5vw, 3.875rem);
      font-weight: 500;
      line-height: 1;
      letter-spacing: -0.05em;
      color: var(--ink);
      font-feature-settings: "ss02" 1;
    }

    .display-md {
      margin: 0 0 var(--space-xs);
      font-size: clamp(1.5rem, 3vw, 2rem);
      font-weight: 500;
      line-height: 1.13;
      letter-spacing: -0.03em;
      color: var(--ink);
    }

    .section-sub {
      margin: 0;
      max-inline-size: 620px;
      font-size: 18px;
      line-height: 1.35;
      letter-spacing: -0.18px;
      color: var(--ink-muted);
    }

    .bento-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-lg);
    }

    .bento-grid > *,
    .split-2 > *,
    .pricing-grid > * {
      min-inline-size: 0;
    }

    .spotlight-card {
      border-radius: var(--rounded-xxl);
      padding: 32px;
      color: var(--ink);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--space-xl);
      min-block-size: 290px;
    }

    .spotlight-violet {
      background: linear-gradient(135deg, var(--gradient-violet) 0%, var(--gradient-magenta) 100%);
    }

    .spotlight-orange {
      background: linear-gradient(135deg, var(--gradient-orange) 0%, var(--gradient-coral) 100%);
    }

    .spotlight-kicker {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.13px;
      opacity: 0.9;
      margin: 0 0 var(--space-xs);
    }

    .spotlight-title {
      margin: 0;
      font-size: 24px;
      font-weight: 400;
      line-height: 1.3;
      letter-spacing: -0.01px;
    }

    .spotlight-body {
      margin: var(--space-sm) 0 0;
      font-size: 15px;
      line-height: 1.35;
      letter-spacing: -0.15px;
      opacity: 0.92;
    }

    .surface-tile {
      background: var(--surface-1);
      border-radius: var(--rounded-xl);
      padding: var(--space-xl);
      border-block-start: 0.5px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--space-lg);
      min-inline-size: 0;
    }

    .kpi-mini-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-md);
    }

    .kpi-box {
      background: var(--surface-2);
      border-radius: var(--rounded-lg);
      padding: var(--space-md);
      min-inline-size: 0;
    }

    .kpi-label {
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-muted);
    }

    .kpi-value {
      margin: 0;
      font-size: 30px;
      font-weight: 600;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      color: var(--ink);
    }

    .cli-frame {
      margin: 0;
      background: var(--canvas);
      border: 1px solid var(--hairline);
      border-radius: var(--rounded-lg);
      padding: var(--space-md);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      color: var(--ink);
      overflow-x: auto;
      max-inline-size: 100%;
    }

    .cli-muted {
      color: var(--ink-muted);
    }

    .cli-ok {
      color: var(--ink);
      font-weight: 600;
    }

    /* Live Control Plane Section */
    .control-panel {
      background: var(--surface-1);
      border-radius: var(--rounded-xl);
      padding: var(--space-xl);
      border-block-start: 0.5px solid rgba(255, 255, 255, 0.1);
      display: grid;
      gap: var(--space-lg);
      min-inline-size: 0;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-xs);
      max-inline-size: 100%;
    }

    /* Pricing-tab pattern: >= 40px tap height, surface lift without chromatic fill */
    .tab-group {
      display: inline-flex;
      flex-wrap: wrap;
      background: var(--canvas);
      border-radius: var(--rounded-pill);
      padding: 4px;
      gap: 2px;
    }

    .tab-pill {
      min-block-size: 40px;
      padding: 8px 14px;
      border-radius: var(--rounded-pill);
      border: none;
      background: var(--canvas);
      color: var(--ink-muted);
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.14px;
      cursor: pointer;
    }

    .tab-pill[aria-pressed="true"] {
      background: var(--surface-2);
      color: var(--ink);
    }

    .text-input {
      background: var(--surface-1);
      color: var(--ink);
      border: 1px solid var(--hairline);
      border-radius: var(--rounded-md);
      padding: 10px 14px;
      min-block-size: 44px;
      font: inherit;
      font-size: max(1rem, 14px);
      letter-spacing: -0.14px;
      outline: none;
      max-inline-size: 100%;
      inline-size: 100%;
    }

    @media (pointer: coarse) {
      .text-input {
        min-block-size: 48px;
      }
    }

    .toolbar .text-input,
    .policy-row .text-input {
      inline-size: auto;
    }

    .control-panel .text-input {
      background: var(--canvas);
    }

    .text-input::placeholder {
      color: var(--ink-muted);
    }

    .text-input:focus-visible {
      outline: 2px solid var(--accent-blue);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(0, 153, 255, 0.15);
    }

    :is(.text-input):user-invalid {
      border-color: var(--gradient-coral);
    }

    .field {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
      min-inline-size: 0;
    }

    .field-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-muted);
      letter-spacing: -0.12px;
    }

    .error-msg {
      display: none;
      font-size: 12px;
      color: var(--gradient-coral);
      margin-block-start: 2px;
    }

    :is(input, select, textarea):user-invalid ~ .error-msg {
      display: block;
    }

    .visually-hidden:where(:not(:focus-within, :active)) {
      position: absolute !important;
      clip-path: inset(50%) !important;
      overflow: hidden !important;
      width: 1px !important;
      height: 1px !important;
      margin: -1px !important;
      padding: 0 !important;
      border: 0 !important;
      white-space: nowrap !important;
    }

    /* Responsive Table with sticky headers & @container mobile stack */
    .table-wrapper {
      overflow: auto;
      max-inline-size: 100%;
      max-block-size: min(460px, 65vh);
      container-type: inline-size;
      border: 1px solid var(--hairline);
      border-radius: var(--rounded-lg);
      background: var(--canvas);
    }

    table {
      inline-size: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      --label-1: "Repository";
      --label-2: "Branch / PR";
      --label-3: "Gate";
      --label-4: "Findings";
      --label-5: "Mutation";
      --label-6: "Spec";
      --label-7: "Timestamp";
      --label-8: "Actions";
    }

    caption {
      text-align: start;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink-muted);
      background: var(--surface-1);
      border-block-end: 1px solid var(--hairline-soft);
    }

    thead {
      position: sticky;
      inset-block-start: 0;
      z-index: 2;
      background: var(--surface-1);
    }

    th,
    td {
      padding: 12px 16px;
      border-block-end: 1px solid var(--hairline-soft);
      text-align: start;
      white-space: nowrap;
    }

    thead th {
      color: var(--ink-muted);
      font-size: 13px;
      font-weight: 500;
    }

    tbody th {
      position: sticky;
      inset-inline-start: 0;
      z-index: 1;
      background: var(--canvas);
      color: var(--ink);
      font-weight: 600;
    }

    tbody td {
      color: var(--ink-muted);
    }

    tbody tr:hover th,
    tbody tr:hover td {
      background: var(--surface-1);
      cursor: pointer;
    }

    tbody tr[data-selected="true"] th {
      background: var(--surface-2);
      box-shadow: inset 3px 0 0 var(--accent-blue);
    }

    tbody tr[data-selected="true"] td {
      background: var(--surface-2);
      color: var(--ink);
    }

    .gate-pass {
      color: var(--ink);
      font-weight: 600;
    }

    .gate-fail {
      color: var(--ink-muted);
      font-weight: 600;
      text-decoration: underline dotted var(--accent-blue);
    }

    @container (width < 640px) {
      table, thead, tbody, tr, th, td {
        display: block;
      }

      thead {
        display: none;
      }

      tr {
        margin: 12px;
        border: 1px solid var(--hairline);
        border-radius: var(--rounded-md);
        overflow: hidden;
        background: var(--surface-1);
      }

      tbody th {
        position: sticky;
        inset-block-start: 0;
        z-index: 2;
        background: var(--surface-2);
      }

      td {
        white-space: normal;
      }

      td:nth-child(2)::before { content: var(--label-2) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(3)::before { content: var(--label-3) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(4)::before { content: var(--label-4) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(5)::before { content: var(--label-5) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(6)::before { content: var(--label-6) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(7)::before { content: var(--label-7) ": "; color: var(--ink); font-weight: 500; }
      td:nth-child(8)::before { content: var(--label-8) ": "; color: var(--ink); font-weight: 500; }
    }

    .split-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-lg);
    }

    .subcard {
      background: var(--canvas);
      border: 1px solid var(--hairline-soft);
      border-radius: var(--rounded-lg);
      padding: var(--space-lg);
      min-inline-size: 0;
    }

    .subcard h3 {
      margin: 0 0 var(--space-md);
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.3px;
    }

    .policy-form {
      display: grid;
      gap: var(--space-sm);
    }

    .policy-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      color: var(--ink-muted);
      font-size: 14px;
    }

    pre.proof-box {
      margin: 0;
      padding: var(--space-md);
      border-radius: var(--rounded-md);
      background: var(--surface-1);
      border: 1px solid var(--hairline-soft);
      color: var(--ink-muted);
      font-size: 12px;
      line-height: 1.45;
      overflow: auto;
      max-block-size: 280px;
    }

    .proof-summary {
      display: grid;
      gap: var(--space-sm);
      max-block-size: 280px;
      overflow: auto;
    }

    .proof-item {
      background: var(--surface-1);
      border: 1px solid var(--hairline-soft);
      border-radius: var(--rounded-md);
      padding: 10px 12px;
      font-size: 13px;
      display: grid;
      gap: 4px;
    }

    .proof-item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-weight: 500;
    }

    .proof-item-meta {
      color: var(--ink-muted);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .spec-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-xs);
    }

    .spec-list {
      display: grid;
      gap: var(--space-xs);
      max-block-size: 250px;
      overflow: auto;
    }

    .trend-list {
      display: grid;
      gap: 10px;
    }

    .trend-row {
      display: grid;
      gap: 6px;
    }

    .trend-meta {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--ink-muted);
      font-variant-numeric: tabular-nums;
    }

    .trend-meta strong {
      color: var(--ink);
      font-weight: 500;
    }

    .trend-track {
      block-size: 6px;
      border-radius: var(--rounded-pill);
      background: var(--surface-2);
      overflow: hidden;
    }

    .trend-fill {
      block-size: 100%;
      background: var(--primary);
      border-radius: var(--rounded-pill);
    }

    .toast-msg {
      font-size: 13px;
      color: var(--ink-muted);
      min-block-size: 18px;
    }

    /* Comparison table & Pricing */
    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-md);
      margin-block-end: var(--space-xxl);
    }

    .pricing-card,
    .pricing-card-featured {
      border-radius: var(--rounded-xl);
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: var(--space-lg);
    }

    .pricing-card {
      background: var(--surface-1);
    }

    .pricing-card-featured {
      background: var(--surface-2);
      border-block-start: 0.5px solid rgba(255, 255, 255, 0.14);
    }

    .tier-name {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.8px;
      line-height: 1.2;
      font-feature-settings: "cv05" 1;
    }

    .tier-price {
      margin: 0 0 12px;
      font-size: 32px;
      font-weight: 500;
      letter-spacing: -1px;
      line-height: 1.1;
    }

    .tier-price span {
      font-size: 14px;
      font-weight: 400;
      color: var(--ink-muted);
      letter-spacing: -0.14px;
    }

    .tier-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
      font-size: 14px;
      color: var(--ink-muted);
    }

    .tier-list li::before {
      content: "✓ ";
      color: var(--semantic-success);
      font-weight: 700;
    }

    .compare-wrap {
      overflow-x: auto;
      border: 1px solid var(--hairline-soft);
      border-radius: var(--rounded-lg);
    }

    .compare-table th {
      color: var(--ink);
      background: var(--canvas);
      font-weight: 500;
    }

    .compare-table td {
      color: var(--ink-muted);
      background: var(--canvas);
      font-size: 14px;
    }

    .check-yes {
      color: var(--semantic-success);
      font-weight: 700;
    }

    /* FAQ Accordion (details/summary) */
    .accordion {
      display: grid;
      gap: 8px;
    }

    .accordion details {
      background: var(--canvas);
      border-block-end: 1px solid var(--hairline-soft);
      border-radius: var(--rounded-md);
    }

    .accordion summary {
      list-style: none;
      padding: 20px 16px;
      font-size: 16px;
      font-weight: 500;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .accordion summary::before {
      content: "+";
      color: var(--ink-muted);
      font-weight: 400;
      inline-size: 16px;
      text-align: center;
    }

    .accordion details[open] > summary::before {
      content: "−";
      color: var(--ink);
    }

    .accordion .faq-body {
      padding: 0 16px 20px 44px;
      color: var(--ink-muted);
      font-size: 15px;
      line-height: 1.45;
    }

    /* Native Modal <dialog> + Mobile Navigation Drawer */
    dialog.guide-modal {
      background: var(--surface-1);
      color: var(--ink);
      border: 1px solid var(--hairline);
      border-radius: var(--rounded-xl);
      padding: 24px;
      max-inline-size: min(640px, calc(100vw - 32px));
      inline-size: 100%;
    }

    dialog:modal {
      overscroll-behavior: contain;
    }

    dialog::backdrop {
      overflow: hidden;
      overscroll-behavior: contain;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(4px);
    }

    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-block-end: 16px;
    }

    .modal-head h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.6px;
    }

    dialog.Drawer {
      --drawer-width: min(20em, 80dvw, 100dvw - 24px);
      inset: 0;
      inline-size: auto;
      block-size: auto;
      max-inline-size: none;
      max-block-size: none;
      margin: 0;
      padding: 0;
      background: transparent;
      border: 0;
      overflow: visible;
    }

    .Drawer-sheet {
      inline-size: var(--drawer-width);
      block-size: 100svh;
      background: var(--surface-1);
      color: var(--ink);
      padding: 24px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 20px;
      border-inline-end: 1px solid var(--hairline);
    }

    .Drawer-links {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 14px;
    }

    .Drawer-links a {
      color: var(--ink);
      font-size: 16px;
      font-weight: 500;
    }

    footer {
      border-block-start: 1px solid var(--hairline-soft);
      padding: 64px 32px;
      color: var(--ink-muted);
      font-size: 13px;
      letter-spacing: -0.13px;
    }

    .footer-grid {
      max-inline-size: 1199px;
      margin-inline: auto;
      display: grid;
      grid-template-columns: 2fr repeat(3, 1fr);
      gap: var(--space-xl);
    }

    .footer-col h4 {
      margin: 0 0 12px;
      color: var(--ink);
      font-size: 13px;
      font-weight: 500;
    }

    .footer-col ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }

    .footer-col a {
      color: var(--ink-muted);
    }

    @media (max-width: 1024px) {
      .pricing-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 810px) {
      .container,
      .top-nav-inner {
        padding-inline: var(--space-md);
      }

      .nav-links,
      .nav-actions .btn-secondary {
        display: none;
      }

      .mobile-menu-btn {
        display: inline-grid;
      }

      .bento-grid,
      .split-2,
      .pricing-grid,
      .footer-grid {
        grid-template-columns: 1fr;
      }

      .hero {
        padding-block: 56px 36px;
      }
    }

    @media (max-width: 640px) {
      .spec-form-grid,
      .kpi-mini-grid {
        grid-template-columns: 1fr;
      }

      .control-panel {
        padding: var(--space-md);
      }
    }
  </style>
</head>
<body>
  <nav class="top-nav" aria-label="Primary navigation">
    <div class="top-nav-inner">
      <div class="nav-left">
        <button
          type="button"
          id="mobile-nav-open"
          class="mobile-menu-btn"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls="mobile-drawer"
        >☰</button>
        <a href="#" class="wordmark">
          <span class="wordmark-mark">SP</span>
          <span>SpecProof</span>
        </a>
      </div>
      <div class="nav-links">
        <a href="#showcase">Telemetry</a>
        <a href="#control-plane">Live Runs</a>
        <a href="#comparison">Compare</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQ</a>
      </div>
      <div class="nav-actions">
        <a href="#showcase" class="btn-secondary">Live Telemetry</a>
        <button type="button" class="btn-primary open-guide-btn" data-guide-tab="cli">Get Started Free</button>
      </div>
    </div>
  </nav>

  <dialog class="Drawer" id="mobile-drawer" aria-label="Mobile navigation">
    <nav class="Drawer-sheet">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="wordmark"><span class="wordmark-mark">SP</span><span>SpecProof</span></span>
        <button type="button" id="mobile-nav-close" class="btn-icon-circular" aria-label="Close menu" autofocus>✕</button>
      </div>
      <ul class="Drawer-links">
        <li><a href="#showcase" class="drawer-link">Live Telemetry</a></li>
        <li><a href="#control-plane" class="drawer-link">Control Plane</a></li>
        <li><a href="#comparison" class="drawer-link">Compare Tools</a></li>
        <li><a href="#pricing" class="drawer-link">Pricing</a></li>
        <li><a href="#faq" class="drawer-link">FAQ</a></li>
      </ul>
    </nav>
  </dialog>

  <dialog id="guide-dialog" class="guide-modal" closedby="any" aria-labelledby="guide-dialog-title">
    <div class="modal-head">
      <h2 id="guide-dialog-title">Deploy SpecProof in 60 Seconds</h2>
      <form method="dialog">
        <button type="submit" class="btn-icon-circular" aria-label="Close modal" autofocus>✕</button>
      </form>
    </div>
    <div class="tab-group" role="group" aria-label="Setup guide sections" style="margin-block-end:16px;">
      <button type="button" class="tab-pill guide-tab-btn" data-guide-panel="cli" aria-pressed="true">CLI &amp; MCP</button>
      <button type="button" class="tab-pill guide-tab-btn" data-guide-panel="docker" aria-pressed="false">Self-Host Docker</button>
      <button type="button" class="tab-pill guide-tab-btn" data-guide-panel="cloud" aria-pressed="false">Team Cloud Sync</button>
    </div>
    <div id="guide-panel-cli">
      <p class="proof-item-meta" style="margin-block-end:10px;">Run locally or connect inside Cursor / Claude Code via MCP:</p>
      <pre class="cli-frame">npm install
npm run verify
node packages/cli/dist/index.js init
node packages/cli/dist/index.js check --all --mutate --spec SPEC.md</pre>
    </div>
    <div id="guide-panel-docker" hidden>
      <p class="proof-item-meta" style="margin-block-end:10px;">Launch Enterprise Control Plane on your own VPC with persistent SQLite WAL storage:</p>
      <pre class="cli-frame">SPECPROOF_CLOUD_TOKEN="your-secret" docker compose up -d
curl http://localhost:4310/health</pre>
    </div>
    <div id="guide-panel-cloud" hidden>
      <p class="proof-item-meta" style="margin-block-end:10px;">Pull org policies &amp; Linear/Jira specs and upload PR proof automatically in CI:</p>
      <pre class="cli-frame">SPECPROOF_CLOUD_TOKEN="your-secret" \
  node packages/cli/dist/index.js check --base origin/main --mutate --cloud http://localhost:4310</pre>
    </div>
  </dialog>

  <main class="container">
    <section class="hero" id="quickstart">
      <div class="hero-eyebrow">
        <strong>Open-Core v0.2</strong>
        <span>TS/JS + Python + Go + MCP + GitHub Action</span>
      </div>
      <h1 class="display-hero">Ship AI code with mathematical proof.</h1>
      <p class="hero-subhead">
        Catch vacuous AI tests, excessive mocking, and missing acceptance criteria before merge.
        Diff-scoped micro-mutation runs in seconds — inside Cursor, Claude Code, and CI.
      </p>
      <div class="hero-ctas">
        <button type="button" id="copy-cli-btn" class="btn-primary">Copy: npx @specproof/cli check</button>
        <button type="button" class="btn-secondary open-guide-btn" data-guide-tab="cli">Setup Guide</button>
      </div>
    </section>

    <section class="section" id="showcase">
      <div class="bento-grid">
        <article class="spotlight-card spotlight-violet">
          <div>
            <p class="spotlight-kicker">DIFF-SCOPED MICRO-MUTATION</p>
            <h2 class="spotlight-title">AI tests pass 100% until we mutate the diff.</h2>
            <p class="spotlight-body">
              Instead of mutating your entire repo for 20 minutes, SpecProof targets only changed
              branches and boundaries inside an isolated sandbox — proving tests catch real regressions.
            </p>
          </div>
          <div>
            <a href="#control-plane" class="btn-translucent">View Mutation Evidence</a>
          </div>
        </article>

        <article class="surface-tile">
          <div>
            <h3 class="display-md">Live Team Telemetry</h3>
            <p class="cli-muted" style="margin:0;">Real-time metrics ingested from local MCP &amp; CI gates.</p>
          </div>
          <div class="kpi-mini-grid">
            <div class="kpi-box">
              <p class="kpi-label">Total PR / CI Runs</p>
              <p class="kpi-value" id="kpi-total">0</p>
            </div>
            <div class="kpi-box">
              <p class="kpi-label">Gate Pass Rate</p>
              <p class="kpi-value" id="kpi-pass-rate">100%</p>
            </div>
            <div class="kpi-box">
              <p class="kpi-label">Avg Diff Mutation</p>
              <p class="kpi-value" id="kpi-mutation">--</p>
            </div>
            <div class="kpi-box">
              <p class="kpi-label">Fake Tests Caught</p>
              <p class="kpi-value" id="kpi-findings">0</p>
            </div>
          </div>
        </article>

        <article class="surface-tile">
          <div>
            <h3 class="display-md">Zero-Fluff Gate</h3>
            <p class="cli-muted" style="margin:0;">Deterministic AST integrity + BYOK spec verification.</p>
          </div>
          <pre class="cli-frame"><span class="cli-muted">$</span> specproof check --base main --mutate --spec SPEC.md
<span class="cli-ok">Status     : PASSED</span>
Diff Files : 4 (TS + Python)
Integrity  : Clean (0 vacuous assertions, 0 mock abuse)
Mutation   : 92.3% (12/13 mutants killed in 1.4s)
Spec Match : 3/3 acceptance criteria verified</pre>
        </article>

        <article class="spotlight-card spotlight-orange">
          <div>
            <p class="spotlight-kicker">UNLIMITED SEATS · NO METER SHOCK</p>
            <h2 class="spotlight-title">Flat repo pricing, BYOK friendly, Apache-2.0 core.</h2>
            <p class="spotlight-body">
              Keep your own OpenAI, Anthropic, or Gemini keys. Never pay $30–$72 per seat or hit
              throttling walls when coding agents open 40 PRs a day.
            </p>
          </div>
          <div>
            <a href="#pricing" class="btn-translucent">Compare Plans</a>
          </div>
        </article>
      </div>
    </section>

    <section class="section" id="control-plane">
      <div class="section-header">
        <h2 class="display-lg">Live Control Plane</h2>
        <p class="section-sub">
          Inspect ingested pull request verifications, survived boundary mutants, repo mutation trends,
          and enforce organization-wide quality policies.
        </p>
      </div>

      <div class="control-panel">
        <div class="toolbar">
          <div class="tab-group" role="group" aria-label="Filter runs by status">
            <button type="button" class="tab-pill status-pill" data-status="all" aria-pressed="true">All Runs</button>
            <button type="button" class="tab-pill status-pill" data-status="passed" aria-pressed="false">Passed</button>
            <button type="button" class="tab-pill status-pill" data-status="failed" aria-pressed="false">Failed</button>
          </div>
          <div class="controls">
            <input id="filter-repo" class="text-input" type="search" placeholder="Search runs by repo..." aria-label="Search verification runs by repository" />
            <input id="cloud-token-input" class="text-input" type="password" placeholder="Bearer token (session)" title="Stored in sessionStorage and sent as Authorization: Bearer &lt;token&gt;" aria-label="Optional API Bearer token" style="inline-size:175px;" />
            <button id="seed-demo-btn" type="button" class="btn-secondary">Load Demo Runs</button>
            <a href="/api/export?format=csv" id="export-csv-btn" class="btn-secondary">Export CSV</a>
            <button id="refresh-btn" type="button" class="btn-secondary">Refresh</button>
          </div>
        </div>

        <div tabindex="0" role="region" aria-labelledby="runs-table-caption" class="table-wrapper">
          <table>
            <caption id="runs-table-caption">
              Verification evidence feed (<span id="connection-status" aria-live="polite">Connecting...</span>) — click or press Enter on any row to inspect &amp; sync URL
            </caption>
            <thead>
              <tr>
                <th>Repository</th>
                <th>Branch / PR</th>
                <th>Gate</th>
                <th>Findings</th>
                <th>Mutation</th>
                <th>Spec</th>
                <th>Timestamp</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="runs-tbody"></tbody>
          </table>
        </div>

        <div class="split-2">
          <div class="subcard">
            <h3>Org-Wide Policy Gate <span id="policy-saved-badge" aria-live="polite" style="color:var(--ink-muted);font-weight:400;font-size:13px;">· Synced</span> <span id="workspace-plan-badge" style="color:var(--accent-blue);font-weight:500;font-size:12px;margin-inline-start:6px;"></span></h3>
            <form id="policy-form" class="policy-form">
              <label class="policy-row">
                <span>Min Diff Mutation Score (0–100%)</span>
                <input id="pol-min-score" class="text-input" type="number" min="0" max="100" required value="70" style="inline-size:96px;" />
              </label>
              <label class="policy-row">
                <span>Block on Vacuous / Empty Tests</span>
                <input id="pol-vacuous" type="checkbox" checked />
              </label>
              <label class="policy-row">
                <span>Block on Mock Abuse</span>
                <input id="pol-mock" type="checkbox" checked />
              </label>
              <label class="policy-row">
                <span>Require Spec Acceptance Match</span>
                <input id="pol-spec" type="checkbox" />
              </label>
              <div style="margin-block-start:8px;">
                <button type="submit" class="btn-primary">Save Org Policy</button>
              </div>
            </form>
          </div>

          <div class="subcard">
            <div class="toolbar" style="margin-block-end:12px;">
              <h3 style="margin:0;">Selected Run Evidence</h3>
              <div class="tab-group" role="group" aria-label="Evidence view mode">
                <button type="button" class="tab-pill view-pill" data-view="summary" aria-pressed="true">Summary</button>
                <button type="button" class="tab-pill view-pill" data-view="json" aria-pressed="false">Raw JSON</button>
              </div>
            </div>
            <div id="run-summary" class="proof-summary">
              <div class="proof-item">
                <span class="proof-item-meta">Select a verification run above to inspect integrity findings, survived mutants, and spec coverage.</span>
              </div>
            </div>
            <pre id="run-inspector" class="proof-box" hidden>Select a verification run above to inspect full JSON proof.</pre>
          </div>
        </div>

        <div class="split-2">
          <div class="subcard">
            <div class="toolbar" style="margin-block-end:12px;">
              <h3 id="specs-heading" style="margin:0;">Synced Specs (Linear / Jira / GitHub)</h3>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span id="spec-toast" class="toast-msg" role="status" aria-live="polite"></span>
                <div class="tab-group" role="group" aria-label="Spec sync mode">
                  <button type="button" class="tab-pill spec-mode-pill" data-spec-mode="pull" aria-pressed="false">Pull Live Issue</button>
                  <button type="button" class="tab-pill spec-mode-pill" data-spec-mode="manual" aria-pressed="true">Manual Checklist</button>
                </div>
              </div>
            </div>
            <div id="spec-list" class="spec-list" style="margin-block-end:14px;"></div>

            <form id="spec-pull-form" class="policy-form" aria-labelledby="specs-heading" hidden>
              <div class="spec-form-grid">
                <div class="field">
                  <label class="field-label" for="pull-source">Issue Provider <span aria-hidden="true">*</span></label>
                  <select id="pull-source" name="source" class="text-input">
                    <option value="github">GitHub Issue (public or GITHUB_TOKEN)</option>
                    <option value="linear">Linear (LINEAR_API_KEY)</option>
                    <option value="jira">Jira (JIRA_BASE_URL + Token)</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for="pull-ext-id">Issue / Ticket ID <span aria-hidden="true">*</span></label>
                  <input id="pull-ext-id" name="externalId" class="text-input" type="text" placeholder="e.g. #42 or ENG-18" required autocorrect="off" autocapitalize="none" spellcheck="false" data-error="pull-ext-id-err" aria-invalid="false" />
                  <span id="pull-ext-id-err" class="error-msg">Enter a valid issue number or ticket ID.</span>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="pull-repo">Target GitHub Repo (owner/repo) <span aria-hidden="true">*</span></label>
                <input id="pull-repo" name="repoSlug" class="text-input" type="text" placeholder="e.g. acme/payments" required pattern="[A-Za-z0-9._-]+/[A-Za-z0-9._-]+" autocorrect="off" autocapitalize="none" spellcheck="false" data-error="pull-repo-err" aria-invalid="false" />
                <span id="pull-repo-err" class="error-msg">Use owner/repo format (e.g. acme/payments).</span>
              </div>
              <div>
                <button id="pull-submit-btn" type="submit" class="btn-primary">Pull Live Issue &amp; Sync</button>
              </div>
            </form>

            <form id="spec-form" class="policy-form" aria-labelledby="specs-heading">
              <div class="spec-form-grid">
                <div class="field">
                  <label class="field-label" for="spec-ext-id">Ticket ID <span aria-hidden="true">*</span></label>
                  <input id="spec-ext-id" name="externalId" class="text-input" type="text" placeholder="e.g. LIN-412" required autocorrect="off" autocapitalize="none" spellcheck="false" data-error="spec-ext-id-err" aria-invalid="false" />
                  <span id="spec-ext-id-err" class="error-msg">Ticket ID is required.</span>
                </div>
                <div class="field">
                  <label class="field-label" for="spec-source">Source</label>
                  <select id="spec-source" name="source" class="text-input">
                    <option value="linear">Linear</option>
                    <option value="jira">Jira</option>
                    <option value="github">GitHub Issue</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <div class="spec-form-grid">
                <div class="field">
                  <label class="field-label" for="spec-repo">Target owner/repo <span aria-hidden="true">*</span></label>
                  <input id="spec-repo" name="repoSlug" class="text-input" type="text" placeholder="e.g. acme/payments" required autocorrect="off" autocapitalize="none" spellcheck="false" data-error="spec-repo-err" aria-invalid="false" />
                  <span id="spec-repo-err" class="error-msg">Repository slug is required.</span>
                </div>
                <div class="field">
                  <label class="field-label" for="spec-title">Acceptance Title <span aria-hidden="true">*</span></label>
                  <input id="spec-title" name="title" class="text-input" type="text" placeholder="e.g. Harden JWT callback" required data-error="spec-title-err" aria-invalid="false" />
                  <span id="spec-title-err" class="error-msg">Title is required.</span>
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="spec-checklist">Acceptance Checklist Markdown <span aria-hidden="true">*</span></label>
                <textarea id="spec-checklist" name="checklistMarkdown" class="text-input" rows="3" placeholder="- [ ] Enforce boundary check" required data-error="spec-checklist-err" aria-invalid="false"></textarea>
                <span id="spec-checklist-err" class="error-msg">Enter at least one acceptance criterion.</span>
              </div>
              <div>
                <button id="spec-submit-btn" type="submit" class="btn-secondary">Sync Spec Checklist</button>
              </div>
            </form>
          </div>

          <div class="subcard">
            <h3>Repo Mutation Trends</h3>
            <div id="trends-list" class="trend-list">
              <span class="proof-item-meta">Ingest runs with --mutate to see per-repository mutation score trends.</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="comparison">
      <div class="section-header">
        <h2 class="display-lg">Why execution-backed proof beats AI guessing.</h2>
        <p class="section-sub">Deterministic verification + diff-scoped mutation vs. per-seat LLM comment bots.</p>
      </div>
      <div class="compare-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>SpecProof</th>
              <th>AI PR Reviewers (CodeRabbit / Greptile)</th>
              <th>Full-Repo Mutation (Stryker)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Diff-Scoped Micro-Mutation Speed</th>
              <td class="check-yes">✓ Seconds (changed lines only)</td>
              <td>✗ Guessing without execution</td>
              <td>Slow (minutes–hours on whole repo)</td>
            </tr>
            <tr>
              <th>Mock Abuse &amp; Vacuous Test Detection</th>
              <td class="check-yes">✓ Zero-LLM AST gate</td>
              <td>Limited heuristic comments</td>
              <td>✗ Does not inspect test assertions</td>
            </tr>
            <tr>
              <th>IDE MCP Integration (Cursor / Claude Code)</th>
              <td class="check-yes">✓ Native MCP stdio tools</td>
              <td>Partial / Editor-locked</td>
              <td>✗ CI/CLI only</td>
            </tr>
            <tr>
              <th>Pricing Predictability</th>
              <td class="check-yes">✓ Flat repo / Unlimited seats + BYOK</td>
              <td>$24–$72/dev/mo + credit overages</td>
              <td>Free OSS (self-managed)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section" id="pricing">
      <div class="section-header">
        <h2 class="display-lg">Simple, flat pricing.</h2>
        <p class="section-sub">Open-source core forever. Unlimited developers on every paid tier.</p>
      </div>

      <div class="pricing-grid">
        <article class="pricing-card">
          <div>
            <h3 class="tier-name">OSS Core</h3>
            <p class="tier-price">$0 <span>/ forever</span></p>
            <ul class="tier-list">
              <li>Local CLI &amp; MCP Server</li>
              <li>TS/JS, Python &amp; Go AST rules</li>
              <li>Diff-scoped micro-mutation</li>
              <li>GitHub Action PR comments</li>
            </ul>
          </div>
          <button type="button" class="btn-secondary open-guide-btn" data-guide-tab="cli">Install CLI</button>
        </article>

        <article class="pricing-card-featured">
          <div>
            <h3 class="tier-name">Team Cloud</h3>
            <p class="tier-price">$29 <span>/ mo · 5 repos</span></p>
            <ul class="tier-list">
              <li>Unlimited developer seats</li>
              <li>Central PR evidence history</li>
              <li>Mutation trend tracking</li>
              <li>Sticky GitHub PR checks</li>
            </ul>
          </div>
          <button id="pricing-team-cta" type="button" class="btn-primary open-guide-btn" data-guide-tab="cloud">Start Team Cloud</button>
        </article>

        <article class="pricing-card">
          <div>
            <h3 class="tier-name">Scale</h3>
            <p class="tier-price">$79 <span>/ mo · unlimited</span></p>
            <ul class="tier-list">
              <li>Unlimited repositories</li>
              <li>Linear &amp; Jira spec sync</li>
              <li>Org-wide policy enforcement</li>
              <li>BYOK LLM semantic gate</li>
            </ul>
          </div>
          <a id="pricing-scale-cta" href="#control-plane" class="btn-secondary">Configure Policy</a>
        </article>

        <article class="pricing-card">
          <div>
            <h3 class="tier-name">Enterprise</h3>
            <p class="tier-price">$299+ <span>/ mo · VPC</span></p>
            <ul class="tier-list">
              <li>Self-hosted Docker / Air-gap</li>
              <li>SOC2 / ISO CSV &amp; audit export</li>
              <li>Token-gated RBAC controls</li>
              <li>Custom language adapters</li>
            </ul>
          </div>
          <button type="button" class="btn-secondary open-guide-btn" data-guide-tab="docker">Self-Host Docs</button>
        </article>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="section-header">
        <h2 class="display-lg" id="faq-heading">Frequently asked questions.</h2>
      </div>
      <section class="accordion" aria-labelledby="faq-heading">
        <details>
          <summary>How is SpecProof faster than traditional mutation testing?</summary>
          <div class="faq-body">
            Traditional mutation runners mutate your entire repository. SpecProof parses your git diff and injects targeted micro-mutants strictly on changed lines inside an isolated temporary sandbox, finishing in seconds.
          </div>
        </details>
        <details>
          <summary>Does SpecProof require an LLM API key to work?</summary>
          <div class="faq-body">
            No. AST test-integrity checks (mock abuse, vacuous assertions, empty tests, swallowed errors) and diff-scoped mutation run 100% deterministically with zero LLM calls. BYOK LLM (OpenAI, Anthropic, Gemini) is strictly optional for semantic SPEC.md checks.
          </div>
        </details>
        <details>
          <summary>How do I use SpecProof inside Cursor or Claude Code?</summary>
          <div class="faq-body">
            Run <code>specproof init</code> to generate your MCP server snippet, then register <code>specproof mcp</code>. Your coding agent can call <code>check_test_integrity</code>, <code>run_diff_mutation</code>, and <code>verify_spec_coverage</code> before finishing a task.
          </div>
        </details>
      </section>
    </section>
  </main>

  <footer>
    <div class="footer-grid">
      <div class="footer-col">
        <div class="wordmark" style="margin-block-end:12px;">
          <span class="wordmark-mark">SP</span>
          <span>SpecProof</span>
        </div>
        <p style="margin:0;max-inline-size:280px;">
          Open-core diff-scoped test integrity, micro-mutation, and spec-to-PR verification gate.
        </p>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <ul>
          <li><a href="#showcase">Telemetry</a></li>
          <li><a href="#control-plane">Control Plane</a></li>
          <li><a href="#comparison">Compare Tools</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Resources</h4>
        <ul>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#faq">FAQ</a></li>
          <li><a href="/api/export?format=json">Audit JSON Export</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Deployment</h4>
        <ul>
          <li><a href="/health">Health Endpoint</a></li>
          <li><a href="#control-plane">Policy Gate</a></li>
          <li><a href="#quickstart">CLI Quickstart</a></li>
        </ul>
      </div>
    </div>
  </footer>

  <script>
    const requestedRunId = new URLSearchParams(window.location.search).get('run');
    const state = {
      runs: [],
      specs: [],
      trends: [],
      selectedRun: null,
      statusFilter: 'all',
      selectedId: requestedRunId,
      evidenceView: 'summary',
    };

    const tokenInput = document.getElementById('cloud-token-input');
    tokenInput.value = sessionStorage.getItem('specproof_cloud_token') || '';
    tokenInput.addEventListener('change', () => {
      const val = tokenInput.value.trim();
      if (val) sessionStorage.setItem('specproof_cloud_token', val);
      else sessionStorage.removeItem('specproof_cloud_token');
      loadDashboard().catch(handleError);
    });

    function buildHeaders(withJson) {
      const headers = {};
      if (withJson) headers['Content-Type'] = 'application/json';
      const tok = tokenInput.value.trim();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      return headers;
    }

    async function apiFetchJson(url, opts = {}) {
      const res = await fetch(url, opts);
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const errJson = await res.json();
          if (errJson.error) msg = errJson.error + ' (' + res.status + ')';
        } catch {}
        throw new Error(msg);
      }
      return res.json();
    }

    function handleError(err) {
      document.getElementById('connection-status').textContent =
        'Error: ' + (err instanceof Error ? err.message : String(err));
    }

    // Guide Modal + Safari closedby fallback
    const guideDialog = document.getElementById('guide-dialog');
    function selectGuideTab(tabName) {
      for (const btn of document.querySelectorAll('.guide-tab-btn')) {
        const active = btn.getAttribute('data-guide-panel') === tabName;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      document.getElementById('guide-panel-cli').hidden = tabName !== 'cli';
      document.getElementById('guide-panel-docker').hidden = tabName !== 'docker';
      document.getElementById('guide-panel-cloud').hidden = tabName !== 'cloud';
    }
    for (const btn of document.querySelectorAll('.open-guide-btn')) {
      btn.addEventListener('click', () => {
        selectGuideTab(btn.getAttribute('data-guide-tab') || 'cli');
        guideDialog.showModal();
      });
    }
    for (const btn of document.querySelectorAll('.guide-tab-btn')) {
      btn.addEventListener('click', () => {
        selectGuideTab(btn.getAttribute('data-guide-panel') || 'cli');
      });
    }
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      guideDialog.addEventListener('click', (event) => {
        if (event.target !== guideDialog) return;
        const rect = guideDialog.getBoundingClientRect();
        const inside = rect.top <= event.clientY && event.clientY <= rect.bottom &&
          rect.left <= event.clientX && event.clientX <= rect.right;
        if (!inside) guideDialog.close();
      });
    }

    // Mobile Navigation Drawer
    const mobileDrawer = document.getElementById('mobile-drawer');
    const mobileOpenBtn = document.getElementById('mobile-nav-open');
    const mobileCloseBtn = document.getElementById('mobile-nav-close');
    mobileOpenBtn.addEventListener('click', () => {
      mobileDrawer.showModal();
      mobileOpenBtn.setAttribute('aria-expanded', 'true');
    });
    mobileCloseBtn.addEventListener('click', () => mobileDrawer.close());
    mobileDrawer.addEventListener('click', (ev) => {
      if (ev.target === mobileDrawer) mobileDrawer.close();
    });
    mobileDrawer.addEventListener('close', () => {
      mobileOpenBtn.setAttribute('aria-expanded', 'false');
    });
    for (const link of document.querySelectorAll('.drawer-link')) {
      link.addEventListener('click', () => mobileDrawer.close());
    }

    document.getElementById('copy-cli-btn').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      try {
        await navigator.clipboard.writeText('npx @specproof/cli check --mutate');
        btn.textContent = 'Copied to clipboard';
        setTimeout(() => { btn.textContent = 'Copy: npx @specproof/cli check'; }, 1800);
      } catch {
        btn.textContent = 'npx @specproof/cli check --mutate';
      }
    });

    for (const pill of document.querySelectorAll('.status-pill[data-status]')) {
      pill.addEventListener('click', () => {
        state.statusFilter = pill.getAttribute('data-status') || 'all';
        for (const p of document.querySelectorAll('.status-pill[data-status]')) {
          p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
        }
        renderRuns();
      });
    }

    for (const pill of document.querySelectorAll('.view-pill[data-view]')) {
      pill.addEventListener('click', () => {
        state.evidenceView = pill.getAttribute('data-view') || 'summary';
        for (const p of document.querySelectorAll('.view-pill[data-view]')) {
          p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
        }
        document.getElementById('run-summary').hidden = state.evidenceView !== 'summary';
        document.getElementById('run-inspector').hidden = state.evidenceView !== 'json';
      });
    }

    async function selectRun(id, syncUrl) {
      state.selectedId = id;
      if (syncUrl) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('run', id);
        history.replaceState(null, '', nextUrl.toString());
      }
      renderRuns();
      try {
        state.selectedRun = await apiFetchJson('/api/runs/' + encodeURIComponent(id), {
          headers: buildHeaders(false),
        });
      } catch {
        state.selectedRun = null;
      }
      renderSelectedEvidence();
    }

    async function loadDashboard() {
      const headers = buildHeaders(false);
      const [runsPayload, policy, specsPayload, billingPayload] = await Promise.all([
        apiFetchJson('/api/runs', { headers }),
        apiFetchJson('/api/policies', { headers }),
        apiFetchJson('/api/specs', { headers }),
        apiFetchJson('/api/billing', { headers }).catch(() => null),
      ]);

      state.runs = runsPayload.runs || [];
      state.trends = runsPayload.trends || [];
      state.specs = specsPayload.specs || [];
      const stats = runsPayload.stats || {};
      const planBadge = document.getElementById('workspace-plan-badge');
      if (planBadge && billingPayload?.billing) {
        const b = billingPayload.billing;
        const limitLabel = b.maxRepos === null ? 'unlimited' : billingPayload.distinctRepos + '/' + b.maxRepos + ' repos';
        planBadge.textContent = '· Plan: ' + String(b.plan).toUpperCase() + ' (' + limitLabel + ')';
      }

      document.getElementById('kpi-total').textContent = String(stats.totalRuns ?? 0);
      document.getElementById('kpi-pass-rate').textContent = (stats.passRate ?? 100).toFixed(1) + '%';
      document.getElementById('kpi-mutation').textContent =
        stats.avgMutationScore === null || stats.avgMutationScore === undefined
          ? '--'
          : stats.avgMutationScore.toFixed(1) + '%';
      document.getElementById('kpi-findings').textContent = String(stats.totalIntegrityFindings ?? 0);

      document.getElementById('pol-min-score').value = String(policy.minMutationScore ?? 70);
      document.getElementById('pol-vacuous').checked = Boolean(policy.blockOnVacuous);
      document.getElementById('pol-mock').checked = Boolean(policy.blockOnMockAbuse);
      document.getElementById('pol-spec').checked = Boolean(policy.requireSpecMatch);
      document.getElementById('connection-status').textContent = 'Live SQLite Store';

      if (!state.selectedId && state.runs.length > 0) {
        state.selectedId = state.runs[0].id;
      }

      renderRuns();
      renderTrends();
      renderSpecs();

      if (state.selectedId) {
        await selectRun(state.selectedId, false);
        if (requestedRunId) {
          document.getElementById('control-plane').scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        renderSelectedEvidence();
      }
    }

    function renderTrends() {
      const el = document.getElementById('trends-list');
      el.replaceChildren();
      if (state.trends.length === 0) {
        const span = document.createElement('span');
        span.className = 'proof-item-meta';
        span.textContent = 'Ingest runs with --mutate to see per-repository mutation score trends.';
        el.appendChild(span);
        return;
      }
      for (const item of state.trends) {
        const row = document.createElement('div');
        row.className = 'trend-row';
        const meta = document.createElement('div');
        meta.className = 'trend-meta';
        const left = document.createElement('strong');
        left.textContent = item.repoSlug + ' (' + item.runs + ' runs)';
        const right = document.createElement('span');
        right.textContent =
          (item.avgMutationScore === null ? '--' : item.avgMutationScore.toFixed(1) + '% mut') +
          ' · ' + item.passRate.toFixed(0) + '% pass';
        meta.appendChild(left);
        meta.appendChild(right);
        const track = document.createElement('div');
        track.className = 'trend-track';
        const fill = document.createElement('div');
        fill.className = 'trend-fill';
        const pct = item.avgMutationScore === null ? item.passRate : item.avgMutationScore;
        fill.style.inlineSize = Math.max(4, Math.min(100, pct)) + '%';
        track.appendChild(fill);
        row.appendChild(meta);
        row.appendChild(track);
        el.appendChild(row);
      }
    }

    function renderSelectedEvidence() {
      const run = state.selectedRun;
      const summaryEl = document.getElementById('run-summary');
      const jsonEl = document.getElementById('run-inspector');
      summaryEl.replaceChildren();

      if (!run) {
        const empty = document.createElement('div');
        empty.className = 'proof-item';
        const span = document.createElement('span');
        span.className = 'proof-item-meta';
        span.textContent = 'Select a verification run above to inspect integrity findings, survived mutants, and spec coverage.';
        empty.appendChild(span);
        summaryEl.appendChild(empty);
        jsonEl.textContent = 'No run selected.';
        return;
      }

      const report = run.reportJson || {};
      jsonEl.textContent = JSON.stringify(report, null, 2);

      const addItem = (title, meta, statusClass) => {
        const div = document.createElement('div');
        div.className = 'proof-item';
        const head = document.createElement('div');
        head.className = 'proof-item-head';
        const left = document.createElement('span');
        left.textContent = title;
        if (statusClass) left.className = statusClass;
        head.appendChild(left);
        div.appendChild(head);
        if (meta) {
          const m = document.createElement('div');
          m.className = 'proof-item-meta';
          m.textContent = meta;
          div.appendChild(m);
        }
        summaryEl.appendChild(div);
      };

      const findings = report.integrity?.findings || [];
      for (const f of findings) {
        addItem(
          '[' + String(f.severity).toUpperCase() + '] ' + f.ruleId + ' — ' + f.file + ':' + f.line,
          f.message,
          'gate-fail',
        );
      }

      const survived = (report.mutation?.results || []).filter((m) => m.status === 'survived');
      for (const m of survived) {
        addItem(
          'Survived Mutant (' + m.operator + ') — ' + m.file + ':' + m.line,
          m.original + '  =>  ' + m.mutated + ' (tests still passed)',
          'gate-fail',
        );
      }

      const reqs = report.specCoverage?.requirements || [];
      for (const req of reqs) {
        addItem(
          (req.covered ? '✓ ' : '× ') + req.id + ': ' + req.text,
          req.llmReason || (req.matchedFiles?.length ? 'Matched: ' + req.matchedFiles.join(', ') : 'No matching code/test diff'),
          req.covered ? 'gate-pass' : 'gate-fail',
        );
      }

      if (findings.length === 0 && survived.length === 0 && reqs.length === 0) {
        addItem('All checks passed cleanly', '0 integrity findings and 0 survived mutants.', 'gate-pass');
      }
    }

    function renderSpecs() {
      const list = document.getElementById('spec-list');
      list.replaceChildren();
      if (state.specs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'proof-item';
        const span = document.createElement('span');
        span.className = 'proof-item-meta';
        span.textContent = 'No external specs synced yet.';
        empty.appendChild(span);
        list.appendChild(empty);
        return;
      }

      for (const spec of state.specs) {
        const card = document.createElement('div');
        card.className = 'proof-item';
        const head = document.createElement('div');
        head.className = 'proof-item-head';
        const title = document.createElement('span');
        title.textContent = spec.externalId + ' · ' + spec.title;
        const rightWrap = document.createElement('div');
        rightWrap.style.display = 'flex';
        rightWrap.style.alignItems = 'center';
        rightWrap.style.gap = '8px';
        const badge = document.createElement('span');
        badge.className = 'proof-item-meta';
        badge.textContent = spec.source + ' / ' + spec.repoSlug;
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-icon-circular';
        delBtn.setAttribute('aria-label', 'Delete spec ' + spec.externalId);
        delBtn.textContent = '×';
        delBtn.addEventListener('click', async () => {
          try {
            await apiFetchJson('/api/specs/' + encodeURIComponent(spec.id), {
              method: 'DELETE',
              headers: buildHeaders(false),
            });
            document.getElementById('spec-toast').textContent = 'Removed ' + spec.externalId;
            await loadDashboard();
          } catch (err) {
            handleError(err);
          }
        });
        rightWrap.appendChild(badge);
        rightWrap.appendChild(delBtn);
        head.appendChild(title);
        head.appendChild(rightWrap);
        card.appendChild(head);

        const body = document.createElement('div');
        body.className = 'proof-item-meta';
        body.textContent = spec.checklistMarkdown;
        card.appendChild(body);
        list.appendChild(card);
      }
    }

    function renderRuns() {
      const repoFilter = document.getElementById('filter-repo').value.trim().toLowerCase();
      const tbody = document.getElementById('runs-tbody');
      tbody.replaceChildren();

      const filtered = state.runs.filter((run) => {
        if (repoFilter && !run.repoSlug.toLowerCase().includes(repoFilter)) return false;
        if (state.statusFilter === 'passed' && !run.passed) return false;
        if (state.statusFilter === 'failed' && run.passed) return false;
        return true;
      });

      if (filtered.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.textContent = 'No verification runs match this filter. Click "Load Demo Runs" or run specproof check --cloud.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      for (const run of filtered) {
        const tr = document.createElement('tr');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-label', 'Inspect verification run for ' + run.repoSlug);
        if (state.selectedId === run.id) {
          tr.setAttribute('data-selected', 'true');
        }

        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = run.repoSlug;
        tr.appendChild(th);

        const branchTd = document.createElement('td');
        branchTd.textContent = run.prNumber ? run.branch + ' (#' + run.prNumber + ')' : run.branch;
        tr.appendChild(branchTd);

        const gateTd = document.createElement('td');
        gateTd.className = run.passed ? 'gate-pass' : 'gate-fail';
        gateTd.textContent = run.passed ? 'PASSED' : 'FAILED';
        tr.appendChild(gateTd);

        const findingsTd = document.createElement('td');
        findingsTd.textContent = String(run.integrityFindingsCount);
        tr.appendChild(findingsTd);

        const mutTd = document.createElement('td');
        mutTd.textContent = run.mutationScore === null ? '--' : run.mutationScore.toFixed(1) + '%';
        tr.appendChild(mutTd);

        const specTd = document.createElement('td');
        specTd.textContent =
          run.specCoverageRatio === null
            ? '--'
            : Math.round(run.specCoverageRatio * 100) + '% (' + run.evaluatedBy + ')';
        tr.appendChild(specTd);

        const timeTd = document.createElement('td');
        timeTd.textContent = new Date(run.createdAt).toLocaleString();
        tr.appendChild(timeTd);

        const actionTd = document.createElement('td');
        const delRunBtn = document.createElement('button');
        delRunBtn.type = 'button';
        delRunBtn.className = 'btn-icon-circular';
        delRunBtn.setAttribute('aria-label', 'Delete run ' + run.repoSlug);
        delRunBtn.textContent = '×';
        delRunBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await apiFetchJson('/api/runs/' + encodeURIComponent(run.id), {
              method: 'DELETE',
              headers: buildHeaders(false),
            });
            if (state.selectedId === run.id) {
              state.selectedId = null;
              state.selectedRun = null;
            }
            await loadDashboard();
          } catch (err) {
            handleError(err);
          }
        });
        actionTd.appendChild(delRunBtn);
        tr.appendChild(actionTd);

        tr.addEventListener('click', () => {
          selectRun(run.id, true).catch(handleError);
        });
        tr.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            selectRun(run.id, true).catch(handleError);
          }
        });

        tbody.appendChild(tr);
      }
    }

    document.getElementById('filter-repo').addEventListener('input', renderRuns);
    document.getElementById('refresh-btn').addEventListener('click', () => loadDashboard().catch(handleError));
    document.getElementById('seed-demo-btn').addEventListener('click', async () => {
      try {
        await apiFetchJson('/api/demo', { method: 'POST', headers: buildHeaders(false) });
        await loadDashboard();
      } catch (err) {
        handleError(err);
      }
    });

    for (const pill of document.querySelectorAll('.spec-mode-pill[data-spec-mode]')) {
      pill.addEventListener('click', () => {
        const mode = pill.getAttribute('data-spec-mode') || 'manual';
        for (const p of document.querySelectorAll('.spec-mode-pill[data-spec-mode]')) {
          p.setAttribute('aria-pressed', p === pill ? 'true' : 'false');
        }
        document.getElementById('spec-pull-form').hidden = mode !== 'pull';
        document.getElementById('spec-form').hidden = mode !== 'manual';
      });
    }

    // Accessible :user-invalid <-> aria-invalid + single polite live-region announcer
    (function setupAccessibleFormErrors() {
      const announcer = document.createElement('div');
      announcer.setAttribute('aria-live', 'polite');
      announcer.classList.add('visually-hidden');
      document.body.append(announcer);

      const flagged = new WeakSet();
      const announced = new WeakSet();
      let announceTimer;

      function linkError(el, shown) {
        const errorId = el.dataset ? el.dataset.error : undefined;
        if (!errorId) return;
        const ids = (el.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .filter((id) => id && id !== errorId);
        if (shown) ids.push(errorId);
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
        else el.removeAttribute('aria-describedby');
      }

      function syncAria(el, shouldAnnounce) {
        if (!el || !el.matches || !el.matches('input, select, textarea')) return;
        let isUserInvalid = false;
        try {
          isUserInvalid = el.matches(':user-invalid');
        } catch {
          isUserInvalid = false;
        }
        if (isUserInvalid) {
          if (shouldAnnounce && !announced.has(el) && el.dataset && el.dataset.error) {
            const errNode = document.getElementById(el.dataset.error);
            if (errNode) {
              clearTimeout(announceTimer);
              announcer.textContent = '';
              announceTimer = setTimeout(() => {
                announcer.textContent = errNode.textContent ? errNode.textContent.trim() : '';
              }, 350);
              announced.add(el);
            }
          }
          el.setAttribute('aria-invalid', 'true');
          linkError(el, true);
          flagged.add(el);
        } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
          el.setAttribute('aria-invalid', 'false');
          linkError(el, false);
          flagged.delete(el);
          announced.delete(el);
        }
      }

      for (const el of document.querySelectorAll('input, select, textarea')) {
        syncAria(el, false);
      }
      document.addEventListener('blur', (ev) => syncAria(ev.target, true), true);
      document.addEventListener('input', (ev) => {
        if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute('aria-invalid')) {
          syncAria(ev.target, false);
        }
      });
      document.addEventListener('change', (ev) => syncAria(ev.target, true), true);
      document.addEventListener(
        'invalid',
        (ev) => {
          announced.add(ev.target);
          syncAria(ev.target, false);
        },
        true,
      );
      document.addEventListener(
        'reset',
        (ev) => {
          const formEl = ev.target;
          if (!formEl || !formEl.elements) return;
          setTimeout(() => {
            for (const el of formEl.elements) syncAria(el, false);
          }, 0);
        },
        true,
      );
    })();

    document.getElementById('spec-pull-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const toast = document.getElementById('spec-toast');
      const submitBtn = document.getElementById('pull-submit-btn');
      const extId = document.getElementById('pull-ext-id').value.trim();
      submitBtn.disabled = true;
      toast.textContent = 'Pulling ' + extId + '...';
      try {
        const saved = await apiFetchJson('/api/specs/pull', {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({
            source: document.getElementById('pull-source').value,
            externalId: extId,
            repoSlug: document.getElementById('pull-repo').value.trim(),
          }),
        });
        document.getElementById('spec-pull-form').reset();
        toast.textContent = 'Pulled & synced ' + saved.externalId;
        await loadDashboard();
      } catch (err) {
        toast.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('spec-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const toast = document.getElementById('spec-toast');
      const submitBtn = document.getElementById('spec-submit-btn');
      const extId = document.getElementById('spec-ext-id').value.trim();
      submitBtn.disabled = true;
      try {
        await apiFetchJson('/api/specs', {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({
            externalId: extId,
            source: document.getElementById('spec-source').value,
            repoSlug: document.getElementById('spec-repo').value.trim(),
            title: document.getElementById('spec-title').value.trim(),
            checklistMarkdown: document.getElementById('spec-checklist').value.trim(),
          }),
        });
        document.getElementById('spec-form').reset();
        toast.textContent = 'Synced ' + extId;
        await loadDashboard();
      } catch (err) {
        toast.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
      } finally {
        submitBtn.disabled = false;
      }
    });

    for (const el of document.querySelectorAll('#policy-form input')) {
      el.addEventListener('input', () => {
        const badge = document.getElementById('policy-saved-badge');
        badge.textContent = '· Unsaved changes';
        badge.style.color = 'var(--ink-muted)';
      });
    }

    document.getElementById('policy-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const badge = document.getElementById('policy-saved-badge');
      const score = Number(document.getElementById('pol-min-score').value);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        badge.textContent = '· Score must be 0–100';
        badge.style.color = 'var(--gradient-coral)';
        return;
      }
      const body = {
        minMutationScore: score,
        blockOnVacuous: document.getElementById('pol-vacuous').checked,
        blockOnMockAbuse: document.getElementById('pol-mock').checked,
        requireSpecMatch: document.getElementById('pol-spec').checked,
      };
      try {
        await apiFetchJson('/api/policies', {
          method: 'PUT',
          headers: buildHeaders(true),
          body: JSON.stringify(body),
        });
        badge.textContent = '· Saved';
        badge.style.color = 'var(--semantic-success)';
      } catch (err) {
        badge.textContent = '· Error: ' + (err instanceof Error ? err.message : String(err));
        badge.style.color = 'var(--gradient-coral)';
      }
    });

    async function loadPublicPlans() {
      try {
        const res = await apiFetchJson('/api/public/plans');
        const urls = res?.checkoutUrls || {};
        const teamBtn = document.getElementById('pricing-team-cta');
        if (teamBtn && urls.team) {
          const link = document.createElement('a');
          link.id = 'pricing-team-cta';
          link.className = 'btn-primary';
          link.href = urls.team;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Subscribe ($29/mo)';
          teamBtn.replaceWith(link);
        }
        const scaleBtn = document.getElementById('pricing-scale-cta');
        if (scaleBtn && urls.scale) {
          scaleBtn.href = urls.scale;
          scaleBtn.target = '_blank';
          scaleBtn.rel = 'noopener noreferrer';
          scaleBtn.textContent = 'Subscribe Scale ($79/mo)';
        }
      } catch {}
    }

    loadPublicPlans();
    loadDashboard().catch(handleError);
  </script>
</body>
</html>`;
}
