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
    docTitleLeft.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim() || "刑案照片黏貼表";
      state.customDocTitles.left = newTitle;
    });
  }

  if (docTitleMiddle) {
    docTitleMiddle.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim() || "非道路交通事故照片黏貼紀錄表";
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

  elements.generateButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedImages.length > 0) {
      downloadMenu.classList.toggle("show");
    } else {
      showToast("尚未新增照片可建立文件😵", "error");
    }
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

    document.getElementById("zippingModal").style.display = "block";

    setTimeout(async () => {
      try {
        const zip = new JSZip();
        const prefixInput = document.getElementById("zipPrefix");
        const prefix = prefixInput ? prefixInput.value.trim() : "";
        for (let i = 0; i < state.selectedImages.length; i++) {
          const img = state.selectedImages[i];
          const ext = img.name.split(".").pop();
          const newName = `${prefix}照片黏貼表-編號${i + 1}.${ext}`;
          zip.file(newName, img.blob);
        }
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        const downloadUrl = createObjectUrl(content);
        a.href = downloadUrl;
        a.download = `${prefix}照片打包下載.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      } finally {
        document.getElementById("zippingModal").style.display = "none";
      }
    }, 0);
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
    console.error("Uncaught error:", event.error);
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
      dateInput.disabled = true;
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

const setupBeforeUnload = () => {
  window.onbeforeunload = function (e) {
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
  document.getElementById("fabAddPhoto").addEventListener("click", function () {
    document.getElementById("imageInput").click();
  });

  initEmptyState();

  init();
  setupEventListeners();
  setupPhotoSizeSlider();
  setupSidebarInputs();
  setupDateModeSwitch();
  setupBeforeUnload();
  setupResizeWarning();
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
