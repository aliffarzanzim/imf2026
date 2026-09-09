import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRoot(dir) {
  if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  const parent = path.dirname(dir);
  return parent === dir ? dir : findRoot(parent);
}
export const ROOT = findRoot(__dirname);

// Load SECRET from .dev.vars if present
export let SECRET = 'IMF2026_SECRET_KEY';
const devVarsPath = path.join(ROOT, '.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const content = fs.readFileSync(devVarsPath, 'utf8');
  const match = content.match(/EMAIL_SECRET=([^\r\n]+)/);
  if (match && match[1]) {
    SECRET = match[1].trim();
  }
}

export function generateVerifySig(regNumber, secret = SECRET, length = 16) {
  return crypto.createHmac('sha256', secret)
    .update(String(regNumber).trim().toUpperCase())
    .digest('hex')
    .slice(0, length);
}

// Helper to convert file to base64 data URI
export function toBase64(filePath, mimeType) {
  if (!fs.existsSync(filePath)) return '';
  const buf = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

function getLogo(filename, mimeType) {
  const localPath = path.join(__dirname, 'logos', filename);
  if (fs.existsSync(localPath)) return toBase64(localPath, mimeType);
  const draftPath = path.join(ROOT, 'draft', 'logos', filename);
  return toBase64(draftPath, mimeType);
}

export const bsmBase64 = getLogo('bsm.jpg', 'image/jpeg');
export const dmcBase64 = getLogo('dmc_navy.png', 'image/png');
export const imigBase64 = getLogo('imig_circle_transparent.png', 'image/png');
export const aristoBase64 = getLogo('aristopharma.png', 'image/png');

// Generate sharp, seamless SVG QR Code
export async function generateQrCode(verifyUrl) {
  const qrSvgRaw = await QRCode.toString(verifyUrl, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#081729',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvgRaw)}`;
}

// Render the exact inner chest-card component HTML
export function renderCard(delegate, qrDataUri) {
  return `
    <div class="chest-card">

      <!-- TOP SECTION: Executive Deep Navy Block with Flush Hanging Tab -->
      <div class="badge-header-block">
        <!-- Dual Corner Lanyard Slot Punch Indicators flanking the hanging tab -->
        <div class="dual-lanyard-wrap">
          <div class="lanyard-hole" title="Left Lanyard Hook"></div>
          <div class="lanyard-hole" title="Right Lanyard Hook"></div>
        </div>

        <!-- Co-organizer Logos in Top-Flush Incomplete Tab: 3 Balanced Rounded Seals -->
        <div class="partner-capsule">
          ${bsmBase64 ? `
          <div class="partner-col-wrap col-bsm">
            <img src="${bsmBase64}" alt="BSM" title="Bangladesh Society of Medicine">
            <span class="partner-col-text">Bangladesh Society<br>of Medicine</span>
          </div>` : ''}
          ${dmcBase64 ? `
          <div class="partner-col-wrap col-dmc">
            <img src="${dmcBase64}" alt="Dhaka Medical College" title="Dhaka Medical College">
            <span class="partner-col-text">Dhaka Medical<br>College</span>
          </div>` : ''}
          ${imigBase64 ? `
          <div class="partner-col-wrap col-acp">
            <img src="${imigBase64}" alt="ACP" title="American College of Physicians">
            <span class="partner-col-text">American College<br>of Physicians</span>
          </div>` : ''}
        </div>

        <!-- Conference Title Typography -->
        <span class="conf-institution">Dhaka Medical College</span>
        <h2 class="conf-main-title">Internal Medicine <span>Festival 2026</span></h2>

        <!-- Golden/Amber Conference Plaque Ribbon -->
        <div class="conf-date-plaque">
          <span>17 September 2026</span>
          <span>&bull;</span>
          <span>Dhaka, Bangladesh</span>
        </div>
      </div>

      <!-- MIDDLE SECTION: Vertically Centered Attendee & QR Block -->
      <div class="badge-middle-wrap">
        <div class="badge-body-block">
          <!-- Role Badge -->
          <div class="role-pill-wrap">
            <div class="role-pill">${delegate.role || 'PARTICIPANT'}</div>
          </div>

          <!-- Attendee Information -->
          <h3 class="attendee-name">${delegate.fullName}</h3>
          <p class="attendee-inst">${delegate.institution}</p>
          <div class="attendee-year-pill">
            <span>${delegate.academicYear}</span>
          </div>
        </div>

        <!-- VERIFICATION SECTION: QR Code on Top & ID Below -->
        <div class="badge-verify-block">
          <div class="qr-frame">
            <img src="${qrDataUri}" alt="Participant QR Verification">
          </div>
          <div class="verify-details">
            <span class="verify-label">Participant ID</span>
            <span class="verify-id">${delegate.regNumber}</span>
          </div>
        </div>
      </div>

      <!-- BOTTOM SECTION: Sponsor & Color Accent -->
      <div class="badge-footer-wrap">
        <div class="badge-footer-block">
          <span class="sponsor-label">Scientific Partner</span>
          ${aristoBase64 ? `<img src="${aristoBase64}" alt="Aristopharma" class="sponsor-img">` : ''}
        </div>
        <div class="badge-bottom-band"></div>
      </div>

    </div>
  `;
}

// Full page HTML template generator (supports single or multi-page documents)
export function renderFullHtml({ title, heading, cardsHtml, isMultiPage = false }) {
  const printStyles = isMultiPage ? `
    /* Print Optimization (Press-Ready Multi-Card Document) */
    @page {
      size: 376px 540px;
      margin: 0;
    }

    @media print {
      html, body {
        width: 376px !important;
        height: auto !important;
        min-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        overflow: visible !important;
      }

      .controls-bar,
      .dual-lanyard-wrap {
        display: none !important;
      }

      .cards-container {
        perspective: none !important;
        width: 376px !important;
        height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        gap: 0 !important;
        display: block !important;
      }

      .chest-card {
        width: 376px !important;
        height: 540px !important;
        max-height: 540px !important;
        box-shadow: none !important;
        border: 1px solid #cbd5e1 !important;
        margin: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .chest-card:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  ` : `
    /* Print Optimization (Press-Ready Single-Card Page) */
    @page {
      size: 376px 540px;
      margin: 0;
    }

    @media print {
      html, body {
        width: 376px !important;
        height: 540px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
        overflow: hidden !important;
      }

      .controls-bar,
      .dual-lanyard-wrap {
        display: none !important;
      }

      .cards-container {
        perspective: none !important;
        width: 376px !important;
        height: 540px !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .chest-card {
        width: 376px !important;
        height: 540px !important;
        box-shadow: none !important;
        border: 1px solid #cbd5e1 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@600;700;800&family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #0b1120;
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 36px 16px;
    }

    /* Screen Controls Bar */
    .controls-bar {
      background: #1e293b;
      border: 1px solid #334155;
      padding: 10px 24px;
      border-radius: 9999px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .controls-bar h1 {
      color: #f8fafc;
      font-size: 13.5px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .theme-swatches {
      display: flex;
      align-items: center;
      gap: 7px;
      border-left: 1px solid #475569;
      padding-left: 14px;
    }

    .theme-label {
      font-size: 10.5px;
      color: #94a3b8;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .btn-swatch {
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }

    .btn-swatch:hover {
      transform: scale(1.15);
    }

    .btn-swatch.active {
      border-color: #ffffff;
      transform: scale(1.15);
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.4);
    }

    .btn-print {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: white;
      border: none;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
      transition: all 0.2s ease;
    }

    .btn-print:hover {
      background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
      transform: translateY(-1px);
    }

    /* Cards Stage */
    .cards-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      perspective: 1200px;
    }

    /* Badge Physical Specs: Press-Standard Vertical Event Badge (376px x 540px) */
    .chest-card {
      width: 376px;
      height: 540px;
      background: linear-gradient(180deg, #edf3f8 0%, #f4f8fb 40%, #e9f0f6 100%);
      border-radius: 18px;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .chest-card:hover {
      box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.2);
    }

    /* ============================================================
       TOP SECTION: Navy Brand Area with Incomplete Flush Tab
       ============================================================ */
    .badge-header-block {
      background: linear-gradient(170deg, #091a30 0%, #0c2340 55%, #102e54 100%);
      padding: 0 18px 14px 18px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      flex-shrink: 0;
      box-shadow: 0 6px 20px rgba(9, 26, 48, 0.3);
    }

    /* Dual Corner Lanyard Slot Punch Indicators */
    .dual-lanyard-wrap {
      position: absolute;
      top: 10px;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 0 20px;
      pointer-events: none;
      z-index: 10;
    }

    .lanyard-hole {
      width: 18px;
      height: 5px;
      background: #060d17;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.8);
    }

    /* Incomplete Hanging Tab (Starts flush at top cut of card so starting border is hidden) */
    .partner-capsule {
      background: linear-gradient(180deg, #edf3f8 0%, #f4f8fb 100%);
      padding: 4px 10px 5px 10px;
      border-radius: 0 0 12px 12px;
      border: 1px solid rgba(203, 213, 225, 0.8);
      border-top: none;
      display: inline-flex;
      align-items: flex-start;
      justify-content: center;
      gap: 9px;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
      margin-top: 0;
      margin-bottom: 10px;
      max-width: 240px;
      height: 38px;
    }

    .partner-col-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      text-align: center;
      flex-shrink: 0;
      height: 29px;
    }

    .partner-col-wrap.col-bsm {
      max-width: 44px;
    }

    .partner-col-wrap.col-dmc {
      max-width: 38px;
    }

    .partner-col-wrap.col-acp {
      max-width: 48px;
    }

    /* All 3 Circular Seals: Strict 1:1 circle (18px x 18px) on exact same top baseline */
    .partner-col-wrap img {
      height: 18px;
      width: 18px;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      mix-blend-mode: multiply;
      display: block;
      margin: 0 auto 1.5px auto;
      flex-shrink: 0;
    }

    .partner-col-text {
      font-size: 4.1px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.01em;
      line-height: 1.05;
      text-align: center;
      display: block;
      white-space: nowrap;
    }

    /* Conference Title Typography */
    .conf-institution {
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #38bdf8;
      margin-bottom: 3px;
      display: block;
    }

    .conf-main-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.01em;
      line-height: 1.15;
      text-transform: uppercase;
      color: #ffffff;
      margin-bottom: 2px;
    }

    .conf-main-title span {
      color: #2dd4bf;
    }

    /* Golden/Amber Conference Plaque Ribbon */
    .conf-date-plaque {
      width: 100%;
      margin-top: 10px;
      background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 50%, #d97706 100%);
      color: #451a03;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      box-shadow: 0 3px 8px rgba(217, 119, 6, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    /* ============================================================
       MIDDLE SECTION: Vertically Centered Attendee & QR Block
       ============================================================ */
    .badge-middle-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 100%;
      padding: 0;
      gap: 14px;
    }

    .badge-body-block {
      padding: 0 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: transparent;
      width: 100%;
      margin-top: -54px;
      margin-bottom: 0;
    }

    /* Role Badge */
    .role-pill-wrap {
      margin-bottom: 10px;
    }

    .role-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      color: #ffffff;
      padding: 5px 28px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      border: 1px solid rgba(255, 255, 255, 0.3);
      box-shadow: 0 3px 10px rgba(217, 119, 6, 0.28);
      transition: all 0.2s ease;
    }

    /* Attendee Name */
    .attendee-name {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #0f172a;
      line-height: 1.15;
      margin-bottom: 4px;
      text-transform: uppercase;
      max-width: 100%;
      word-break: break-word;
    }

    .attendee-inst {
      font-size: 13.5px;
      font-weight: 700;
      color: #0284c7;
      line-height: 1.25;
      margin-bottom: 8px;
    }

    /* Academic Designation Badge */
    .attendee-year-pill {
      display: inline-flex;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      padding: 3px 16px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
    }

    /* ============================================================
       VERIFICATION SECTION: QR Code on Top & ID Below
       ============================================================ */
    .badge-verify-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 6px;
      padding: 0;
      width: 100%;
      background: transparent;
      margin-top: 12px;
      margin-bottom: -28px;
    }

    /* Pure, seamless QR frame without artificial borders */
    .qr-frame {
      width: 110px;
      height: 110px;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      padding: 5px;
      border: 1px solid #e2e8f0;
      position: relative;
    }

    .qr-frame img {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }

    /* Participant ID Styling (Directly matching chest-card-acp-standalone-larger) */
    .verify-details {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      margin: 0 auto;
    }

    .verify-label {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      margin-right: -0.18em; /* Perfectly cancels trailing letter-space for exact center */
      color: #64748b;
      margin-bottom: 2px;
      text-align: center;
    }

    .verify-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin-right: -0.08em; /* Perfectly cancels trailing letter-space for exact center */
      color: #0369a1;
      line-height: 1.1;
      margin-bottom: 0;
      text-align: center;
    }

    /* ============================================================
       BOTTOM SECTION: Sponsor & Color Accent
       ============================================================ */
    .badge-footer-wrap {
      width: 100%;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .badge-footer-block {
      background: rgba(226, 232, 240, 0.85);
      padding: 6px 18px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .sponsor-label {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #64748b;
    }

    .sponsor-img {
      height: 17px;
      width: auto;
      object-fit: contain;
      mix-blend-mode: multiply;
    }

    /* Blue Lower Border Band */
    .badge-bottom-band {
      width: 100%;
      height: 14px;
      background: linear-gradient(90deg, #091a30 0%, #0f2746 50%, #13335a 100%);
      flex-shrink: 0;
    }

${printStyles}
  </style>
</head>
<body>

  <!-- Screen Controls Bar -->
  <div class="controls-bar">
    <h1>${heading || title}</h1>
    <div class="theme-swatches">
      <span class="theme-label">Role Pill:</span>
      <button class="btn-swatch active" style="background: linear-gradient(135deg, #d97706, #b45309);" title="Amber Gold (Default)" onclick="setRoleTheme('amber', this)"></button>
      <button class="btn-swatch" style="background: linear-gradient(135deg, #1e3a8a, #1e40af);" title="Royal Navy" onclick="setRoleTheme('royal', this)"></button>
      <button class="btn-swatch" style="background: linear-gradient(135deg, #0369a1, #0284c7);" title="Deep Cerulean" onclick="setRoleTheme('cerulean', this)"></button>
      <button class="btn-swatch" style="background: linear-gradient(135deg, #334155, #1e293b);" title="Charcoal Slate" onclick="setRoleTheme('slate', this)"></button>
    </div>
    <button class="btn-print" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print Card / Save PDF
    </button>
  </div>

  <!-- Chest Card Stage -->
  <div class="cards-container">
${cardsHtml}
  </div>

  <script>
    function setRoleTheme(theme, btn) {
      const pills = document.querySelectorAll('.role-pill');
      document.querySelectorAll('.btn-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pills.forEach(pill => {
        if (theme === 'royal') {
          pill.style.background = 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)';
          pill.style.boxShadow = '0 3px 10px rgba(30, 58, 138, 0.28)';
        } else if (theme === 'amber') {
          pill.style.background = 'linear-gradient(135deg, #d97706 0%, #b45309 100%)';
          pill.style.boxShadow = '0 3px 10px rgba(217, 119, 6, 0.28)';
        } else if (theme === 'cerulean') {
          pill.style.background = 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)';
          pill.style.boxShadow = '0 3px 10px rgba(3, 105, 161, 0.28)';
        } else if (theme === 'slate') {
          pill.style.background = 'linear-gradient(135deg, #334155 0%, #1e293b 100%)';
          pill.style.boxShadow = '0 3px 10px rgba(30, 41, 59, 0.28)';
        }
      });
    }
  </script>
</body>
</html>
`;
}

// Export PDF helper via headless Edge
export function exportPdf(htmlPath, pdfPath) {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (!fs.existsSync(edgePath)) {
    console.warn(`Edge not found at ${edgePath}`);
    return false;
  }
  try {
    execFileSync(edgePath, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath,
      'file:///' + htmlPath.replace(/\\/g, '/')
    ], { stdio: 'ignore' });
    return fs.existsSync(pdfPath);
  } catch (err) {
    console.warn(`Could not export PDF to ${pdfPath}: ${err.message}`);
    return false;
  }
}

// Standalone execution when run directly: `node generate-chest-card-imig.mjs`
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  const delegate = {
    id: 6,
    regNumber: "IMF-REG-0006",
    fullName: "Mahadi Hasan Siam",
    institution: "Dhaka Medical College",
    batch: "K-81",
    academicYear: "3rd Year",
    role: "PARTICIPANT",
  };

  const verifySig = generateVerifySig(delegate.regNumber);
  const verifyUrl = `https://imf2026.pages.dev/verify?reg=${encodeURIComponent(delegate.regNumber)}&sig=${encodeURIComponent(verifySig)}`;
  const qrBase64 = await generateQrCode(verifyUrl);

  const cardHtml = renderCard(delegate, qrBase64);
  const fullHtml = renderFullHtml({
    title: `IMF 2026 Conference Badge - Delegate - ${delegate.regNumber} - ${delegate.fullName}`,
    heading: `IMF 2026 Chest Card (Participant) &bull; ${delegate.fullName} (${delegate.regNumber})`,
    cardsHtml: cardHtml,
    isMultiPage: false
  });

  const outputPath = path.join(__dirname, 'chest-card-participant.html');
  fs.writeFileSync(outputPath, fullHtml, 'utf8');
  console.log(`✓ Participant chest card successfully generated for ${delegate.fullName} (${delegate.regNumber})!`);
  console.log(`Saved HTML to: ${outputPath}`);

  const pdfPath = path.join(__dirname, 'chest-card-participant.pdf');
  const success = exportPdf(outputPath, pdfPath);
  if (success) {
    console.log(`✓ Press-Ready 100% Vector Participant PDF successfully generated!`);
    console.log(`Saved Vector PDF to: ${pdfPath}`);
  }
}
