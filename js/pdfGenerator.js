// pdfGenerator.js - PDF 生成模組

import { state, FORMAT_TITLES, ACCIDENT_TAG_OPTIONS } from "./state.js";
import {
  showLoadingModal,
  hideLoadingModal,
  createObjectUrl,
  revokeObjectUrl,
  resizeImageForDoc,
} from "./utils.js";

const PDF_PRINT_IMAGE_MAX_DIMENSION = 1800;

const PDF_FONT_OPTIONS = {
  kai: {
    family: '"DFKai-SB", "標楷體", "KaiTi", serif',
  },
  "noto-serif-tc": {
    family: '"Noto Serif TC", serif',
  },
  "noto-sans-tc": {
    family: '"Noto Sans TC", sans-serif',
  },
  "jf-openhuninn": {
    family: '"jf open huninn", sans-serif',
    face: `
                @font-face {
                    font-family: "jf open huninn";
                    src: url("./font/jf-openhuninn-2.1.ttf") format("truetype");
                    font-weight: 400;
                    font-style: normal;
                    font-display: swap;
                }
    `,
  },
  iansui: {
    family: '"Iansui", sans-serif',
    face: `
                @font-face {
                    font-family: "Iansui";
                    src: url("./font/Iansui-Regular.ttf") format("truetype");
                    font-weight: 400;
                    font-style: normal;
                    font-display: swap;
                }
    `,
  },
  "gen-ryumin": {
    family: '"Gen Ryu Min", "Noto Serif TC", serif',
    face: `
                @font-face {
                    font-family: "Gen Ryu Min";
                    src: url("./font/GenRyuMin2TW-B.otf") format("opentype");
                    font-weight: 700;
                    font-style: normal;
                    font-display: swap;
                }
    `,
  },
  "chen-yuluoyan": {
    family: '"Chen Yuluoyan", sans-serif',
    face: `
                @font-face {
                    font-family: "Chen Yuluoyan";
                    src: url("./font/ChenYuluoyan-2.0-Thin.ttf") format("truetype");
                    font-weight: 300;
                    font-style: normal;
                    font-display: swap;
                }
    `,
  },
};

const PDF_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&family=Noto+Serif+TC:wght@400;700&display=swap";

const getSelectedPdfFont = () => {
  const selectedFont = document.getElementById("pdfFontSelect")?.value;
  return PDF_FONT_OPTIONS[selectedFont] || PDF_FONT_OPTIONS.kai;
};

const generateAccidentTagsText = (tags) => {
  const tagTexts = ACCIDENT_TAG_OPTIONS.map((option) => {
    const isChecked = tags && tags[option.id];
    const checkbox = isChecked ? "■" : "□";
    if (option.id === "other") {
      const otherText =
        isChecked && tags.otherText ? tags.otherText : "___________";
      return `${checkbox}其他:${otherText}`;
    }
    return `${checkbox}${option.label}`;
  });
  return tagTexts.join(" ");
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

export const handleGeneratePDF = async () => {
  if (state.selectedImages.length === 0) {
    alert("請選擇至少一張圖片。");
    return;
  }
  showLoadingModal();
  window.__mpictureSuppressBeforeUnload = true;

  let printFrame;
  const printUrls = [];
  let cleanupTimer = null;
  let cleanupTimeout = null;
  let didCleanup = false;

  try {
    const isAutoDate = document.getElementById("dateModeSwitch").checked;
    const manualDate = document.getElementById("caseDate").value;
    const caseReason = document.getElementById("zipPrefix").value;
    const caseUnit = document.getElementById("caseUni").value;
    const caseAddress = document.getElementById("caseAddress").value;
    const caseNumber = document.getElementById("caseNumber").value;
    const pdfFont = getSelectedPdfFont();

    const title =
      state.customDocTitles[state.selectedFormat] ??
      FORMAT_TITLES[state.selectedFormat];

    const printableImages = await Promise.all(
      state.selectedImages.map(async (image) => {
        const printBlob = await resizeImageForDoc(
          image.blob,
          PDF_PRINT_IMAGE_MAX_DIMENSION,
        );
        const printUrl = createObjectUrl(printBlob);
        printUrls.push(printUrl);
        return {
          ...image,
          printUrl,
        };
      }),
    );

    let printContent = buildPrintHTML(title, pdfFont);

    if (state.selectedFormat === "left") {
      printContent += buildCriminalContent(
        title,
        isAutoDate,
        manualDate,
        caseReason,
        caseUnit,
        caseAddress,
        caseNumber,
        printableImages,
      );
    } else if (state.selectedFormat === "middle") {
      printContent += buildTrafficAccidentContent(
        title,
        isAutoDate,
        manualDate,
        printableImages,
      );
    }

    printContent += "</body></html>";

    hideLoadingModal();

    printFrame = document.createElement("iframe");
    printFrame.title = "PDF 列印預覽";
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    printFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(printFrame);

    const frameWindow = printFrame.contentWindow;
    const frameDocument = printFrame.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      throw new Error("無法建立列印框架");
    }

    frameDocument.open();
    frameDocument.write(printContent);
    frameDocument.close();

    const cleanup = () => {
      if (didCleanup) return;
      didCleanup = true;
      if (cleanupTimer) {
        window.clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      if (cleanupTimeout) {
        window.clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      printUrls.forEach(revokeObjectUrl);
      window.__mpictureSuppressBeforeUnload = false;
      if (printFrame?.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }
      window.focus();
    };

    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    frameWindow.addEventListener("pagehide", cleanup, { once: true });
    cleanupTimer = window.setInterval(cleanup, 1500);
    cleanupTimeout = window.setTimeout(cleanup, 5 * 60 * 1000);

    const startPrint = async () => {
      try {
        await frameDocument.fonts?.ready;
      } catch (error) {
        console.warn("PDF 字型載入等待失敗，改用瀏覽器備援字型:", error);
      }
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(() => {
        window.focus();
      }, 0);
    };

    if (frameDocument.readyState === "complete") {
      window.setTimeout(startPrint, 500);
    } else {
      printFrame.addEventListener(
        "load",
        () => window.setTimeout(startPrint, 500),
        { once: true },
      );
    }
  } catch (error) {
    printUrls.forEach(revokeObjectUrl);
    if (cleanupTimer) {
      window.clearInterval(cleanupTimer);
    }
    if (cleanupTimeout) {
      window.clearTimeout(cleanupTimeout);
    }
    window.__mpictureSuppressBeforeUnload = false;
    if (printFrame?.parentNode) {
      printFrame.parentNode.removeChild(printFrame);
    }
    hideLoadingModal();
    console.error("Error in PDF generation:", error);
    alert("PDF 生成過程中出錯，請查看控制台以獲取詳細信息。");
  }
};

const buildPrintHTML = (title, pdfFont) => {
  const safeTitle = escapeHtml(title);
  const fontFamily = pdfFont.family;

  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${safeTitle}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="${PDF_FONT_STYLESHEET}" rel="stylesheet">
            <style>
                ${pdfFont.face || ""}
                @page {
                    size: A4;
                    margin: 12mm 20mm 1mm 20mm;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: ${fontFamily};
                    font-size: 11.5pt;
                    line-height: 1.2;
                }
                h1 {
                    text-align: justify;
                    text-align-last: justify;
                    letter-spacing: 0;
                    font-size: 22pt;
                    font-weight: normal;
                    margin-bottom: 0.5em;
                    padding: 0;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    border: 1px solid #000;
                }
                td, th {
                    border: 1px solid #000;
                    padding: 4px 6px;
                    vertical-align: middle;
                    word-wrap: break-word;
                }
                .photo-cell {
                    text-align: center;
                    height: 100mm;
                    vertical-align: middle;
                    padding: 1px;
                }
                .photo-cell img {
                    max-width: 100%;
                    max-height: 97mm;
                    object-fit: contain;
                }
                .label-cell {
                    text-align: center;
                    text-align: justify;
                    text-align-last: justify;
                    width: 15%;
                }
                .value-cell {
                    text-align: left;
                }
                .page-container {
                    page-break-after: always;
                    page-break-inside: avoid;
                }
                .page-container:last-child {
                    page-break-after: auto;
                }
                .footer {
                    text-align: center;
                    font-size: 10pt;
                    margin-top: 10px;
                }
                .spacer {
                    height: 3px;
                }
                .empty-cell {
                    border: none !important;
                    background: transparent !important;
                }
                @media print {
                    .page-container {
                        page-break-after: always;
                        page-break-inside: avoid;
                    }
                    .page-container:last-child {
                        page-break-after: auto;
                    }
                }
            </style>
        </head>
        <body>
    `;
};

const buildCriminalContent = (
  title,
  isAutoDate,
  manualDate,
  caseReason,
  caseUnit,
  caseAddress,
  caseNumber,
  images,
) => {
  let content = "";
  const totalPages = Math.ceil(images.length / 2);

  for (let page = 0; page < totalPages; page++) {
    const startIdx = page * 2;
    content += `<div class="page-container">`;
    content += `<h1>${escapeHtml(title)}</h1>`;
    const img1 = images[startIdx];
    const customDate1 = state.imageDates[img1.id] || "";
    const date1 =
      customDate1 || (isAutoDate ? img1.date || manualDate : manualDate);
    const address1 = state.imageAddresses[img1.id] || caseAddress;
    const desc1 = state.imageDescriptions[img1.id] || "";
    const safeCaseReason = escapeHtml(caseReason);
    const safeCaseUnit = escapeHtml(caseUnit);
    const safeCaseNumber = escapeHtml(caseNumber);
    const safeDate1 = escapeHtml(date1);
    const safeAddress1 = escapeHtml(address1);
    const safeDesc1 = escapeHtml(desc1);
    content += `
            <table>
                <tr>
                    <td class="label-cell" style="width:16.5%;">案由</td>
                    <td class="value-cell" style="width:34.5%; text-align:center;" colspan="2">${safeCaseReason}</td>
                    <td class="label-cell" style="width:16.5%;">單位</td>
                    <td class="value-cell" style="width:34.5%; text-align:center;" colspan="2">${safeCaseUnit}</td>
                </tr>
                <tr><td class="photo-cell" colspan="6"><img src="${img1.printUrl}"></td></tr>
                <tr>
                    <td class="label-cell">編號(${startIdx + 1})</td>
                    <td class="label-cell">照片日期</td>
                    <td class="value-cell" colspan="2">${safeDate1}</td>
                    <td class="label-cell">攝影人</td>
                    <td class="value-cell" style="text-align:center;">${safeCaseNumber}</td>
                </tr>
                <tr>
                    <td class="label-cell">攝影地址</td>
                    <td class="value-cell" colspan="5">${safeAddress1}</td>
                </tr>
                <tr>
                    <td class="label-cell">說明</td>
                    <td class="value-cell" colspan="5">${safeDesc1}</td>
                </tr>
            </table>
        `;

    if (startIdx + 1 < images.length) {
      const img2 = images[startIdx + 1];
      const customDate2 = state.imageDates[img2.id] || "";
      const date2 =
        customDate2 || (isAutoDate ? img2.date || manualDate : manualDate);
      const address2 = state.imageAddresses[img2.id] || caseAddress;
      const desc2 = state.imageDescriptions[img2.id] || "";
      const safeDate2 = escapeHtml(date2);
      const safeAddress2 = escapeHtml(address2);
      const safeDesc2 = escapeHtml(desc2);
      content += `
                <div style="height: 10px;"></div>
                <table>
                    <tr><td class="photo-cell" colspan="6"><img src="${img2.printUrl}"></td></tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">編號(${startIdx + 2})</td>
                        <td class="label-cell" style="width:15%;">照片日期</td>
                        <td class="value-cell" style="width:35%;" colspan="2">${safeDate2}</td>
                        <td class="label-cell" style="width:15%;">攝影人</td>
                        <td class="value-cell" style="width:35%; text-align:center;">${safeCaseNumber}</td>
                    </tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">攝影地址</td>
                        <td class="value-cell" style="width:85%;" colspan="5">${safeAddress2}</td>
                    </tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">說明</td>
                        <td class="value-cell" style="width:85%;" colspan="5">${safeDesc2}</td>
                    </tr>
                </table>
            `;
    }
    content += `</div>`;
  }

  return content;
};

const buildTrafficAccidentContent = (title, isAutoDate, manualDate, images) => {
  let content = "";
  const totalPages = Math.ceil(images.length / 2);

  for (let page = 0; page < totalPages; page++) {
    const startIdx = page * 2;
    content += `<div class="page-container">`;
    content += `<h1>${escapeHtml(title)}</h1>`;

    const img1 = images[startIdx];
    const customDate1 = state.imageDates[img1.id] || "";
    const date1 =
      customDate1 || (isAutoDate ? img1.date || manualDate : manualDate);
    const tags1 = state.imageAccidentTags[img1.id] || {};
    const tagsText1 = generateAccidentTagsText(tags1);
    const safeDate1 = escapeHtml(date1);
    const safeTagsText1 = escapeHtml(tagsText1);
    content += `
            <table>
                <tr><td class="photo-cell" colspan="6"><img src="${img1.printUrl}"></td></tr>
                <tr>
                    <td class="label-cell" style="width:15%;">攝影日期</td>
                    <td class="value-cell" style="width:40%;" colspan="2">${safeDate1}</td>
                    <td class="label-cell" style="width:15%;">照片編號</td>
                    <td class="value-cell" style="width:30%; text-align:center;" colspan="2">${startIdx + 1}</td>
                </tr>
                <tr>
                    <td class="label-cell">說明</td>
                    <td class="value-cell" colspan="5">${safeTagsText1}</td>
                </tr>
            </table>
        `;

    if (startIdx + 1 < images.length) {
      const img2 = images[startIdx + 1];
      const customDate2 = state.imageDates[img2.id] || "";
      const date2 =
        customDate2 || (isAutoDate ? img2.date || manualDate : manualDate);
      const tags2 = state.imageAccidentTags[img2.id] || {};
      const tagsText2 = generateAccidentTagsText(tags2);
      const safeDate2 = escapeHtml(date2);
      const safeTagsText2 = escapeHtml(tagsText2);
      content += `
                <div style="height: 20px;"></div>
                <table>
                    <tr><td class="photo-cell" colspan="6"><img src="${img2.printUrl}"></td></tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">攝影日期</td>
                        <td class="value-cell" style="width:40%;" colspan="2">${safeDate2}</td>
                        <td class="label-cell" style="width:15%;">照片編號</td>
                        <td class="value-cell" style="width:30%; text-align:center;" colspan="2">${startIdx + 2}</td>
                    </tr>
                    <tr>
                        <td class="label-cell">說明</td>
                        <td class="value-cell" colspan="5">${safeTagsText2}</td>
                    </tr>
                </table>
            `;
    }

    content += `</div>`;
  }

  return content;
};
