// imageHandler.js - 圖片處理模組

import { state, ACCIDENT_TAG_OPTIONS } from "./state.js";
import {
  createThumbnail,
  formatExifDate,
  showUploadingModal,
  hideUploadingModal,
  showConversionModal,
  hideConversionModal,
  EMPTY_STATE_HTML,
  createObjectUrl,
  revokeObjectUrl,
} from "./utils.js";

const getImageDimensions = (sourceUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = sourceUrl;
  });
};

const normalizeFileNameForCompare = (fileName) =>
  String(fileName || "")
    .trim()
    .toLowerCase();

const createDuplicateSignature = ({ name, size, width = "", height = "" }) =>
  [
    normalizeFileNameForCompare(name),
    Number.isFinite(size) ? size : "",
    Number.isFinite(width) ? width : "",
    Number.isFinite(height) ? height : "",
  ].join("|");

const buildImageRecord = async (
  blob,
  fileName,
  date = "",
  sourceFile = null,
) => {
  const sourceUrl = createObjectUrl(blob);

  try {
    const { width, height } = await getImageDimensions(sourceUrl);
    const thumbnailUrl = await createThumbnail(sourceUrl);
    const duplicateSignature = createDuplicateSignature({
      name: sourceFile?.name || fileName,
      size: sourceFile?.size ?? blob.size,
      width,
      height,
    });

    return {
      id: Date.now() + Math.random(),
      blob,
      previewUrl: thumbnailUrl,
      name: fileName,
      size: blob.size,
      width,
      height,
      date,
      duplicateSignature,
    };
  } finally {
    revokeObjectUrl(sourceUrl);
  }
};

const isHeicFile = (file) => {
  const fileName = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif")
  );
};

const isSupportedImageFile = (file) => {
  const fileName = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    isHeicFile(file) ||
    /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(fileName)
  );
};

const getJpegName = (fileName) => fileName.replace(/\.(heic|heif)$/i, ".jpg");

const extractHeicExifDate = async (file) => {
  try {
    const exifData = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    const dateValue =
      exifData?.DateTimeOriginal ||
      exifData?.CreateDate ||
      exifData?.ModifyDate;

    return dateValue ? formatExifDate(dateValue) : null;
  } catch (error) {
    console.warn("HEIC EXIF 日期讀取失敗，繼續轉換:", file.name, error);
    return null;
  }
};

const normalizeConvertedBlob = (result) => {
  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob)) {
    throw new Error("HEIC 轉換結果不是有效圖片");
  }

  return blob.type ? blob : new Blob([blob], { type: "image/jpeg" });
};

const convertHeicWithHeic2any = async (file) => {
  if (typeof heic2any !== "function") {
    throw new Error("HEIC 轉換程式尚未載入");
  }

  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.88,
  });

  return normalizeConvertedBlob(result);
};

const convertNativelyDecodedImageToJpeg = async (file) => {
  const sourceUrl = createObjectUrl(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("瀏覽器無法直接讀取此 HEIC"));
      image.src = sourceUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    if (!canvas.width || !canvas.height) {
      throw new Error("HEIC 圖片尺寸無效");
    }

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("HEIC 原生轉 JPEG 失敗")),
        "image/jpeg",
        0.9,
      );
    });
  } finally {
    revokeObjectUrl(sourceUrl);
  }
};

const convertHeicToJpeg = async (file) => {
  try {
    return await convertHeicWithHeic2any(file);
  } catch (heic2anyError) {
    console.warn(
      "heic2any 轉換失敗，嘗試瀏覽器原生解碼:",
      file.name,
      heic2anyError,
    );
    return await convertNativelyDecodedImageToJpeg(file);
  }
};

const processSingleFile = async (file) => {
  if (!isHeicFile(file)) {
    return await buildImageRecordWithExif(file, file.name);
  }

  const heicExifDate = await extractHeicExifDate(file);
  const convertedBlob = await convertHeicToJpeg(file);

  return await buildImageRecord(
    convertedBlob,
    getJpegName(file.name),
    heicExifDate || "",
    file,
  );
};

const buildImageRecordWithExif = async (blob, fileName) => {
  const tempUrl = createObjectUrl(blob);

  try {
    const img = new Image();

    return await new Promise((resolve, reject) => {
      img.onload = async () => {
        EXIF.getData(img, async function () {
          try {
            const exifDate = EXIF.getTag(this, "DateTimeOriginal");
            const formattedDate = formatExifDate(exifDate);
            resolve(
              await buildImageRecord(blob, fileName, formattedDate, blob),
            );
          } catch (error) {
            reject(error);
          } finally {
            revokeObjectUrl(tempUrl);
          }
        });
      };

      img.onerror = (error) => {
        revokeObjectUrl(tempUrl);
        reject(error);
      };

      img.src = tempUrl;
    });
  } catch (error) {
    revokeObjectUrl(tempUrl);
    throw error;
  }
};

/**
 * 處理圖片選擇事件
 */
export const handleImageSelection = (event) => {
  const files = Array.from(event.target.files);
  showUploadingModal();
  processFiles(files);
  event.target.value = "";
};

/**
 * 處理檔案陣列
 */
export const processFiles = async (files) => {
  console.log("Processing files:", files.length);
  const imageDataArray = [];
  const failedFiles = [];
  const unsupportedFiles = [];
  const supportedFiles = files.filter((file) => {
    if (isSupportedImageFile(file)) return true;
    unsupportedFiles.push(file.name || "未命名檔案");
    return false;
  });

  try {
    if (supportedFiles.some(isHeicFile)) {
      showConversionModal();
    }

    for (const file of supportedFiles) {
      try {
        imageDataArray.push(await processSingleFile(file));
      } catch (error) {
        console.error("Image processing failed:", file.name, error);
        failedFiles.push(file.name);
      }
    }

    console.log("Image data processed:", imageDataArray.length);
    imageDataArray.forEach(handleImageAddition);

    if (failedFiles.length) {
      alert(
        [
          `有 ${failedFiles.length} 個檔案無法處理：`,
          failedFiles.join("\n"),
          "",
          "部分 HEIC/HEIF 可能使用瀏覽器端轉換器不支援的編碼。請先用手機或電腦相簿匯出為 JPEG 後再匯入。",
        ].join("\n"),
      );
    }

    if (unsupportedFiles.length) {
      alert(
        [
          `已略過 ${unsupportedFiles.length} 個非圖片檔案：`,
          unsupportedFiles.join("\n"),
          "",
          "目前僅支援照片圖片檔，影片不會匯入。",
        ].join("\n"),
      );
    }
  } finally {
    hideConversionModal();
    hideUploadingModal();
  }
};

/**
 * 處理圖片新增
 */
const handleImageAddition = (imageData) => {
  const emptyState = document.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }
  if (isDuplicateImage(imageData)) {
    console.log("Duplicate found:", imageData.name);
    if (confirm(`檔案 "${imageData.name}" 已經存在。是否重複新增？`)) {
      addImageToCollection(imageData);
    } else {
      revokeObjectUrl(imageData.previewUrl);
      console.log("User chose not to add duplicate image");
    }
  } else {
    addImageToCollection(imageData);
  }
};

/**
 * 檢查是否為重複圖片
 */
const isDuplicateImage = (newImage) => {
  if (newImage.duplicateSignature) {
    return state.selectedImages.some(
      (img) => img.duplicateSignature === newImage.duplicateSignature,
    );
  }

  return state.selectedImages.some(
    (img) =>
      img.name === newImage.name &&
      img.size === newImage.size &&
      img.width === newImage.width &&
      img.height === newImage.height,
  );
};

/**
 * 將圖片加入收藏
 */
const addImageToCollection = (imageData) => {
  state.selectedImages.push(imageData);
  addImageToPreview(imageData, state.selectedImages.length);
  updateCreateButtonState();
  console.log("Image added to collection:", imageData.name);
  console.log("Total images in collection:", state.selectedImages.length);
};

/**
 * 將圖片加入預覽區
 */
const addImageToPreview = (imageData, counter) => {
  const preview = document.getElementById("imagePreview");
  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";
  imageContainer.dataset.id = imageData.id;
  imageContainer.draggable = true;

  const counterElement = document.createElement("div");
  counterElement.className = "image-counter";
  counterElement.textContent = counter;
  imageContainer.appendChild(counterElement);

  const img = document.createElement("img");
  img.src = imageData.previewUrl;
  img.alt = imageData.name;
  img.title = imageData.name;
  imageContainer.appendChild(img);

  const slider = document.getElementById("photoSizeSlider");
  if (slider) {
    img.style.maxWidth = slider.value + "px";
    img.style.maxHeight = slider.value + "px";
  }

  const descriptionDiv = document.createElement("div");
  descriptionDiv.className = "image-description";

  const dateInput = document.createElement("input");
  dateInput.type = "text";
  dateInput.className = "image-date-input";
  dateInput.placeholder = "日期 (留空則使用側邊欄資訊)";
  dateInput.value = state.imageDates[imageData.id] || "";
  dateInput.addEventListener("input", (e) => {
    state.imageDates[imageData.id] = e.target.value;
  });
  dateInput.addEventListener("dragover", (e) => e.preventDefault());
  dateInput.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  descriptionDiv.appendChild(dateInput);

  const addressInput = document.createElement("input");
  addressInput.type = "text";
  addressInput.className = "image-address-input";
  addressInput.placeholder = "地址 (留空則使用側邊欄資訊)";
  addressInput.value = state.imageAddresses[imageData.id] || "";
  addressInput.addEventListener("input", (e) => {
    state.imageAddresses[imageData.id] = e.target.value;
  });
  addressInput.addEventListener("dragover", (e) => e.preventDefault());
  addressInput.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  descriptionDiv.appendChild(addressInput);

  const textarea = document.createElement("textarea");
  textarea.className = "image-description-textarea";
  textarea.placeholder = "說明 (選填)";
  textarea.value = state.imageDescriptions[imageData.id] || "";
  textarea.addEventListener("input", (e) => {
    state.imageDescriptions[imageData.id] = e.target.value;
  });
  textarea.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  textarea.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  descriptionDiv.appendChild(textarea);

  const accidentTagsContainer = document.createElement("div");
  accidentTagsContainer.className = "accident-tags-container";
  accidentTagsContainer.dataset.format = "middle";

  if (!state.imageAccidentTags[imageData.id]) {
    state.imageAccidentTags[imageData.id] = {};
  }

  ACCIDENT_TAG_OPTIONS.forEach((option) => {
    const tagLabel = document.createElement("label");
    tagLabel.className = "accident-tag-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "accident-tag-checkbox";
    checkbox.checked =
      state.imageAccidentTags[imageData.id][option.id] || false;

    tagLabel.appendChild(checkbox);

    const labelText = document.createElement("span");
    labelText.textContent = option.label;
    tagLabel.appendChild(labelText);

    if (option.id === "other") {
      const otherInput = document.createElement("input");
      otherInput.type = "text";
      otherInput.className = "accident-tag-other-input";
      otherInput.placeholder = "________________";
      otherInput.value = state.imageAccidentTags[imageData.id].otherText || "";
      otherInput.disabled = !checkbox.checked;
      otherInput.addEventListener("input", (e) => {
        state.imageAccidentTags[imageData.id].otherText = e.target.value;
      });
      otherInput.addEventListener("dragover", (e) => e.preventDefault());
      otherInput.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      tagLabel.appendChild(otherInput);

      checkbox.addEventListener("change", (e) => {
        state.imageAccidentTags[imageData.id][option.id] = e.target.checked;
        otherInput.disabled = !e.target.checked;
        if (e.target.checked) {
          otherInput.focus();
        }
      });
    } else {
      checkbox.addEventListener("change", (e) => {
        state.imageAccidentTags[imageData.id][option.id] = e.target.checked;
      });
    }

    accidentTagsContainer.appendChild(tagLabel);
  });

  descriptionDiv.appendChild(accidentTagsContainer);
  imageContainer.appendChild(descriptionDiv);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.textContent = "×";
  deleteButton.onclick = () => removeImage(imageData.id);
  imageContainer.appendChild(deleteButton);

  preview.appendChild(imageContainer);
  console.log("Image preview added:", imageData.name);
};

export const handleViewModeChange = (mode) => {
  state.viewMode = mode;
  const preview = document.getElementById("imagePreview");
  const gridViewBtn = document.getElementById("gridViewBtn");
  const listViewBtn = document.getElementById("listViewBtn");

  if (mode === "list") {
    preview.classList.add("list-view");
    gridViewBtn.classList.remove("active");
    listViewBtn.classList.add("active");
  } else {
    preview.classList.remove("list-view");
    gridViewBtn.classList.add("active");
    listViewBtn.classList.remove("active");
    const slider = document.getElementById("photoSizeSlider");
    if (slider) {
      const imgs = preview.querySelectorAll(".image-container img");
      imgs.forEach((img) => {
        img.style.maxWidth = slider.value + "px";
        img.style.maxHeight = slider.value + "px";
      });
    }
  }
  console.log("View mode changed to:", state.viewMode);
};

export const handleImageContainerEvents = (e) => {
  if (!e.target || !(e.target instanceof Element)) {
    return;
  }
  if (e.target.tagName === "TEXTAREA") return;

  const container = e.target.closest(".image-container");
  if (!container) return;

  if (container.classList.contains("editing")) {
    e.preventDefault();
    return;
  }

  if (!e.dataTransfer) return;

  switch (e.type) {
    case "dragstart":
      if (state.editingImageId) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", container.dataset.id);
      container.style.opacity = "0.5";
      break;
    case "dragover":
    case "dragenter":
      e.preventDefault();
      container.classList.add("drag-over");
      break;
    case "dragleave":
    case "drop":
      container.classList.remove("drag-over");
      if (e.type === "drop") {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text");
        handleImageDrop(draggedId, container);
      }
      break;
    case "dragend":
      container.style.opacity = "";
      break;
  }
};

const handleImageDrop = (draggedId, dropZone) => {
  const draggedElement = document.querySelector(
    `.image-container[data-id="${draggedId}"]`,
  );
  if (draggedElement && dropZone && draggedElement !== dropZone) {
    const preview = document.getElementById("imagePreview");
    const allContainers = Array.from(
      preview.querySelectorAll(".image-container"),
    );
    const draggedIndex = allContainers.indexOf(draggedElement);
    const dropIndex = allContainers.indexOf(dropZone);

    const [movedImage] = state.selectedImages.splice(draggedIndex, 1);
    state.selectedImages.splice(dropIndex, 0, movedImage);

    if (draggedIndex < dropIndex) {
      dropZone.parentNode.insertBefore(draggedElement, dropZone.nextSibling);
    } else {
      dropZone.parentNode.insertBefore(draggedElement, dropZone);
    }

    updateImageOrder();
  }
};

const updateImageOrder = () => {
  const preview = document.getElementById("imagePreview");
  const containers = Array.from(preview.querySelectorAll(".image-container"));

  containers.forEach((container, index) => {
    const counter = container.querySelector(".image-counter");
    if (counter) {
      counter.textContent = index + 1;
    }
  });

  state.imageCounter = containers.length;

  console.log(
    "Image order updated. New order:",
    state.selectedImages.map((img) => img.name),
  );
  console.log("Total images after reorder:", state.selectedImages.length);

  updateCreateButtonState();
};

const updateEditToolsState = (enabled) => {
  const rotateLeftBtn = document.getElementById("rotateLeftBtn");
  const rotateRightBtn = document.getElementById("rotateRightBtn");

  if (rotateLeftBtn) rotateLeftBtn.disabled = !enabled;
  if (rotateRightBtn) rotateRightBtn.disabled = !enabled;
};

const showDeleteConfirmDialog = (id, imageName) => {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "delete-confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "delete-confirm-dialog";

    dialog.innerHTML = `
      <div class="delete-confirm-icon">
        <span class="material-symbols-outlined">warning</span>
      </div>
      <div class="delete-confirm-title">確認刪除</div>
      <div class="delete-confirm-message">確定要刪除這張照片嗎？</div>
      <div class="delete-confirm-buttons">
        <button type="button" class="delete-confirm-btn cancel">取消</button>
        <button type="button" class="delete-confirm-btn confirm">刪除</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add("show");
    });

    const closeDialog = (result) => {
      overlay.classList.remove("show");
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };

    dialog
      .querySelector(".cancel")
      .addEventListener("click", () => closeDialog(false));
    dialog
      .querySelector(".confirm")
      .addEventListener("click", () => closeDialog(true));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDialog(false);
    });

    const handleKeydown = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", handleKeydown);
        closeDialog(false);
      }
    };
    document.addEventListener("keydown", handleKeydown);
  });
};

export const removeImage = async (id) => {
  console.log("Removing image with id:", id);

  const imageData = state.selectedImages.find((img) => img.id === id);
  const imageName = imageData ? imageData.name : "";

  const confirmed = await showDeleteConfirmDialog(id, imageName);
  if (!confirmed) {
    console.log("Delete cancelled by user");
    return;
  }

  if (state.editingImageId === id) {
    state.editingImageId = null;
    updateEditToolsState(false);
  }

  state.selectedImages = state.selectedImages.filter((img) => img.id !== id);
  delete state.imageDescriptions[id];
  delete state.imageDates[id];
  delete state.imageAddresses[id];
  delete state.imageAccidentTags[id];
  delete state.imageRotations[id];

  if (imageData?.previewUrl) {
    revokeObjectUrl(imageData.previewUrl);
  }

  const imageElement = document.querySelector(
    `.image-container[data-id="${id}"]`,
  );
  if (imageElement) {
    imageElement.remove();
  }

  updateImageCounters();
  updateCreateButtonState();
  console.log("Image removed. Remaining images:", state.selectedImages.length);

  if (state.selectedImages.length === 0) {
    showEmptyState();
  }
};

const showEmptyState = () => {
  const imagePreview = document.getElementById("imagePreview");
  const emptyStateDiv = document.createElement("div");
  emptyStateDiv.className = "empty-state";
  emptyStateDiv.innerHTML = EMPTY_STATE_HTML;
  imagePreview.appendChild(emptyStateDiv);
  console.log("No images left, displaying empty state.");
};

const updateImageCounters = () => {
  const containers = document.querySelectorAll(".image-container");
  containers.forEach((container, index) => {
    const counter = container.querySelector(".image-counter");
    if (counter) {
      counter.textContent = index + 1;
    }
  });
  state.imageCounter = containers.length;
  console.log("Image counters updated. New count:", state.imageCounter);
};

export const updateCreateButtonState = () => {
  const createButton = document.getElementById("generate");
  if (!createButton) {
    console.error("Create button not found");
    return;
  }
  const isEnabled = state.selectedImages.length > 0;

  createButton.classList.toggle("create-btn-disabled", !isEnabled);
  createButton.classList.toggle("create-btn-enabled", isEnabled);

  console.log("Create button state updated. Enabled:", isEnabled);
  console.log("Selected images count:", state.selectedImages.length);
};

export const setEditingImage = (imageId) => {
  const previousEditing = document.querySelector(".image-container.editing");
  if (previousEditing) {
    previousEditing.classList.remove("editing");
    previousEditing.draggable = true;
  }

  if (imageId) {
    state.editingImageId = imageId;
    const container = document.querySelector(
      `.image-container[data-id="${imageId}"]`,
    );
    if (container) {
      container.classList.add("editing");
      container.draggable = false;
    }
    updateEditToolsState(true);
  } else {
    state.editingImageId = null;
    updateEditToolsState(false);
  }
};

export const cancelEditing = () => {
  setEditingImage(null);
};

export const rotateImage = async (degrees) => {
  if (!state.editingImageId) return;

  const imageData = state.selectedImages.find(
    (img) => img.id === state.editingImageId,
  );
  if (!imageData) return;

  const currentRotation = state.imageRotations[state.editingImageId] || 0;
  const newRotation = (currentRotation + degrees + 360) % 360;
  state.imageRotations[state.editingImageId] = newRotation;

  const rotatedData = await rotateImageData(imageData.blob, degrees);

  imageData.blob = rotatedData.blob;
  imageData.width = rotatedData.width;
  imageData.height = rotatedData.height;

  if (imageData.previewUrl) {
    revokeObjectUrl(imageData.previewUrl);
  }
  imageData.previewUrl = rotatedData.previewUrl;

  const container = document.querySelector(
    `.image-container[data-id="${state.editingImageId}"]`,
  );
  if (container) {
    const img = container.querySelector("img");
    if (img) {
      img.src = rotatedData.previewUrl;
      const slider = document.getElementById("photoSizeSlider");
      if (slider) {
        img.style.maxWidth = slider.value + "px";
        img.style.maxHeight = slider.value + "px";
      }
    }
  }

  console.log(
    `Image rotated by ${degrees} degrees. New rotation: ${newRotation}`,
  );
};

const rotateImageData = async (blob, degrees) => {
  const objectUrl = createObjectUrl(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (Math.abs(degrees) === 90 || Math.abs(degrees) === 270) {
      canvas.width = img.height;
      canvas.height = img.width;
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
    }

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    const rotatedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("圖片旋轉失敗")),
        "image/jpeg",
        0.9,
      );
    });

    const previewUrl = await createThumbnail(rotatedBlob, 800, 800, 0.8);

    return {
      blob: rotatedBlob,
      previewUrl,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    revokeObjectUrl(objectUrl);
  }
};

export const handleImageClick = (e) => {
  if (
    e.target.tagName === "BUTTON" ||
    e.target.tagName === "INPUT" ||
    e.target.tagName === "TEXTAREA" ||
    e.target.closest(".delete-button") ||
    e.target.closest(".accident-tag-label")
  ) {
    return;
  }

  const container = e.target.closest(".image-container");
  if (!container) return;

  const imageId = parseFloat(container.dataset.id);

  if (state.editingImageId === imageId) {
    cancelEditing();
  } else {
    setEditingImage(imageId);
  }
};
