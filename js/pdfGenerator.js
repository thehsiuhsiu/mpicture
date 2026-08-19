// pdfGenerator.js - PDF 生成模組

import { state, FORMAT_TITLES, ACCIDENT_TAG_OPTIONS } from "./state.js";
import {
  showLoadingModal,
  hideLoadingModal,
  createObjectUrl,
  revokeObjectUrl,
} from "./utils.js";

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

export const handleGeneratePDF = async () => {
  if (state.selectedImages.length === 0) {
    alert("請選擇至少一張圖片。");
    return;
  }
  showLoadingModal();

  let printWindow;
  const printUrls = [];

  try {
    const isAutoDate = document.getElementById("dateModeSwitch").checked;
    const manualDate = document.getElementById("caseDate").value;
    const caseReason = document.getElementById("zipPrefix").value;
    const caseUnit = document.getElementById("caseUni").value;
    const caseAddress = document.getElementById("caseAddress").value;
    const caseNumber = document.getElementById("caseNumber").value;

    const title =
      state.customDocTitles[state.selectedFormat] ||
      FORMAT_TITLES[state.selectedFormat];

    const printableImages = state.selectedImages.map((image) => {
      const printUrl = createObjectUrl(image.blob);
      printUrls.push(printUrl);
      return {
        ...image,
        printUrl,
      };
    });

    let printContent = buildPrintHTML(title);

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

    printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };

    const cleanup = () => {
      printUrls.forEach(revokeObjectUrl);
    };

    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printWindow.addEventListener("beforeunload", cleanup, { once: true });
  } catch (error) {
    printUrls.forEach(revokeObjectUrl);
    hideLoadingModal();
    console.error("Error in PDF generation:", error);
    alert("PDF 生成過程中出錯，請查看控制台以獲取詳細信息。");
  }
};

const buildPrintHTML = (title) => {
  return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
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
                    font-family: "DFKai-SB", "標楷體", "KaiTi", serif;
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
    content += `<h1>${title}</h1>`;
    const img1 = images[startIdx];
    const customDate1 = state.imageDates[img1.id] || "";
    const date1 =
      customDate1 || (isAutoDate ? img1.date || manualDate : manualDate);
    const address1 = state.imageAddresses[img1.id] || caseAddress;
    const desc1 = state.imageDescriptions[img1.id] || "";
    content += `
            <table>
                <tr>
                    <td class="label-cell" style="width:16.5%;">案由</td>
                    <td class="value-cell" style="width:34.5%; text-align:center;" colspan="2">${caseReason}</td>
                    <td class="label-cell" style="width:16.5%;">單位</td>
                    <td class="value-cell" style="width:34.5%; text-align:center;" colspan="2">${caseUnit}</td>
                </tr>
                <tr><td class="photo-cell" colspan="6"><img src="${img1.printUrl}"></td></tr>
                <tr>
                    <td class="label-cell">編號(${startIdx + 1})</td>
                    <td class="label-cell">照片日期</td>
                    <td class="value-cell" colspan="2">${date1}</td>
                    <td class="label-cell">攝影人</td>
                    <td class="value-cell" style="text-align:center;">${caseNumber}</td>
                </tr>
                <tr>
                    <td class="label-cell">攝影地址</td>
                    <td class="value-cell" colspan="5">${address1}</td>
                </tr>
                <tr>
                    <td class="label-cell">說明</td>
                    <td class="value-cell" colspan="5">${desc1}</td>
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
      content += `
                <div style="height: 10px;"></div>
                <table>
                    <tr><td class="photo-cell" colspan="6"><img src="${img2.printUrl}"></td></tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">編號(${startIdx + 2})</td>
                        <td class="label-cell" style="width:15%;">照片日期</td>
                        <td class="value-cell" style="width:35%;" colspan="2">${date2}</td>
                        <td class="label-cell" style="width:15%;">攝影人</td>
                        <td class="value-cell" style="width:35%; text-align:center;">${caseNumber}</td>
                    </tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">攝影地址</td>
                        <td class="value-cell" style="width:85%;" colspan="5">${address2}</td>
                    </tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">說明</td>
                        <td class="value-cell" style="width:85%;" colspan="5">${desc2}</td>
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
    content += `<h1>${title}</h1>`;

    const img1 = images[startIdx];
    const customDate1 = state.imageDates[img1.id] || "";
    const date1 =
      customDate1 || (isAutoDate ? img1.date || manualDate : manualDate);
    const tags1 = state.imageAccidentTags[img1.id] || {};
    const tagsText1 = generateAccidentTagsText(tags1);
    content += `
            <table>
                <tr><td class="photo-cell" colspan="6"><img src="${img1.printUrl}"></td></tr>
                <tr>
                    <td class="label-cell" style="width:15%;">攝影日期</td>
                    <td class="value-cell" style="width:40%;" colspan="2">${date1}</td>
                    <td class="label-cell" style="width:15%;">照片編號</td>
                    <td class="value-cell" style="width:30%; text-align:center;" colspan="2">${startIdx + 1}</td>
                </tr>
                <tr>
                    <td class="label-cell">說明</td>
                    <td class="value-cell" colspan="5">${tagsText1}</td>
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
      content += `
                <div style="height: 20px;"></div>
                <table>
                    <tr><td class="photo-cell" colspan="6"><img src="${img2.printUrl}"></td></tr>
                    <tr>
                        <td class="label-cell" style="width:15%;">攝影日期</td>
                        <td class="value-cell" style="width:40%;" colspan="2">${date2}</td>
                        <td class="label-cell" style="width:15%;">照片編號</td>
                        <td class="value-cell" style="width:30%; text-align:center;" colspan="2">${startIdx + 2}</td>
                    </tr>
                    <tr>
                        <td class="label-cell">說明</td>
                        <td class="value-cell" colspan="5">${tagsText2}</td>
                    </tr>
                </table>
            `;
    }

    content += `</div>`;
  }

  return content;
};
