// main.js - 主入口模組

import { state } from "./state.js";
import {
  handleImageSelection,
  handleViewModeChange,
  handleImageContainerEvents,
  updateCreateButtonState,
  handleImageClick,
  rotateImage,
  cancelEditing,
} from "./imageHandler.js";
import { handleGenerateWrapper } from "./docxGenerator.js";
import { handleGeneratePDF } from "./pdfGenerator.js";
import { EMPTY_STATE_HTML, showToast } from "./utils.js";

/**
 * 初始化空狀態提示
 */
const initEmptyState = () => {
  const imagePreview = document.getElementById("imagePreview");
  if (imagePreview && state.selectedImages.length === 0) {
    const emptyStateDiv = document.createElement("div");
    emptyStateDiv.className = "empty-state";
    emptyStateDiv.innerHTML = EMPTY_STATE_HTML;
    imagePreview.appendChild(emptyStateDiv);
  }
};

/**
 * 更新 toggle switch 狀態
 */
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

  // 更新 body 的格式 class，用於控制勾選框顯示
  document.body.classList.remove(
    "format-left",
    "format-middle",
    "format-right",
  );
  document.body.classList.add(`format-${value}`);

  // 更新側邊欄欄位顯示
  updateSidebarFields(value);
};

/**
 * 根據選擇的格式更新側邊欄欄位顯示
 */
const updateSidebarFields = (format) => {
  // 獲取所有帶有 data-format 屬性的欄位
  const allFields = document.querySelectorAll(".sidebar [data-format]");

  allFields.forEach((field) => {
    const formats = field.getAttribute("data-format").split(" ");
    if (formats.includes(format)) {
      field.style.display = "";
    } else {
      field.style.display = "none";
    }
  });

  // 更新標籤文字為攝影相關
  const dateLabelText = document.getElementById("dateLabelText");
  const addressLabelText = document.getElementById("addressLabelText");
  const personLabelText = document.getElementById("personLabelText");

  if (dateLabelText) dateLabelText.textContent = "攝影日期";
  if (addressLabelText) addressLabelText.textContent = "攝影地址";
  if (personLabelText) personLabelText.textContent = "攝影人員";
};

/**
 * 初始化文件內容標題輸入框
 */
const initDocumentTitles = () => {
  const docTitleLeft = document.getElementById("docTitleLeft");
  const docTitleMiddle = document.getElementById("docTitleMiddle");

  // 監聽左側標題變化
  if (docTitleLeft) {
    docTitleLeft.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim() || "刑案照片黏貼表";
      state.customDocTitles.left = newTitle;
    });
  }

  // 監聽右側標題變化
  if (docTitleMiddle) {
    docTitleMiddle.addEventListener("input", (e) => {
      const newTitle = e.target.value.trim() || "非道路交通事故照片黏貼紀錄表";
      state.customDocTitles.middle = newTitle;
    });
  }
};

/**
 * 主要初始化函數
 */
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

  // 初始化文件內容標題
  initDocumentTitles();

  elements.imageInput.addEventListener("change", handleImageSelection);

  // 下載按鈕下拉選單功能
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

  downloadZip.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMenu.classList.remove("show");
    // Trigger zip download
    if (!state.selectedImages.length) {
      showToast(
        "打包照片的紙箱準備好了…但沒有看到照片，只看到小貓在裡面睡了一整個下午💤",
        "error",
      );
      return;
    }

    // 顯示「照片打包中」modal
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
          const data = img.data.split(",")[1];
          zip.file(newName, data, { base64: true });
        }
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${prefix}照片打包下載.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        document.getElementById("zippingModal").style.display = "none";
      }
    }, 0);
  });

  // 點擊其他地方關閉選單
  document.addEventListener("click", () => {
    downloadMenu.classList.remove("show");
  });

  // Toggle switch 事件監聽
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

  // List/Grid View Switch 事件監聽
  const gridViewBtn = document.getElementById("gridViewBtn");
  const listViewBtn = document.getElementById("listViewBtn");
  if (gridViewBtn && listViewBtn) {
    gridViewBtn.addEventListener("click", () => handleViewModeChange("grid"));
    listViewBtn.addEventListener("click", () => handleViewModeChange("list"));
  }

  console.log("圖片管理腳本初始化完成");
};

/**
 * 設置圖片預覽區拖曳事件
 */
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

  // 圖片點擊事件（進入編輯模式）
  imagePreview.addEventListener("click", handleImageClick);

  // 全局錯誤處理
  window.addEventListener("error", (event) => {
    console.error("Uncaught error:", event.error);
    alert(
      "發生了意外錯誤。請重新加載頁面並重試。如果問題持續存在，請不要聯繫支持團隊。",
    );
  });
};

/**
 * 設置編輯工具按鈕
 */
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

/**
 * 設置照片大小滑桿
 */
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

  // - 按鈕：縮小
  sizeDecBtn.addEventListener("click", () => {
    const newValue = Math.max(
      parseInt(slider.min),
      parseInt(slider.value) - 40,
    );
    slider.value = newValue;
    updateImageSizes();
  });

  // + 按鈕：放大
  sizeIncBtn.addEventListener("click", () => {
    const newValue = Math.min(
      parseInt(slider.max),
      parseInt(slider.value) + 40,
    );
    slider.value = newValue;
    updateImageSizes();
  });
};

/**
 * 阻止 sidebar 輸入欄位的拖放事件
 */
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

/**
 * 設置日期模式切換
 */
const setupDateModeSwitch = () => {
  const dateSwitch = document.getElementById("dateModeSwitch");
  const dateInput = document.getElementById("caseDate");
  const dateModeLabel = document.getElementById("dateModeLabel");

  function setDateInputMode() {
    if (dateSwitch.checked) {
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

/**
 * 設置離開網頁提醒
 */
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

/**
 * 設置視窗大小警告
 */
const setupResizeWarning = () => {
  const resizeWarningModal = document.getElementById("resize-warning");

  if (!resizeWarningModal) {
    console.error("Resize warning modal not found!");
    return;
  }

  const checkWindowSize = () => {
    if (window.innerWidth < 1100 || window.innerHeight < 700) {
      resizeWarningModal.style.display = "flex";
    } else {
      resizeWarningModal.style.display = "none";
    }
  };

  window.addEventListener("resize", checkWindowSize);
  checkWindowSize(); // Initial check
};

/**
 * 設置手機版 Sidebar 可展開/收合
 */
const setupMobileSidebar = () => {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  let touchStartY = 0;
  let touchEndY = 0;

  // 點擊切換展開狀態
  sidebar.addEventListener("click", (e) => {
    // 只在收合狀態時，點擊頂部區域才展開
    if (!sidebar.classList.contains("expanded")) {
      const rect = sidebar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      // 點擊頂部 50px 區域才展開
      if (clickY < 50) {
        sidebar.classList.add("expanded");
      }
    }
  });

  // 處理 input 聚焦時展開 sidebar
  const inputs = sidebar.querySelectorAll("input");
  inputs.forEach((input) => {
    input.addEventListener("focus", () => {
      sidebar.classList.add("expanded");
    });
  });

  // 觸控滑動手勢
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
    const threshold = 50; // 最小滑動距離

    if (swipeDistance > threshold) {
      // 向上滑動，展開
      sidebar.classList.add("expanded");
    } else if (swipeDistance < -threshold) {
      // 向下滑動，收合
      sidebar.classList.remove("expanded");
    }
  };

  // 點擊 sidebar 外部時收合
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

  // 視窗大小改變時重置狀態
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebar.classList.remove("expanded");
    }
  });
};

// ============ DOM 載入後初始化 ============

document.addEventListener("DOMContentLoaded", () => {
  // FAB 按鈕點擊
  document.getElementById("fabAddPhoto").addEventListener("click", function () {
    document.getElementById("imageInput").click();
  });

  // 初始化空狀態提示
  initEmptyState();

  // 主要初始化
  init();
  setupEventListeners();
  setupPhotoSizeSlider();
  setupSidebarInputs();
  setupDateModeSwitch();
  setupBeforeUnload();
  setupResizeWarning();
  setupMobileSidebar(); // 手機版 Sidebar 功能
  setupEditTools(); // 編輯工具按鈕
  setupThemeToggle(); // 主題切換按鈕
});

/**
 * 設置主題切換功能
 */
const setupThemeToggle = () => {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeMenu = document.getElementById("themeMenu");
  const themeSelector = themeToggleBtn?.closest(".theme-selector");

  if (!themeToggleBtn || !themeMenu) return;

  const html = document.documentElement;

  // 主題標籤對應
  const themeLabels = {
    light: "淺色模式",
    dark: "深色模式",
    system: "依系統設置",
  };

  // 根據系統偏好取得實際主題
  const getSystemTheme = () => {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  // 套用主題
  const applyTheme = (mode) => {
    html.setAttribute("data-theme-mode", mode);
    // 設定實際的主題色
    if (mode === "system") {
      html.setAttribute("data-theme", getSystemTheme());
    } else {
      html.setAttribute("data-theme", mode);
    }
    // 更新選項的 active 狀態
    themeMenu.querySelectorAll(".theme-option").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.theme === mode);
    });
  };

  // 初始化：檢查 localStorage，預設為 system
  const savedMode = localStorage.getItem("themeMode") || "system";
  applyTheme(savedMode);

  // 監聽系統主題變化
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

  // 點擊切換按鈕展開/收起選單
  themeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    themeSelector?.classList.toggle("open");
  });

  // 點擊選項
  themeMenu.querySelectorAll(".theme-option").forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const mode = option.dataset.theme;
      applyTheme(mode);
      localStorage.setItem("themeMode", mode);
      themeSelector?.classList.remove("open");
    });
  });

  // 點擊外部關閉選單
  document.addEventListener("click", () => {
    themeSelector?.classList.remove("open");
  });
};
