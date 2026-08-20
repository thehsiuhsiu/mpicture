// main.js - 主入口模組

import { state } from "./state.js";
import {
  handleImageSelection,
  handleViewModeChange,
  handleImageContainerEvents,
  updateCreateButtonState,
  handleImageClick,
  rotateImage,
  processFiles,
} from "./imageHandler.js";
import { handleGenerateWrapper } from "./docxGenerator.js";
import { handleGeneratePDF } from "./pdfGenerator.js";
import { EMPTY_STATE_HTML, showToast, createObjectUrl } from "./utils.js";
import { initGooglePhotosImport } from "./googlePhotos.js";

const initEmptyState = () => {
  const imagePreview = document.getElementById("imagePreview");
  if (imagePreview && state.selectedImages.length === 0) {
    const emptyStateDiv = document.createElement("div");
    emptyStateDiv.className = "empty-state";
    emptyStateDiv.innerHTML = EMPTY_STATE_HTML;
    imagePreview.appendChild(emptyStateDiv);
  }
};

const sanitizeZipFileName = (fileName) => {
  const cleanedName = fileName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return cleanedName || "照片";
};

const hasInvalidFileNameChars = (fileName) =>
  /[<>:"/\\|?*\x00-\x1f]/.test(fileName);

const requestZipDownloadNames = () =>
  new Promise((resolve) => {
    const modal = document.getElementById("zipNameModal");
    const photoInput = document.getElementById("photoFileNameInput");
    const photoWarning = document.getElementById("photoFileNameWarning");
    const confirmButton = document.getElementById("zipNameConfirmBtn");
    const cancelButton = document.getElementById("zipNameCancelBtn");
    const cancelIcon = document.getElementById("zipNameCancelIcon");
    const prefixInput = document.getElementById("zipPrefix");

    if (
      !modal ||
      !photoInput ||
      !photoWarning ||
      !confirmButton ||
      !cancelButton ||
      !cancelIcon
    ) {
      resolve({
        zipFileName: "照片打包下載",
        photoFileName: "照片黏貼表",
      });
      return;
    }

    const defaultPhotoName = sanitizeZipFileName(
      prefixInput?.value ? `${prefixInput.value}照片黏貼表` : "照片黏貼表",
    );

    let isResolved = false;
    photoInput.value = defaultPhotoName;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    photoInput.focus();
    photoInput.select();

    const updatePhotoNameWarning = () => {
      const shouldWarn = hasInvalidFileNameChars(photoInput.value);
      photoInput.classList.toggle("has-warning", shouldWarn);
      photoWarning.classList.toggle("is-visible", shouldWarn);
    };

    const cleanup = () => {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      photoInput.classList.remove("has-warning");
      photoWarning.classList.remove("is-visible");
      confirmButton.removeEventListener("click", handleConfirm);
      cancelButton.removeEventListener("click", handleCancel);
      cancelIcon.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleBackdropClick);
      photoInput.removeEventListener("input", updatePhotoNameWarning);
      photoInput.removeEventListener("keydown", handleKeydown);
    };

    const finish = (value) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(value);
    };

    const handleConfirm = () => {
      updatePhotoNameWarning();
      finish({
        zipFileName: "照片打包",
        photoFileName: sanitizeZipFileName(
          photoInput.value || defaultPhotoName,
        ),
      });
    };

    const handleCancel = () => {
      finish(null);
    };

    const handleBackdropClick = (event) => {
      if (event.target === modal) {
        handleCancel();
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleConfirm();
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    };

    confirmButton.addEventListener("click", handleConfirm);
    cancelButton.addEventListener("click", handleCancel);
    cancelIcon.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdropClick);
    photoInput.addEventListener("input", updatePhotoNameWarning);
    photoInput.addEventListener("keydown", handleKeydown);
    updatePhotoNameWarning();
  });

const downloadImagesAsZip = async ({ zipFileName, photoFileName }) => {
  document.getElementById("zippingModal").style.display = "block";

  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    const zip = new JSZip();
    const prefixInput = document.getElementById("zipPrefix");
    const prefix = prefixInput ? prefixInput.value.trim() : "";
    for (let i = 0; i < state.selectedImages.length; i++) {
      const img = state.selectedImages[i];
      const ext = img.name.split(".").pop();
      const basePhotoName = sanitizeZipFileName(photoFileName || prefix);
      const newName = `${basePhotoName}-編號${i + 1}.${ext}`;
      zip.file(newName, img.blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    const downloadUrl = createObjectUrl(content);
    a.href = downloadUrl;
    a.download = `${sanitizeZipFileName(zipFileName)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  } finally {
    document.getElementById("zippingModal").style.display = "none";
  }
};

const updateToggleState = (value) => {
  const toggleContainer = document.querySelector(".toggle-container");
  toggleContainer.setAttribute("data-state", value);
  state.selectedFormat = value;

  const labels = toggleContainer.querySelectorAll(".label");
  labels.forEach((label) => {
    label.classList.toggle(
      "active",
      label.getAttribute("data-value") === value,
    );
  });

  document.body.classList.remove(
    "format-left",
    "format-middle",
    "format-right",
  );
  document.body.classList.add(`format-${value}`);

  updateSidebarFields(value);
};

const updateSidebarFields = (format) => {
  const allFields = document.querySelectorAll(".sidebar [data-format]");

  allFields.forEach((field) => {
    const formats = field.getAttribute("data-format").split(" ");
    if (formats.includes(format)) {
      field.style.display = "";
    } else {
      field.style.display = "none";
    }
  });

  const dateLabelText = document.getElementById("dateLabelText");
  const addressLabelText = document.getElementById("addressLabelText");
  const personLabelText = document.getElementById("personLabelText");

  if (dateLabelText) dateLabelText.textContent = "攝影日期";
  if (addressLabelText) addressLabelText.textContent = "攝影地址";
  if (personLabelText) personLabelText.textContent = "攝影人員";
};

const initDocumentTitles = () => {
  const docTitleLeft = document.getElementById("docTitleLeft");
  const docTitleMiddle = document.getElementById("docTitleMiddle");

  if (docTitleLeft) {
    state.customDocTitles.left = docTitleLeft.value.trim();

    docTitleLeft.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim();
      state.customDocTitles.left = newTitle;
    });
  }

  if (docTitleMiddle) {
    state.customDocTitles.middle = docTitleMiddle.value.trim();

    docTitleMiddle.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim();
      state.customDocTitles.middle = newTitle;
    });
  }
};

const init = () => {
  if (state.isInitialized) return;
  state.isInitialized = true;

  const elements = {
    imageInput: document.getElementById("imageInput"),
    generateButton: document.getElementById("generate"),
    imagePreview: document.getElementById("imagePreview"),
  };

  if (!Object.values(elements).every(Boolean)) {
    console.error("必要的 DOM 元素未找到");
    return;
  }

  initDocumentTitles();

  elements.imageInput.addEventListener("change", handleImageSelection);

  const downloadMenu = document.getElementById("downloadMenu");
  const downloadDocx = document.getElementById("downloadDocx");
  const downloadPdf = document.getElementById("downloadPdf");
  const downloadZip = document.getElementById("downloadZip");

  downloadMenu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  elements.generateButton.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu.classList.toggle("show");
  });

  downloadDocx.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu.classList.remove("show");
    handleGenerateWrapper(e);
  });

  downloadPdf.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu.classList.remove("show");
    handleGeneratePDF();
  });

  downloadZip.addEventListener("click", async (e) => {
    e.stopPropagation();
    downloadMenu.classList.remove("show");
    if (!state.selectedImages.length) {
      showToast(
        "打包照片的紙箱準備好了…但沒有看到照片，只看到小貓在裡面睡了一整個下午💤",
        "error",
      );
      return;
    }

    const zipNames = await requestZipDownloadNames();
    if (!zipNames) return;

    await downloadImagesAsZip(zipNames);
  });

  document.addEventListener("click", () => {
    downloadMenu.classList.remove("show");
  });

  const toggleContainer = document.querySelector(".toggle-container");
  const labels = toggleContainer.querySelectorAll(".label");

  labels.forEach((label) => {
    label.addEventListener("click", () => {
      const value = label.getAttribute("data-value");
      updateToggleState(value);
    });
  });

  updateToggleState(state.selectedFormat);
  updateCreateButtonState();

  const gridViewBtn = document.getElementById("gridViewBtn");
  const listViewBtn = document.getElementById("listViewBtn");
  if (gridViewBtn && listViewBtn) {
    gridViewBtn.addEventListener("click", () => handleViewModeChange("grid"));
    listViewBtn.addEventListener("click", () => handleViewModeChange("list"));
  }

  console.log("圖片管理腳本初始化完成");
};

const setupEventListeners = () => {
  const imagePreview = document.getElementById("imagePreview");
  [
    "dragstart",
    "dragover",
    "dragenter",
    "dragleave",
    "drop",
    "dragend",
  ].forEach((eventName) => {
    imagePreview.addEventListener(eventName, handleImageContainerEvents);
  });

  imagePreview.addEventListener("click", handleImageClick);

  window.addEventListener("error", (event) => {
    const target = event.target;
    const isResourceError =
      target && target !== window && target instanceof HTMLElement;

    if (isResourceError) {
      console.warn("Resource failed to load:", {
        tagName: target.tagName,
        source: target.getAttribute("src") || target.getAttribute("href"),
      });
      return;
    }

    console.error("Uncaught error:", event.error || event.message);
    alert(
      "發生了意外錯誤。請重新加載頁面並重試。如果問題持續存在，請聯繫維護者。",
    );
  });
};

const setupEditTools = () => {
  const rotateLeftBtn = document.getElementById("rotateLeftBtn");
  const rotateRightBtn = document.getElementById("rotateRightBtn");

  if (rotateLeftBtn) {
    rotateLeftBtn.addEventListener("click", () => {
      rotateImage(-90);
    });
  }

  if (rotateRightBtn) {
    rotateRightBtn.addEventListener("click", () => {
      rotateImage(90);
    });
  }
};

const setupPhotoSizeSlider = () => {
  const slider = document.getElementById("photoSizeSlider");
  const sizeDecBtn = document.getElementById("sizeDecBtn");
  const sizeIncBtn = document.getElementById("sizeIncBtn");

  const updateImageSizes = () => {
    const imgs = document.querySelectorAll(".image-container img");
    imgs.forEach((img) => {
      img.style.maxWidth = slider.value + "px";
      img.style.maxHeight = slider.value + "px";
    });
  };

  slider.addEventListener("input", updateImageSizes);

  sizeDecBtn.addEventListener("click", () => {
    const newValue = Math.max(
      parseInt(slider.min),
      parseInt(slider.value) - 40,
    );
    slider.value = newValue;
    updateImageSizes();
  });

  sizeIncBtn.addEventListener("click", () => {
    const newValue = Math.min(
      parseInt(slider.max),
      parseInt(slider.value) + 40,
    );
    slider.value = newValue;
    updateImageSizes();
  });
};

const setupSidebarInputs = () => {
  const sidebarInputs = document.querySelectorAll(".sidebar-input");
  sidebarInputs.forEach((input) => {
    input.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    input.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
};

const setupDateModeSwitch = () => {
  const dateSwitch = document.getElementById("dateModeSwitch");
  const dateInput = document.getElementById("caseDate");
  const dateModeLabel = document.getElementById("dateModeLabel");

  function setDateInputMode() {
    if (dateSwitch.checked) {
      dateInput.disabled = false;
      dateModeLabel.textContent = "Auto-fill EXIF";
      dateModeLabel.classList.remove("disabled");
    } else {
      dateInput.disabled = false;
      dateModeLabel.textContent = "Auto-fill EXIF";
      dateModeLabel.classList.add("disabled");
    }
  }

  dateSwitch.addEventListener("change", setDateInputMode);
  setDateInputMode();
};

const setupPdfFontPreview = () => {
  const fontSelect = document.getElementById("pdfFontSelect");
  const dropdown = document.getElementById("pdfFontDropdown");
  const trigger = document.getElementById("pdfFontTrigger");
  const triggerText = trigger?.querySelector(".pdf-font-trigger-text");
  const options = Array.from(
    document.querySelectorAll(".pdf-font-option[data-value]"),
  );

  if (!fontSelect || !dropdown || !trigger || !triggerText || !options.length) {
    return;
  }

  const previewClasses = [
    "font-preview-kai",
    "font-preview-noto-serif",
    "font-preview-noto-sans",
    "font-preview-jf-openhuninn",
    "font-preview-iansui",
    "font-preview-gen-ryumin",
    "font-preview-chen-yuluoyan",
  ];

  const previewClassByValue = {
    kai: "font-preview-kai",
    "noto-serif-tc": "font-preview-noto-serif",
    "noto-sans-tc": "font-preview-noto-sans",
    "jf-openhuninn": "font-preview-jf-openhuninn",
    iansui: "font-preview-iansui",
    "gen-ryumin": "font-preview-gen-ryumin",
    "chen-yuluoyan": "font-preview-chen-yuluoyan",
  };

  const closeMenu = () => {
    dropdown.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    dropdown.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  };

  const updateFontPreview = () => {
    const selectedOption = options.find(
      (option) => option.dataset.value === fontSelect.value,
    );

    trigger.classList.remove(...previewClasses);
    trigger.classList.add(
      previewClassByValue[fontSelect.value] || "font-preview-kai",
    );
    triggerText.textContent =
      selectedOption?.querySelector(".pdf-font-option-name")?.textContent ||
      fontSelect.selectedOptions[0]?.textContent ||
      "標楷體";

    options.forEach((option) => {
      const isSelected = option.dataset.value === fontSelect.value;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-selected", String(isSelected));
    });
  };

  trigger.addEventListener("click", () => {
    if (dropdown.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  options.forEach((option) => {
    option.addEventListener("click", () => {
      fontSelect.value = option.dataset.value;
      fontSelect.dispatchEvent(new Event("change"));
      closeMenu();
      trigger.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  fontSelect.addEventListener("change", updateFontPreview);
  updateFontPreview();
};

const setupBeforeUnload = () => {
  window.onbeforeunload = function (e) {
    if (window.__mpictureSuppressBeforeUnload) return;

    const hasInput =
      document.getElementById("zipPrefix").value.trim() ||
      document.getElementById("caseUni").value.trim() ||
      document.getElementById("caseAddress").value.trim() ||
      document.getElementById("caseDate").value.trim() ||
      document.getElementById("caseNumber").value.trim() ||
      (state.selectedImages && state.selectedImages.length > 0);

    if (hasInput) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  };
};

const setupResizeWarning = () => {
  const resizeWarningModal = document.getElementById("resize-warning");

  if (!resizeWarningModal) {
    console.error("Resize warning modal not found!");
    return;
  }

  const checkWindowSize = () => {
    if (window.innerWidth < 1360 || window.innerHeight < 700) {
      resizeWarningModal.style.display = "flex";
    } else {
      resizeWarningModal.style.display = "none";
    }
  };

  window.addEventListener("resize", checkWindowSize);
  checkWindowSize();
};

const setupModalTrigger = (triggerId, modalId, closeId) => {
  const trigger = document.getElementById(triggerId);
  const modal = document.getElementById(modalId);
  const closeButton = document.getElementById(closeId);

  if (!trigger || !modal || !closeButton) return;

  const openModal = () => {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  trigger.addEventListener("click", openModal);
  closeButton.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      modal.getAttribute("aria-hidden") === "false"
    ) {
      closeModal();
    }
  });
};

const setupInfoModals = () => {
  setupModalTrigger("privacyPolicyBtn", "privacyModal", "privacyModalClose");
  setupModalTrigger("faqBtn", "faqModal", "faqModalClose");
};

const setupConsentGate = () => {
  const consentVersion = "2026-08-19";
  const storageKey = "mpictureConsentVersion";
  const consentModal = document.getElementById("consentModal");
  const consentCheckbox = document.getElementById("consentCheckbox");
  const agreeButton = document.getElementById("consentAgreeBtn");

  if (!consentModal || !consentCheckbox || !agreeButton) return;

  const hasConsented = sessionStorage.getItem(storageKey) === consentVersion;

  if (!hasConsented) {
    consentModal.style.display = "flex";
    consentModal.setAttribute("aria-hidden", "false");
  }

  consentCheckbox.addEventListener("change", () => {
    agreeButton.disabled = !consentCheckbox.checked;
  });

  agreeButton.addEventListener("click", () => {
    if (!consentCheckbox.checked) return;

    sessionStorage.setItem(storageKey, consentVersion);
    consentModal.style.display = "none";
    consentModal.setAttribute("aria-hidden", "true");
  });
};

const setupMobileSidebar = () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  let touchStartY = 0;
  let touchEndY = 0;

  sidebar.addEventListener("click", (e) => {
    if (!sidebar.classList.contains("expanded")) {
      const rect = sidebar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      if (clickY < 50) {
        sidebar.classList.add("expanded");
      }
    }
  });

  const inputs = sidebar.querySelectorAll("input");
  inputs.forEach((input) => {
    input.addEventListener("focus", () => {
      sidebar.classList.add("expanded");
    });
  });

  sidebar.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.changedTouches[0].screenY;
    },
    { passive: true },
  );

  sidebar.addEventListener(
    "touchend",
    (e) => {
      touchEndY = e.changedTouches[0].screenY;
      handleSwipeGesture();
    },
    { passive: true },
  );

  const handleSwipeGesture = () => {
    const swipeDistance = touchStartY - touchEndY;
    const threshold = 50;

    if (swipeDistance > threshold) {
      sidebar.classList.add("expanded");
    } else if (swipeDistance < -threshold) {
      sidebar.classList.remove("expanded");
    }
  };

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(e.target) &&
        sidebar.classList.contains("expanded")
      ) {
        sidebar.classList.remove("expanded");
      }
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebar.classList.remove("expanded");
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  const photoSourcePicker = document.getElementById("photoSourcePicker");
  const localPhotoSourceBtn = document.getElementById("localPhotoSourceBtn");

  document
    .getElementById("fabAddPhoto")
    .addEventListener("click", function (e) {
      e.stopPropagation();
      photoSourcePicker?.classList.toggle("open");
    });

  localPhotoSourceBtn?.addEventListener("click", function (e) {
    e.stopPropagation();
    photoSourcePicker?.classList.remove("open");
    document.getElementById("imageInput").click();
  });

  document.addEventListener("click", () => {
    photoSourcePicker?.classList.remove("open");
  });

  initEmptyState();

  init();
  setupEventListeners();
  setupPhotoSizeSlider();
  setupSidebarInputs();
  setupDateModeSwitch();
  setupPdfFontPreview();
  setupBeforeUnload();
  setupResizeWarning();
  setupInfoModals();
  setupConsentGate();
  setupMobileSidebar();
  setupEditTools();
  setupThemeToggle();
  initGooglePhotosImport(processFiles);
});

const setupThemeToggle = () => {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeMenu = document.getElementById("themeMenu");
  const themeSelector = themeToggleBtn?.closest(".theme-selector");

  if (!themeToggleBtn || !themeMenu) return;

  const html = document.documentElement;

  const getSystemTheme = () => {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const applyTheme = (mode) => {
    html.setAttribute("data-theme-mode", mode);
    if (mode === "system") {
      html.setAttribute("data-theme", getSystemTheme());
    } else {
      html.setAttribute("data-theme", mode);
    }
    themeMenu.querySelectorAll(".theme-option").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.theme === mode);
    });
  };

  const savedMode = localStorage.getItem("themeMode") || "system";
  applyTheme(savedMode);

  if (window.matchMedia) {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        const currentMode = html.getAttribute("data-theme-mode");
        if (currentMode === "system") {
          html.setAttribute("data-theme", getSystemTheme());
        }
      });
  }

  themeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    themeSelector?.classList.toggle("open");
  });

  themeMenu.querySelectorAll(".theme-option").forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const mode = option.dataset.theme;
      applyTheme(mode);
      localStorage.setItem("themeMode", mode);
      themeSelector?.classList.remove("open");
    });
  });

  document.addEventListener("click", () => {
    themeSelector?.classList.remove("open");
  });
};
