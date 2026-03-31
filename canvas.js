function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export class TradeCanvas {
  constructor(hostEl, options = {}) {
    this.hostEl = hostEl;
    this.options = options;
    this.tool = "select";
    this.items = [];
    this.selectedId = null;
    this.dragState = null;
    this.shapeState = null;
    this.boardWidth = 2000;
    this.boardHeight = 1200;
    this.zoom = 1;

    this.stageEl = document.createElement("div");
    this.stageEl.className = "canvas-stage";

    this.contentEl = document.createElement("div");
    this.contentEl.className = "canvas-content";

    this.itemsEl = document.createElement("div");
    this.itemsEl.className = "canvas-items";

    this.svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgEl.classList.add("canvas-svg");
    this.svgEl.setAttribute("width", "100%");
    this.svgEl.setAttribute("height", "100%");

    this.hostEl.innerHTML = "";
    this.contentEl.append(this.itemsEl, this.svgEl);
    this.stageEl.append(this.contentEl);
    this.hostEl.appendChild(this.stageEl);
    this.applyBoardSize();

    this.bindEvents();
  }

  bindEvents() {
    this.stageEl.addEventListener("dragover", (event) => {
      event.preventDefault();
    });

    this.stageEl.addEventListener("drop", async (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])];
      await this.handleImageFiles(files, event.clientX, event.clientY);
    });

    this.stageEl.addEventListener("paste", async (event) => {
      const files = [...(event.clipboardData?.files || [])];
      if (files.length === 0) return;
      event.preventDefault();
      await this.handleImageFiles(files, null, null);
    });

    this.stageEl.addEventListener("click", (event) => {
      if (this.tool !== "text") return;
      if (event.target !== this.stageEl && event.target !== this.itemsEl && event.target !== this.svgEl) return;
      const text = window.prompt("Text note:");
      if (!text) return;
      const { x, y } = this.toLocalCoords(event.clientX, event.clientY);
      this.addTextItem({
        id: uid("txt"),
        type: "text",
        text,
        x,
        y
      });
      this.emitChange();
    });

    this.stageEl.addEventListener("pointerdown", (event) => {
      const target = event.target.closest?.(".canvas-item");
      if (target && this.tool === "select") {
        const id = target.dataset.id;
        const item = this.items.find((entry) => entry.id === id);
        if (!item) return;
        this.selectedId = id;
        const { x, y } = this.toLocalCoords(event.clientX, event.clientY);
        this.dragState = {
          item,
          offsetX: x - item.x,
          offsetY: y - item.y
        };
        this.renderItems();
        target.setPointerCapture(event.pointerId);
        return;
      }

      if (this.tool === "select") {
        this.selectedId = null;
        this.renderItems();
      }

      if (this.tool === "arrow" || this.tool === "rect") {
        const { x, y } = this.toLocalCoords(event.clientX, event.clientY);
        this.shapeState = {
          id: uid("shape"),
          type: this.tool,
          x1: x,
          y1: y,
          x2: x,
          y2: y
        };
        this.drawTempShape(this.shapeState);
      }
    });

    this.stageEl.addEventListener("pointermove", (event) => {
      if (this.dragState) {
        const { x, y } = this.toLocalCoords(event.clientX, event.clientY);
        this.dragState.item.x = x - this.dragState.offsetX;
        this.dragState.item.y = y - this.dragState.offsetY;
        this.renderItems();
        return;
      }

      if (this.shapeState) {
        const { x, y } = this.toLocalCoords(event.clientX, event.clientY);
        this.shapeState.x2 = x;
        this.shapeState.y2 = y;
        this.drawTempShape(this.shapeState);
      }
    });

    this.stageEl.addEventListener("pointerup", () => {
      if (this.dragState) {
        this.dragState = null;
        this.emitChange();
      }

      if (this.shapeState) {
        this.items.push({ ...this.shapeState });
        this.shapeState = null;
        this.renderShapes();
        this.emitChange();
      }
    });

    this.stageEl.addEventListener("dblclick", (event) => {
      if (this.tool !== "select") return;
      const target = event.target.closest?.(".canvas-item");
      if (!target) return;
      const id = target.dataset.id;
      const item = this.items.find((entry) => entry.id === id);
      if (!item || item.type !== "text") return;

      const nextText = window.prompt("Edit text:", item.text || "");
      if (nextText === null) return;
      item.text = nextText;
      this.selectedId = item.id;
      this.renderItems();
      this.emitChange();
    });
  }

  async handleImageFiles(files, clientX, clientY) {
    const imageFiles = files.filter((file) => /image\/(png|jpeg|jpg)/i.test(file.type));
    if (imageFiles.length === 0) return;

    let startX = 20;
    let startY = 20;
    if (typeof clientX === "number" && typeof clientY === "number") {
      const local = this.toLocalCoords(clientX, clientY);
      startX = local.x;
      startY = local.y;
    }

    for (const file of imageFiles) {
      const imported = this.options.onImageImport ? await this.options.onImageImport(file) : null;
      if (!imported) continue;
      this.addImageItem({
        id: uid("img"),
        type: "image",
        path: imported.path,
        url: imported.url,
        width: imported.width,
        height: imported.height,
        x: startX,
        y: startY
      });
      startX += 30;
      startY += 30;
    }
    this.emitChange();
  }

  toLocalCoords(clientX, clientY) {
    const rect = this.stageEl.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left + this.stageEl.scrollLeft) / this.zoom, 0, 100000),
      y: clamp((clientY - rect.top + this.stageEl.scrollTop) / this.zoom, 0, 100000)
    };
  }

  setTool(tool) {
    this.tool = tool;
  }

  addImageItem(item) {
    this.items.push(item);
    this.renderItems();
  }

  addTextItem(item) {
    this.items.push(item);
    this.renderItems();
  }

  renderItems() {
    this.itemsEl.innerHTML = "";
    this.applyBoardSize();
    const basicItems = this.items.filter((item) => item.type === "image" || item.type === "text");
    for (const item of basicItems) {
      const el = document.createElement("div");
      el.className = "canvas-item";
      if (item.id === this.selectedId) {
        el.classList.add("selected");
      }
      el.dataset.id = item.id;
      el.style.left = `${item.x}px`;
      el.style.top = `${item.y}px`;

      if (item.type === "image") {
        const img = document.createElement("img");
        img.src = item.url || item.path;
        img.loading = "lazy";
        img.width = item.width || undefined;
        img.height = item.height || undefined;
        img.alt = item.path || "screenshot";
        el.appendChild(img);
      } else if (item.type === "text") {
        el.classList.add("canvas-text");
        el.textContent = item.text;
      }

      this.itemsEl.appendChild(el);
    }

    this.renderShapes();
  }

  drawTempShape(shape) {
    this.renderShapes(shape);
  }

  renderShapes(tempShape = null) {
    this.svgEl.innerHTML = "";
    this.applyBoardSize();
    this.ensureDefs();

    const shapeItems = this.items.filter((item) => item.type === "arrow" || item.type === "rect");
    if (tempShape) shapeItems.push(tempShape);

    for (const item of shapeItems) {
      if (item.type === "arrow") {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", item.x1);
        line.setAttribute("y1", item.y1);
        line.setAttribute("x2", item.x2);
        line.setAttribute("y2", item.y2);
        line.setAttribute("class", "shape");
        line.setAttribute("marker-end", "url(#arrowhead)");
        this.svgEl.appendChild(line);
      } else {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", Math.min(item.x1, item.x2));
        rect.setAttribute("y", Math.min(item.y1, item.y2));
        rect.setAttribute("width", Math.abs(item.x2 - item.x1));
        rect.setAttribute("height", Math.abs(item.y2 - item.y1));
        rect.setAttribute("class", "shape");
        this.svgEl.appendChild(rect);
      }
    }
  }

  ensureDefs() {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
    path.setAttribute("fill", "#ff3b30");
    marker.appendChild(path);
    defs.appendChild(marker);
    this.svgEl.appendChild(defs);
  }

  async loadState(rawState, imageResolver) {
    this.items = [];
    this.selectedId = null;
    if (rawState?.board?.width && rawState?.board?.height) {
      this.boardWidth = Math.max(800, Number(rawState.board.width) || 2000);
      this.boardHeight = Math.max(600, Number(rawState.board.height) || 1200);
    }
    if (rawState?.board?.zoom) {
      this.zoom = Math.min(2.5, Math.max(0.4, Number(rawState.board.zoom) || 1));
    }
    const items = Array.isArray(rawState?.items) ? rawState.items : [];

    for (const item of items) {
      if (item.type === "image") {
        const url = imageResolver ? await imageResolver(item.path) : item.path;
        this.items.push({ ...item, url });
      } else {
        this.items.push({ ...item });
      }
    }
    this.renderItems();
  }

  getState() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      board: {
        width: this.boardWidth,
        height: this.boardHeight,
        zoom: this.zoom
      },
      items: this.items.map((item) => {
        const { url, ...persisted } = item;
        return persisted;
      })
    };
  }

  clear() {
    this.items = [];
    this.selectedId = null;
    this.boardWidth = 2000;
    this.boardHeight = 1200;
    this.zoom = 1;
    this.renderItems();
  }

  async deleteSelectedItem() {
    if (!this.selectedId) return false;
    const idx = this.items.findIndex((item) => item.id === this.selectedId);
    if (idx < 0) return false;
    const [removed] = this.items.splice(idx, 1);
    this.selectedId = null;

    if (removed.type === "image" && removed.path && typeof this.options.onDeleteImage === "function") {
      await this.options.onDeleteImage(removed.path);
    }

    this.renderItems();
    this.emitChange();
    return true;
  }

  resizeSelectedImage(scaleFactor) {
    if (!this.selectedId) return false;
    const item = this.items.find((entry) => entry.id === this.selectedId);
    if (!item || item.type !== "image") return false;

    const currentWidth = Number(item.width) || 1;
    const currentHeight = Number(item.height) || 1;
    const nextWidth = Math.max(40, Math.round(currentWidth * scaleFactor));
    const ratio = currentHeight / currentWidth;
    const nextHeight = Math.max(40, Math.round(nextWidth * ratio));

    item.width = nextWidth;
    item.height = nextHeight;
    this.renderItems();
    this.emitChange();
    return true;
  }

  resizeBoard(deltaWidth, deltaHeight) {
    const hostWidth = Math.max(800, this.hostEl.clientWidth || 800);
    const hostHeight = Math.max(600, this.hostEl.clientHeight || 600);
    this.boardWidth = Math.max(hostWidth, this.boardWidth + deltaWidth);
    this.boardHeight = Math.max(hostHeight, this.boardHeight + deltaHeight);
    this.renderItems();
    this.emitChange();
  }

  setZoom(nextZoom) {
    this.zoom = Math.min(2.5, Math.max(0.4, nextZoom));
    this.renderItems();
    this.emitChange();
  }

  zoomIn() {
    this.setZoom(this.zoom + 0.1);
  }

  zoomOut() {
    this.setZoom(this.zoom - 0.1);
  }

  resetZoom() {
    this.setZoom(1);
  }

  getZoom() {
    return this.zoom;
  }

  applyBoardSize() {
    this.contentEl.style.width = `${Math.round(this.boardWidth * this.zoom)}px`;
    this.contentEl.style.height = `${Math.round(this.boardHeight * this.zoom)}px`;
    this.itemsEl.style.width = `${this.boardWidth}px`;
    this.itemsEl.style.height = `${this.boardHeight}px`;
    this.svgEl.style.width = `${this.boardWidth}px`;
    this.svgEl.style.height = `${this.boardHeight}px`;
    this.itemsEl.style.transform = `scale(${this.zoom})`;
    this.itemsEl.style.transformOrigin = "top left";
    this.svgEl.style.transform = `scale(${this.zoom})`;
    this.svgEl.style.transformOrigin = "top left";
    this.svgEl.setAttribute("viewBox", `0 0 ${this.boardWidth} ${this.boardHeight}`);
  }

  emitChange() {
    if (typeof this.options.onChange === "function") {
      this.options.onChange(this.getState());
    }
  }
}
