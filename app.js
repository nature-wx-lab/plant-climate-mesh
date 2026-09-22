(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAP_SIZE = 1000;
  const MAX_LAT = 85.05112878;
  const METEOROLOGY_LAT_STEP = 0.5;
  const METEOROLOGY_LON_STEP = 0.625;
  const POWER_CLIMATOLOGY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/point";
  const POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
  const PARAMETERS = ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const DAILY_PARAMETERS = ["T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const WEATHER_LAYERS = {
    temperature: {
      name: "平均気温",
      unit: "℃",
      grid: "0.5°×0.625°格子",
      stops: [[-50, "#21134f"], [-40, "#2c2b83"], [-30, "#3154b4"], [-20, "#377dcc"], [-10, "#63add8"], [0, "#b8dfe4"], [10, "#eef1c2"], [20, "#ffd27a"], [30, "#ed6c3b"], [40, "#b51f4b"], [50, "#59052c"]],
      ticks: [-50, -30, -10, 10, 30, 50],
    },
    precipitation: {
      name: "降水量",
      grid: "0.5°×0.625°格子",
      monthlyUnit: "mm/月",
      annualUnit: "mm/年",
      monthlyStops: [[0, "#fff7ec"], [25, "#e0f3db"], [50, "#ccebc5"], [100, "#a8ddb5"], [200, "#7bccc4"], [300, "#43a2ca"], [500, "#0868ac"], [800, "#084081"]],
      annualStops: [[0, "#fff7ec"], [250, "#e0f3db"], [500, "#ccebc5"], [1000, "#a8ddb5"], [1500, "#7bccc4"], [2500, "#43a2ca"], [4000, "#0868ac"], [6000, "#084081"]],
      monthlyTicks: [0, 100, 300, 500, 800],
      annualTicks: [0, 1000, 2500, 4000, 6000],
    },
    humidity: {
      name: "相対湿度",
      unit: "%",
      grid: "0.5°×0.625°格子",
      stops: [[0, "#7a4f28"], [20, "#bc8957"], [40, "#e3c89e"], [60, "#dce9c6"], [70, "#a9d8c3"], [80, "#58b5a7"], [90, "#257d89"], [100, "#174f70"]],
      ticks: [0, 40, 60, 80, 100],
    },
    solar: {
      name: "日射量",
      unit: "MJ/㎡/日",
      grid: "1°×1°格子",
      stops: [[0, "#28306f"], [5, "#3769a9"], [10, "#4ca5c2"], [15, "#8bcf9c"], [20, "#eee879"], [25, "#f4a64f"], [30, "#cc4b3d"], [35, "#761d39"]],
      ticks: [0, 10, 20, 30, 35],
    },
  };
  const AVERAGE_DAYS_PER_MONTH = [31, 28 + 8 / 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const AVERAGE_DAYS_PER_YEAR = AVERAGE_DAYS_PER_MONTH.reduce((sum, days) => sum + days, 0);
  const FILL_VALUE = -999;
  const KOPPEN_CLASSES = [
    ["Af", "熱帯雨林"], ["Am", "熱帯モンスーン"], ["Aw", "サバナ"],
    ["BWh", "高温砂漠"], ["BWk", "低温砂漠"], ["BSh", "高温ステップ"], ["BSk", "低温ステップ"],
    ["Csa", "高温夏季乾燥"], ["Csb", "温暖夏季乾燥"], ["Csc", "冷涼夏季乾燥"],
    ["Cwa", "高温冬季乾燥"], ["Cwb", "温暖冬季乾燥"], ["Cwc", "冷涼冬季乾燥"],
    ["Cfa", "高温・乾季なし"], ["Cfb", "温暖・乾季なし"], ["Cfc", "冷涼・乾季なし"],
    ["Dsa", "高温夏季乾燥"], ["Dsb", "温暖夏季乾燥"], ["Dsc", "冷涼夏季乾燥"], ["Dsd", "厳冬・夏季乾燥"],
    ["Dwa", "高温冬季乾燥"], ["Dwb", "温暖冬季乾燥"], ["Dwc", "冷涼冬季乾燥"], ["Dwd", "厳冬・冬季乾燥"],
    ["Dfa", "高温・乾季なし"], ["Dfb", "温暖・乾季なし"], ["Dfc", "冷涼・乾季なし"], ["Dfd", "厳冬・乾季なし"],
    ["ET", "ツンドラ"], ["EF", "氷雪"],
  ];

  const elements = {
    map: document.getElementById("worldMap"),
    mapWrap: document.querySelector(".map-wrap"),
    graticule: document.getElementById("graticuleLayer"),
    land: document.getElementById("landLayer"),
    border: document.getElementById("borderLayer"),
    weather: document.getElementById("weatherLayer"),
    weatherImage: document.getElementById("weatherImage"),
    climate: document.getElementById("climateLayer"),
    climateImage: document.getElementById("climateImage"),
    climateToggle: document.getElementById("climateToggle"),
    climateLegend: document.getElementById("climateLegend"),
    climateLegendItems: document.getElementById("climateLegendItems"),
    selection: document.getElementById("selectionLayer"),
    selectionState: document.getElementById("selectionState"),
    requestStatus: document.getElementById("requestStatus"),
    locationSummary: document.getElementById("locationSummary"),
    annualTemperature: document.getElementById("annualTemperature"),
    annualTemperatureNote: document.getElementById("annualTemperatureNote"),
    annualPrecipitation: document.getElementById("annualPrecipitation"),
    annualPrecipitationNote: document.getElementById("annualPrecipitationNote"),
    annualSolar: document.getElementById("annualSolar"),
    annualSolarNote: document.getElementById("annualSolarNote"),
    annualHumidity: document.getElementById("annualHumidity"),
    annualHumidityNote: document.getElementById("annualHumidityNote"),
    monthlyBody: document.getElementById("monthlyBody"),
    monthlyHeading: document.getElementById("monthlyHeading"),
    temperatureChart: document.getElementById("temperatureChart"),
    precipitationChart: document.getElementById("precipitationChart"),
    solarChart: document.getElementById("solarChart"),
    humidityChart: document.getElementById("humidityChart"),
    resultPanel: document.getElementById("resultPanel"),
    resultHeading: document.querySelector(".result-heading"),
    resultTitle: document.getElementById("resultHeading"),
    setReference: document.getElementById("setReference"),
    toggleComparison: document.getElementById("toggleComparison"),
    referenceShortLabel: document.getElementById("referenceShortLabel"),
    clearReference: document.getElementById("clearReference"),
    comparisonKeys: [...document.querySelectorAll("[data-comparison-key]")],
    resultTabs: [...document.querySelectorAll("[data-result-tab]")],
    resultPages: [...document.querySelectorAll("[data-result-page]")],
    openResults: document.getElementById("openResults"),
    closeResults: document.getElementById("closeResults"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    resetView: document.getElementById("resetView"),
    layerPanel: document.getElementById("layerPanel"),
    toggleLayerPanel: document.getElementById("toggleLayerPanel"),
    layerButtons: document.querySelectorAll("[data-weather-layer]"),
    layerPeriod: document.getElementById("layerPeriod"),
    activeLayerPeriod: document.getElementById("activeLayerPeriod"),
    activeLayerName: document.getElementById("activeLayerName"),
    activeLayerMeta: document.getElementById("activeLayerMeta"),
    layerStatus: document.getElementById("layerStatus"),
    weatherLegendTitle: document.getElementById("weatherLegendTitle"),
    weatherLegendUnit: document.getElementById("weatherLegendUnit"),
    weatherLegendBar: document.getElementById("weatherLegendBar"),
    weatherLegendTicks: document.getElementById("weatherLegendTicks"),
    weatherLayerToggle: document.getElementById("weatherLayerToggle"),
    weatherLayerOpacity: document.getElementById("weatherLayerOpacity"),
    weatherLayerOpacityValue: document.getElementById("weatherLayerOpacityValue"),
    mapLayerLabel: document.getElementById("mapLayerLabel"),
  };

  const state = {
    zoom: 1,
    centerX: MAP_SIZE / 2,
    centerY: MAP_SIZE / 2,
    requestSerial: 0,
    controller: null,
    cache: new Map(),
    selectedCell: null,
    drag: null,
    countries: [],
    places: [],
    currentRecord: null,
    referenceRecord: null,
    comparisonEnabled: true,
    climateVisible: false,
    weatherLayer: "temperature",
    weatherPeriod: "annual",
    weatherVisible: true,
    resultPanelPosition: null,
    resultPanelScale: 1,
    resultPanelPage: "overview",
    resultPanelDragging: false,
    resultPanelDragStart: null,
    resultPanelResizeStart: null,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function wrapWorldX(value) {
    return ((value % MAP_SIZE) + MAP_SIZE) % MAP_SIZE;
  }

  function project(longitude, latitude) {
    const safeLatitude = clamp(latitude, -MAX_LAT, MAX_LAT);
    const x = ((longitude + 180) / 360) * MAP_SIZE;
    const sine = Math.sin((safeLatitude * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * MAP_SIZE;
    return [x, y];
  }

  function unproject(x, y) {
    const longitude = (wrapWorldX(x) / MAP_SIZE) * 360 - 180;
    const mercator = Math.PI - (2 * Math.PI * y) / MAP_SIZE;
    const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
    return [longitude, clamp(latitude, -MAX_LAT, MAX_LAT)];
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function setStatus(message, kind = "idle") {
    elements.requestStatus.textContent = message;
    elements.requestStatus.dataset.state = kind;
  }

  function setView(zoom, centerX = state.centerX, centerY = state.centerY) {
    state.zoom = clamp(zoom, 1, 16);
    const size = MAP_SIZE / state.zoom;
    state.centerX = wrapWorldX(centerX);
    state.centerY = clamp(centerY, size / 2, MAP_SIZE - size / 2);
    elements.map.setAttribute("viewBox", `${state.centerX - size / 2} ${state.centerY - size / 2} ${size} ${size}`);
    elements.zoomOut.disabled = state.zoom <= 1;
    elements.zoomIn.disabled = state.zoom >= 16;
    if (state.selectedCell) drawSelections();
  }

  function openResultPanel() {
    elements.resultPanel.hidden = false;
    elements.openResults.hidden = true;
    elements.openResults.setAttribute("aria-expanded", "true");
    elements.closeResults.setAttribute("aria-expanded", "true");
    setResultPanelPage(state.resultPanelPage);
    applyResultPanelScale();
    applyResultPanelPosition();
  }

  function closeResultPanel() {
    elements.resultPanel.hidden = true;
    elements.openResults.hidden = false;
    elements.openResults.setAttribute("aria-expanded", "false");
    elements.closeResults.setAttribute("aria-expanded", "false");
  }

  function setResultPanelPage(page, focus = false) {
    const selectedButton = elements.resultTabs.find((button) => button.dataset.resultTab === page);
    if (!selectedButton) return;
    state.resultPanelPage = page;
    elements.resultTabs.forEach((button) => {
      const selected = button === selectedButton;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    elements.resultPages.forEach((panel) => {
      panel.hidden = panel.dataset.resultPage !== page;
    });
    if (focus) selectedButton.focus();
  }

  function moveResultPanelTab(event) {
    const currentIndex = elements.resultTabs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % elements.resultTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + elements.resultTabs.length) % elements.resultTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = elements.resultTabs.length - 1;
    else return;
    event.preventDefault();
    setResultPanelPage(elements.resultTabs[nextIndex].dataset.resultTab, true);
  }

  function defaultResultPanelPosition() {
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const panelRect = elements.resultPanel.getBoundingClientRect();
    return {
      left: Math.max(12, wrapRect.width - panelRect.width - 14),
      top: Math.max(12, wrapRect.height - panelRect.height - 14),
    };
  }

  function clampResultPanelPosition(position) {
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const panelRect = elements.resultPanel.getBoundingClientRect();
    return {
      left: clamp(position.left, 8, Math.max(8, wrapRect.width - panelRect.width - 8)),
      top: clamp(position.top, 8, Math.max(8, wrapRect.height - panelRect.height - 8)),
    };
  }

  function applyResultPanelScale() {
    elements.resultPanel.style.setProperty("--panel-scale", String(state.resultPanelScale));
  }

  function applyResultPanelPosition() {
    if (elements.resultPanel.hidden) return;
    if (!state.resultPanelPosition) state.resultPanelPosition = defaultResultPanelPosition();
    state.resultPanelPosition = clampResultPanelPosition(state.resultPanelPosition);
    elements.resultPanel.style.left = `${state.resultPanelPosition.left}px`;
    elements.resultPanel.style.top = `${state.resultPanelPosition.top}px`;
  }

  function beginResultPanelDrag(event) {
    if (event.button !== 0 || event.target.closest("button") || state.resultPanelResizeStart) return;
    const current = state.resultPanelPosition || defaultResultPanelPosition();
    state.resultPanelDragging = true;
    state.resultPanelDragStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: current.left,
      top: current.top,
    };
    elements.resultHeading.setPointerCapture?.(event.pointerId);
    elements.resultPanel.classList.add("dragging");
    event.preventDefault();
  }

  function moveResultPanelDrag(event) {
    if (!state.resultPanelDragging || !state.resultPanelDragStart || state.resultPanelResizeStart) return;
    if (event.pointerId !== state.resultPanelDragStart.pointerId) return;
    state.resultPanelPosition = clampResultPanelPosition({
      left: state.resultPanelDragStart.left + event.clientX - state.resultPanelDragStart.x,
      top: state.resultPanelDragStart.top + event.clientY - state.resultPanelDragStart.y,
    });
    applyResultPanelPosition();
  }

  function endResultPanelDrag(event) {
    if (!state.resultPanelDragging || event.pointerId !== state.resultPanelDragStart?.pointerId) return;
    try { elements.resultHeading.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    state.resultPanelDragging = false;
    state.resultPanelDragStart = null;
    elements.resultPanel.classList.remove("dragging");
  }

  function beginResultPanelResize(event) {
    const handle = event.target.closest("[data-result-resize]");
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = elements.resultPanel.getBoundingClientRect();
    const position = state.resultPanelPosition || defaultResultPanelPosition();
    state.resultPanelResizeStart = {
      pointerId: event.pointerId,
      corner: handle.dataset.panelCorner || "se",
      x: event.clientX,
      y: event.clientY,
      scale: state.resultPanelScale,
      width: rect.width,
      height: rect.height,
      left: position.left,
      top: position.top,
    };
    handle.setPointerCapture?.(event.pointerId);
    elements.resultPanel.classList.add("resizing");
  }

  function moveResultPanelResize(event) {
    const start = state.resultPanelResizeStart;
    if (!start || event.pointerId !== start.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const widthRatio = (start.width + (start.corner.includes("w") ? -dx : dx)) / start.width;
    const heightRatio = (start.height + (start.corner.includes("n") ? -dy : dy)) / start.height;
    const ratio = Math.max(widthRatio, heightRatio);
    const baseWidth = start.width / start.scale;
    const baseHeight = start.height / start.scale;
    const wrapRect = elements.mapWrap.getBoundingClientRect();
    const maxScale = Math.max(0.65, Math.min(
      1.45,
      (wrapRect.width - 16) / baseWidth,
      (wrapRect.height - 16) / baseHeight,
    ));
    const scale = clamp(start.scale * ratio, 0.65, maxScale);
    const scaleRatio = scale / start.scale;
    state.resultPanelScale = scale;
    state.resultPanelPosition = {
      left: start.left + (start.corner.includes("w") ? start.width * (1 - scaleRatio) : 0),
      top: start.top + (start.corner.includes("n") ? start.height * (1 - scaleRatio) : 0),
    };
    applyResultPanelScale();
    applyResultPanelPosition();
  }

  function endResultPanelResize(event) {
    const start = state.resultPanelResizeStart;
    if (!start || event.pointerId !== start.pointerId) return;
    state.resultPanelResizeStart = null;
    elements.resultPanel.classList.remove("resizing");
  }

  function drawGraticule() {
    for (let longitude = -180; longitude <= 180; longitude += 30) {
      const [x] = project(longitude, 0);
      elements.graticule.append(svgElement("line", { x1: x, y1: 0, x2: x, y2: MAP_SIZE, class: "graticule" }));
    }
    for (let latitude = -80; latitude <= 80; latitude += 20) {
      const [, y] = project(0, latitude);
      elements.graticule.append(svgElement("line", { x1: 0, y1: y, x2: MAP_SIZE, y2: y, class: "graticule" }));
    }
  }

  function drawClimateLegend() {
    const fragment = document.createDocumentFragment();
    KOPPEN_CLASSES.forEach(([code, description], index) => {
      const item = document.createElement("span");
      item.className = "climate-key";
      item.title = `${code} ${description}`;
      const swatch = document.createElement("i");
      swatch.className = `climate-swatch kg-${index + 1}`;
      swatch.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = code;
      item.append(swatch, label);
      fragment.append(item);
    });
    elements.climateLegendItems.replaceChildren(fragment);
  }

  function weatherLayerConfig() {
    return WEATHER_LAYERS[state.weatherLayer];
  }

  function weatherStops(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualStops : config.monthlyStops;
    }
    return config.stops;
  }

  function weatherTicks(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualTicks : config.monthlyTicks;
    }
    return config.ticks;
  }

  function weatherUnit(config = weatherLayerConfig()) {
    if (state.weatherLayer === "precipitation") {
      return state.weatherPeriod === "annual" ? config.annualUnit : config.monthlyUnit;
    }
    return config.unit;
  }

  function periodLabel() {
    if (state.weatherPeriod === "annual") return "年平均";
    return `${Number(state.weatherPeriod)}月`;
  }

  function renderWeatherLegend() {
    const config = weatherLayerConfig();
    const stops = weatherStops(config);
    const minimum = stops[0][0];
    const maximum = stops[stops.length - 1][0];
    const gradient = stops.map(([value, color]) => {
      const position = ((value - minimum) / (maximum - minimum)) * 100;
      return `${color} ${position.toFixed(2)}%`;
    }).join(", ");
    elements.weatherLegendBar.style.background = `linear-gradient(90deg, ${gradient})`;
    const ticks = weatherTicks(config).map((value, index, values) => {
      const tick = document.createElement("span");
      tick.textContent = String(value);
      tick.style.left = `${((value - minimum) / (maximum - minimum)) * 100}%`;
      if (index === 0) tick.style.left = "0";
      if (index === values.length - 1) tick.style.left = "100%";
      return tick;
    });
    elements.weatherLegendTicks.replaceChildren(...ticks);
    elements.weatherLegendTitle.textContent = config.name;
    elements.weatherLegendUnit.textContent = weatherUnit(config);
  }

  function updateWeatherLayer() {
    const config = weatherLayerConfig();
    const label = periodLabel();
    const path = `./data/climate-layers/${state.weatherLayer}-${state.weatherPeriod}.png`;
    elements.activeLayerPeriod.textContent = label;
    elements.activeLayerName.textContent = config.name;
    elements.activeLayerMeta.textContent = `1991–2020年の気候平均｜${config.grid}`;
    elements.mapLayerLabel.textContent = state.weatherVisible ? `${label}｜${config.name}` : "気象レイヤー非表示";
    elements.layerStatus.textContent = "読み込み中";
    elements.layerStatus.dataset.state = "loading";
    elements.weatherImage.setAttribute("href", path);
    elements.layerButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.weatherLayer === state.weatherLayer));
    });
    renderWeatherLegend();
  }

  function setWeatherVisibility(visible) {
    state.weatherVisible = visible;
    elements.weather.toggleAttribute("hidden", !visible);
    const config = weatherLayerConfig();
    elements.mapLayerLabel.textContent = visible ? `${periodLabel()}｜${config.name}` : "気象レイヤー非表示";
  }

  function toggleClimateLayer() {
    state.climateVisible = !state.climateVisible;
    if (state.climateVisible && !elements.climateImage.getAttribute("href")) {
      elements.climateImage.setAttribute("href", elements.climateImage.dataset.src);
    }
    elements.climate.toggleAttribute("hidden", !state.climateVisible);
    elements.climateLegend.toggleAttribute("hidden", !state.climateVisible);
    elements.climateToggle.setAttribute("aria-pressed", String(state.climateVisible));
    elements.map.classList.toggle("climate-visible", state.climateVisible);
  }

  function ringToPath(ring) {
    const commands = [];
    for (let index = 0; index < ring.length; index += 1) {
      const coordinate = ring[index];
      if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
      const [x, y] = project(Number(coordinate[0]), Number(coordinate[1]));
      commands.push(`${commands.length ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    if (commands.length) commands.push("Z");
    return commands.join(" ");
  }

  function geometryToPath(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return "";
    if (geometry.type === "Polygon") return geometry.coordinates.map(ringToPath).join(" ");
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap((polygon) => polygon.map(ringToPath)).join(" ");
    }
    return "";
  }

  async function loadWorldMap() {
    try {
      const response = await fetch("./data/world-50m.geojson", {
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const collection = await response.json();
      if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("地図データ形式が不正です");
      }
      state.countries = collection.features;
      state.places = Array.isArray(collection.places) ? collection.places : [];
      const fragment = document.createDocumentFragment();
      const borderFragment = document.createDocumentFragment();
      for (const feature of collection.features) {
        const pathData = geometryToPath(feature.geometry);
        if (pathData) {
          fragment.append(svgElement("path", { d: pathData, class: "land", "fill-rule": "evenodd" }));
          borderFragment.append(svgElement("path", { d: pathData, class: "country-border", "fill-rule": "evenodd" }));
        }
      }
      elements.land.replaceChildren(fragment);
      elements.border.replaceChildren(borderFragment);
      if (state.referenceRecord?.cell) {
        state.referenceRecord.location = describeLocation(state.referenceRecord.cell);
      }
      if (state.selectedCell) updateLocation(state.selectedCell);
    } catch (error) {
      setStatus("境界線を読み込めませんでした。格子選択は利用できます", "error");
    }
  }

  function selectedCell(longitude, latitude) {
    const latitudeIndex = Math.round((clamp(latitude, -85, 85) + 90) / METEOROLOGY_LAT_STEP);
    const longitudeIndex = Math.round((longitude + 180) / METEOROLOGY_LON_STEP);
    const gridLatitude = -90 + latitudeIndex * METEOROLOGY_LAT_STEP;
    let gridLongitude = -180 + longitudeIndex * METEOROLOGY_LON_STEP;
    if (gridLongitude >= 180) gridLongitude -= 360;
    const clean = (value) => Number(value.toFixed(6));
    return {
      lonMin: clean(gridLongitude - METEOROLOGY_LON_STEP / 2),
      lonMax: clean(gridLongitude + METEOROLOGY_LON_STEP / 2),
      latMin: clean(gridLatitude - METEOROLOGY_LAT_STEP / 2),
      latMax: clean(gridLatitude + METEOROLOGY_LAT_STEP / 2),
      longitude: clean(gridLongitude),
      latitude: clean(gridLatitude),
    };
  }

  function cellCopies(cell, cellClass, pointClass) {
    const [left, top] = project(cell.lonMin, cell.latMax);
    const [right, bottom] = project(cell.lonMax, cell.latMin);
    const [centerX, centerY] = project(cell.longitude, cell.latitude);
    const copies = [];
    for (const offset of [-MAP_SIZE, 0, MAP_SIZE]) {
      copies.push(svgElement("rect", {
        x: left + offset,
        y: top,
        width: Math.max(0.2, right - left),
        height: Math.max(0.2, bottom - top),
        class: cellClass,
      }));
      copies.push(svgElement("circle", {
        cx: centerX + offset,
        cy: centerY,
        r: 2.2 / state.zoom,
        class: pointClass,
      }));
    }
    return copies;
  }

  function sameCell(first, second) {
    return Boolean(first && second
      && first.latitude === second.latitude
      && first.longitude === second.longitude);
  }

  function drawSelections() {
    const copies = [];
    if (state.referenceRecord?.cell) {
      copies.push(...cellCopies(state.referenceRecord.cell, "reference-cell", "reference-point"));
    }
    if (state.selectedCell) {
      copies.push(...cellCopies(state.selectedCell, "selection-cell", "selection-point"));
    }
    elements.selection.replaceChildren(...copies);
  }

  function coordinateLabel(value, positive, negative) {
    const direction = value >= 0 ? positive : negative;
    return `${Math.abs(value).toFixed(2)}°${direction}`;
  }

  function ringContainsPoint(ring, longitude, latitude) {
    let minimumLongitude = Infinity;
    let maximumLongitude = -Infinity;
    ring.forEach((coordinate) => {
      const value = Number(coordinate[0]);
      minimumLongitude = Math.min(minimumLongitude, value);
      maximumLongitude = Math.max(maximumLongitude, value);
    });
    const crossesAntimeridian = maximumLongitude - minimumLongitude > 180;
    const pointX = crossesAntimeridian && longitude < 0 ? longitude + 360 : longitude;
    const ringLongitude = (value) => crossesAntimeridian && value < 0 ? value + 360 : value;
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const currentCoordinate = ring[index];
      const previousCoordinate = ring[previous];
      const currentX = ringLongitude(Number(currentCoordinate[0]));
      const previousX = ringLongitude(Number(previousCoordinate[0]));
      const currentY = Number(currentCoordinate[1]);
      const previousY = Number(previousCoordinate[1]);
      const crossesLatitude = (currentY > latitude) !== (previousY > latitude);
      if (!crossesLatitude) continue;
      const crossingX = ((previousX - currentX) * (latitude - currentY)) / (previousY - currentY) + currentX;
      if (crossingX > pointX) inside = !inside;
    }
    return inside;
  }

  function polygonContainsPoint(polygon, longitude, latitude) {
    if (!polygon.length || !ringContainsPoint(polygon[0], longitude, latitude)) return false;
    return !polygon.slice(1).some((hole) => ringContainsPoint(hole, longitude, latitude));
  }

  function geometryContainsPoint(geometry, longitude, latitude) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return false;
    if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, longitude, latitude);
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, longitude, latitude));
    }
    return false;
  }

  function countryAt(longitude, latitude) {
    return state.countries.find((feature) => geometryContainsPoint(feature.geometry, longitude, latitude)) || null;
  }

  function radians(value) {
    return (value * Math.PI) / 180;
  }

  function distanceKilometers(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
    const latitudeDelta = radians(secondLatitude - firstLatitude);
    const longitudeDelta = radians(secondLongitude - firstLongitude);
    const first = radians(firstLatitude);
    const second = radians(secondLatitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(first) * Math.cos(second) * Math.sin(longitudeDelta / 2) ** 2;
    const safe = clamp(haversine, 0, 1);
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(safe), Math.sqrt(1 - safe));
  }

  function directionFromPlace(place, cell) {
    const first = radians(place.y);
    const second = radians(cell.latitude);
    const longitudeDelta = radians(cell.longitude - place.x);
    const bearing = (Math.atan2(
      Math.sin(longitudeDelta) * Math.cos(second),
      Math.cos(first) * Math.sin(second) - Math.sin(first) * Math.cos(second) * Math.cos(longitudeDelta),
    ) * 180 / Math.PI + 360) % 360;
    return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(bearing / 45) % 8];
  }

  function roundedDistance(distance) {
    const step = distance < 100 ? 5 : distance < 500 ? 10 : 50;
    return Math.max(step, Math.round(distance / step) * step);
  }

  function nearestPlace(cell, country) {
    if (!country || !state.places.length) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const place of state.places) {
      if (place.c !== country.properties.code) continue;
      const distance = distanceKilometers(cell.latitude, cell.longitude, place.y, place.x);
      if (distance < nearestDistance) {
        nearest = place;
        nearestDistance = distance;
      }
    }
    return nearest ? { place: nearest, distance: nearestDistance } : null;
  }

  function describeLocation(cell) {
    const country = countryAt(cell.longitude, cell.latitude);
    if (!country) {
      const coordinates = `${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
      return {
        countryName: "海上",
        areaLabel: coordinates,
        placeName: "海上",
        headerLabel: `海上｜${coordinates}`,
      };
    }
    const nearest = nearestPlace(cell, country);
    if (!nearest) {
      return {
        countryName: country.properties.name,
        areaLabel: country.properties.capital ? `${country.properties.capital}方面` : "地点情報なし",
        placeName: country.properties.capital || country.properties.name,
        headerLabel: `${country.properties.name}｜${country.properties.capital || "地点情報なし"}`,
      };
    }
    const localizedName = nearest.place.q === "c" && country.properties.capital
      ? country.properties.capital
      : nearest.place.n;
    const areaLabel = nearest.distance <= 45
      ? `${localizedName}周辺`
      : `${localizedName}の${directionFromPlace(nearest.place, cell)} 約${roundedDistance(nearest.distance)}km`;
    return {
      countryName: country.properties.name,
      areaLabel,
      placeName: localizedName,
      headerLabel: `${country.properties.name}｜${areaLabel}`,
    };
  }

  function updateLocation(cell) {
    const location = describeLocation(cell);
    const previous = state.currentRecord;
    state.currentRecord = {
      cell,
      location,
      climate: sameCell(previous?.cell, cell) ? previous.climate : null,
      daily: sameCell(previous?.cell, cell) ? previous.daily : null,
    };
    const strong = document.createElement("strong");
    strong.textContent = "気象格子：約0.5°×0.625°（橙枠）";
    const span = document.createElement("span");
    span.textContent = `格子中心：${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
    const country = countryAt(cell.longitude, cell.latitude);
    const place = document.createElement("span");
    place.className = "place-summary";
    place.textContent = `国・地域：${location.countryName}｜周辺：${location.areaLabel}`;
    const note = document.createElement("small");
    note.textContent = "気温・降水・相対湿度は橙枠に対応する元格子の空間平均です。日射は中心点に対応する別の1°×1°格子です。";
    elements.locationSummary.replaceChildren(strong, span, place, note);
    elements.resultTitle.textContent = location.headerLabel;
    elements.resultTitle.title = location.headerLabel;
    updateComparisonControls();
  }

  function powerUrl(cell) {
    const query = new URLSearchParams({
      parameters: PARAMETERS.join(","),
      community: "AG",
      longitude: cell.longitude.toFixed(2),
      latitude: cell.latitude.toFixed(2),
      start: "1991",
      end: "2020",
      format: "JSON",
    });
    return `${POWER_CLIMATOLOGY_ENDPOINT}?${query.toString()}`;
  }

  function dailyPowerUrl(cell) {
    const query = new URLSearchParams({
      parameters: DAILY_PARAMETERS.join(","),
      community: "AG",
      longitude: cell.longitude.toFixed(2),
      latitude: cell.latitude.toFixed(2),
      start: "19910101",
      end: "20201231",
      format: "JSON",
      "time-standard": "LST",
    });
    return `${POWER_DAILY_ENDPOINT}?${query.toString()}`;
  }

  function validNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value !== FILL_VALUE;
  }

  function numberText(value, digits = 1) {
    return validNumber(value) ? value.toFixed(digits) : "—";
  }

  function setMetric(element, value, unit, digits = 1) {
    element.textContent = validNumber(value) ? `${numberText(value, digits)} ${unit}` : "データなし";
  }

  function signedNumberText(value, digits = 1) {
    if (!validNumber(value)) return "—";
    const rounded = Number(value.toFixed(digits));
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
  }

  function setMetricComparison(noteElement, current, reference, unit, digits, defaultText) {
    noteElement.textContent = validNumber(reference) && validNumber(current)
      ? `基準 ${numberText(reference, digits)}｜差 ${signedNumberText(current - reference, digits)} ${unit}`
      : defaultText;
  }

  function dataSeries(payload, key) {
    const series = payload?.properties?.parameter?.[key];
    return series && typeof series === "object" ? series : {};
  }

  function renderChart(svg, values, referenceValues, color, type) {
    svg.replaceChildren();
    const validValues = [...values, ...(referenceValues || [])].filter(validNumber);
    if (!validValues.length) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = "データを取得しています";
      svg.append(empty);
      return;
    }

    const left = 34;
    const right = 8;
    const top = 8;
    const bottom = 23;
    const width = 360 - left - right;
    const height = 126 - top - bottom;
    let minimum = type === "bar" ? 0 : Math.min(...validValues);
    let maximum = Math.max(...validValues);
    if (type !== "bar") {
      const padding = Math.max((maximum - minimum) * 0.12, 0.5);
      minimum -= padding;
      maximum += padding;
    } else {
      maximum = maximum > 0 ? maximum * 1.12 : 1;
    }
    if (maximum === minimum) maximum = minimum + 1;

    const x = (index) => left + (index / 11) * width;
    const y = (value) => top + ((maximum - value) / (maximum - minimum)) * height;

    for (let index = 0; index <= 2; index += 1) {
      const fraction = index / 2;
      const lineY = top + fraction * height;
      const gridline = svgElement("line", { x1: left, y1: lineY, x2: left + width, y2: lineY, class: "chart-gridline" });
      const label = svgElement("text", { x: left - 5, y: lineY + 3, class: "chart-axis-label", "text-anchor": "end" });
      label.textContent = (maximum - fraction * (maximum - minimum)).toFixed(1);
      svg.append(gridline, label);
    }

    [0, 2, 5, 8, 11].forEach((monthIndex) => {
      const label = svgElement("text", { x: x(monthIndex), y: 121, class: "chart-axis-label", "text-anchor": "middle" });
      label.textContent = `${monthIndex + 1}月`;
      svg.append(label);
    });

    if (type === "bar") {
      const comparing = Array.isArray(referenceValues) && referenceValues.some(validNumber);
      const barWidth = Math.max(5, width / (comparing ? 24 : 17));
      if (comparing) {
        referenceValues.forEach((value, index) => {
          if (!validNumber(value)) return;
          svg.append(svgElement("rect", {
            x: x(index) + 1,
            y: y(value),
            width: barWidth,
            height: Math.max(1, y(0) - y(value)),
            rx: 1,
            stroke: color,
            class: "chart-reference-bar",
          }));
        });
      }
      values.forEach((value, index) => {
        if (!validNumber(value)) return;
        svg.append(svgElement("rect", {
          x: x(index) - (comparing ? barWidth + 1 : barWidth / 2),
          y: y(value),
          width: barWidth,
          height: Math.max(1, y(0) - y(value)),
          rx: 2,
          fill: color,
          class: "chart-bar",
        }));
      });
      return;
    }

    if (Array.isArray(referenceValues) && referenceValues.some(validNumber)) {
      const referenceCommands = [];
      referenceValues.forEach((value, index) => {
        if (!validNumber(value)) return;
        referenceCommands.push(`${referenceCommands.length ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`);
      });
      svg.append(svgElement("path", {
        d: referenceCommands.join(" "),
        stroke: color,
        class: "chart-line chart-reference-series",
      }));
    }

    const commands = [];
    values.forEach((value, index) => {
      if (!validNumber(value)) return;
      commands.push(`${commands.length ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)}`);
    });
    svg.append(svgElement("path", { d: commands.join(" "), stroke: color, class: "chart-line" }));
    values.forEach((value, index) => {
      if (!validNumber(value)) return;
      svg.append(svgElement("circle", { cx: x(index), cy: y(value), r: 3, fill: color, class: "chart-point" }));
    });
  }

  function monthlyValues(payload, key) {
    const series = dataSeries(payload, key);
    return MONTHS.map((month) => series[month]);
  }

  function monthlyPrecipitationTotals(payload) {
    return monthlyValues(payload, "PRECTOTCORR").map((value, index) => (
      validNumber(value) ? value * AVERAGE_DAYS_PER_MONTH[index] : FILL_VALUE
    ));
  }

  function calendarDays() {
    const days = [];
    const cursor = new Date(Date.UTC(2000, 0, 1));
    const end = new Date(Date.UTC(2001, 0, 1));
    while (cursor < end) {
      days.push(`${String(cursor.getUTCMonth() + 1).padStart(2, "0")}${String(cursor.getUTCDate()).padStart(2, "0")}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  }

  function averageByCalendarDay(payload, key) {
    const sums = new Map();
    const counts = new Map();
    for (const [date, value] of Object.entries(dataSeries(payload, key))) {
      if (!/^\d{8}$/.test(date) || !validNumber(value)) continue;
      const calendarDay = date.slice(4);
      sums.set(calendarDay, (sums.get(calendarDay) || 0) + value);
      counts.set(calendarDay, (counts.get(calendarDay) || 0) + 1);
    }
    return calendarDays().map((calendarDay) => ({
      calendarDay,
      value: counts.has(calendarDay) ? sums.get(calendarDay) / counts.get(calendarDay) : FILL_VALUE,
      count: counts.get(calendarDay) || 0,
    }));
  }

  function averageDailyValuesByMonth(payload, key) {
    const sums = Array(12).fill(0);
    const counts = Array(12).fill(0);
    for (const [date, value] of Object.entries(dataSeries(payload, key))) {
      if (!/^\d{8}$/.test(date) || !validNumber(value)) continue;
      const monthIndex = Number(date.slice(4, 6)) - 1;
      if (monthIndex < 0 || monthIndex > 11) continue;
      sums[monthIndex] += value;
      counts[monthIndex] += 1;
    }
    return sums.map((sum, index) => (counts[index] ? sum / counts[index] : FILL_VALUE));
  }

  function renderDailyTemperatureChart(payload, referencePayload = null, emptyMessage = "日別最高・最低を取得できませんでした") {
    const svg = elements.temperatureChart;
    const chartHeight = 156;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: chartHeight / 2, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const maximumSeries = averageByCalendarDay(payload, "T2M_MAX");
    const minimumSeries = averageByCalendarDay(payload, "T2M_MIN");
    const referenceMaximumSeries = referencePayload ? averageByCalendarDay(referencePayload, "T2M_MAX") : [];
    const referenceMinimumSeries = referencePayload ? averageByCalendarDay(referencePayload, "T2M_MIN") : [];
    const values = [...maximumSeries, ...minimumSeries, ...referenceMaximumSeries, ...referenceMinimumSeries]
      .map((item) => item.value)
      .filter(validNumber);
    if (!values.length) {
      const empty = svgElement("text", { x: 180, y: chartHeight / 2, class: "chart-empty" });
      empty.textContent = "データを取得しています";
      svg.append(empty);
      return;
    }

    const left = 34;
    const right = 8;
    const top = 8;
    const bottom = 23;
    const width = 360 - left - right;
    const height = chartHeight - top - bottom;
    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const minimum = Math.min(0, Math.floor(rawMinimum / 5) * 5);
    const maximum = Math.max(35, Math.ceil(rawMaximum / 5) * 5);
    const x = (index) => left + (index / (maximumSeries.length - 1)) * width;
    const y = (value) => top + ((maximum - value) / (maximum - minimum)) * height;

    for (let tick = minimum; tick <= maximum; tick += 5) {
      const lineY = y(tick);
      const emphasized = tick === 0 || tick === 30;
      const gridline = svgElement("line", {
        x1: left,
        y1: lineY,
        x2: left + width,
        y2: lineY,
        class: emphasized ? "chart-gridline chart-gridline-emphasis" : "chart-gridline",
      });
      const label = svgElement("text", { x: left - 5, y: lineY + 3, class: "chart-axis-label", "text-anchor": "end" });
      if (emphasized) label.classList.add("chart-axis-label-emphasis");
      const withinCoreRange = tick >= 0 && tick <= 35;
      label.textContent = withinCoreRange || tick % 10 === 0 ? String(tick) : "";
      svg.append(gridline, label);
    }

    ["0101", "0301", "0501", "0701", "0901", "1101"].forEach((calendarDay) => {
      const index = maximumSeries.findIndex((item) => item.calendarDay === calendarDay);
      const label = svgElement("text", { x: x(index), y: chartHeight - 5, class: "chart-axis-label", "text-anchor": "middle" });
      label.textContent = `${Number(calendarDay.slice(0, 2))}月`;
      svg.append(label);
    });

    const appendSeries = (series, color, reference = false) => {
      if (!series.some((item) => validNumber(item.value))) return;
      const commands = [];
      let pathOpen = false;
      series.forEach((item, index) => {
        if (!validNumber(item.value)) {
          pathOpen = false;
          return;
        }
        commands.push(`${pathOpen ? "L" : "M"}${x(index).toFixed(2)},${y(item.value).toFixed(2)}`);
        pathOpen = true;
      });
      svg.append(svgElement("path", {
        d: commands.join(" "),
        stroke: color,
        class: `chart-line daily-temperature-line${reference ? " chart-reference-series" : ""}`,
      }));
    };

    appendSeries(referenceMaximumSeries, "#d4513e", true);
    appendSeries(referenceMinimumSeries, "#287bb5", true);
    appendSeries(maximumSeries, "#d4513e");
    appendSeries(minimumSeries, "#287bb5");
  }

  function renderDailySolarChart(payload, referencePayload = null, emptyMessage = "日別日射量を取得できませんでした") {
    const svg = elements.solarChart;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const series = averageByCalendarDay(payload, "ALLSKY_SFC_SW_DWN");
    const referenceSeries = referencePayload ? averageByCalendarDay(referencePayload, "ALLSKY_SFC_SW_DWN") : [];
    const values = [...series, ...referenceSeries].map((item) => item.value).filter(validNumber);
    if (!values.length) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = "日別日射量を取得できませんでした";
      svg.append(empty);
      return;
    }

    const left = 34;
    const right = 8;
    const top = 8;
    const bottom = 23;
    const width = 360 - left - right;
    const height = 126 - top - bottom;
    const minimum = 0;
    const maximum = Math.ceil(Math.max(...values) / 5) * 5 || 5;
    const x = (index) => left + (index / (series.length - 1)) * width;
    const y = (value) => top + ((maximum - value) / (maximum - minimum)) * height;

    for (let index = 0; index <= 2; index += 1) {
      const value = maximum - (index / 2) * maximum;
      const lineY = y(value);
      const gridline = svgElement("line", { x1: left, y1: lineY, x2: left + width, y2: lineY, class: "chart-gridline" });
      const label = svgElement("text", { x: left - 5, y: lineY + 3, class: "chart-axis-label", "text-anchor": "end" });
      label.textContent = value.toFixed(0);
      svg.append(gridline, label);
    }

    ["0101", "0301", "0501", "0701", "0901", "1101"].forEach((calendarDay) => {
      const index = series.findIndex((item) => item.calendarDay === calendarDay);
      const label = svgElement("text", { x: x(index), y: 121, class: "chart-axis-label", "text-anchor": "middle" });
      label.textContent = `${Number(calendarDay.slice(0, 2))}月`;
      svg.append(label);
    });

    const appendSeries = (items, reference = false) => {
      if (!items.some((item) => validNumber(item.value))) return;
      const commands = [];
      let pathOpen = false;
      items.forEach((item, index) => {
        if (!validNumber(item.value)) {
          pathOpen = false;
          return;
        }
        commands.push(`${pathOpen ? "L" : "M"}${x(index).toFixed(2)},${y(item.value).toFixed(2)}`);
        pathOpen = true;
      });
      svg.append(svgElement("path", {
        d: commands.join(" "),
        stroke: "#d99516",
        class: `chart-line daily-solar-line${reference ? " chart-reference-series" : ""}`,
      }));
    };
    appendSeries(referenceSeries, true);
    appendSeries(series);
  }

  function renderDailyHumidityChart(payload, referencePayload = null, emptyMessage = "日別相対湿度を取得できませんでした") {
    const svg = elements.humidityChart;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const series = averageByCalendarDay(payload, "RH2M");
    const referenceSeries = referencePayload ? averageByCalendarDay(referencePayload, "RH2M") : [];
    const values = [...series, ...referenceSeries].map((item) => item.value).filter(validNumber);
    if (!values.length) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = "日別相対湿度を取得できませんでした";
      svg.append(empty);
      return;
    }

    const left = 34;
    const right = 8;
    const top = 8;
    const bottom = 23;
    const width = 360 - left - right;
    const height = 126 - top - bottom;
    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const minimum = Math.max(0, Math.floor((rawMinimum - 3) / 5) * 5);
    const maximum = Math.min(100, Math.ceil((rawMaximum + 3) / 5) * 5);
    const x = (index) => left + (index / (series.length - 1)) * width;
    const y = (value) => top + ((maximum - value) / (maximum - minimum)) * height;

    for (let index = 0; index <= 2; index += 1) {
      const value = maximum - (index / 2) * (maximum - minimum);
      const lineY = y(value);
      const gridline = svgElement("line", { x1: left, y1: lineY, x2: left + width, y2: lineY, class: "chart-gridline" });
      const label = svgElement("text", { x: left - 5, y: lineY + 3, class: "chart-axis-label", "text-anchor": "end" });
      label.textContent = value.toFixed(0);
      svg.append(gridline, label);
    }

    ["0101", "0301", "0501", "0701", "0901", "1101"].forEach((calendarDay) => {
      const index = series.findIndex((item) => item.calendarDay === calendarDay);
      const label = svgElement("text", { x: x(index), y: 121, class: "chart-axis-label", "text-anchor": "middle" });
      label.textContent = `${Number(calendarDay.slice(0, 2))}月`;
      svg.append(label);
    });

    const appendSeries = (items, reference = false) => {
      if (!items.some((item) => validNumber(item.value))) return;
      const commands = [];
      let pathOpen = false;
      items.forEach((item, index) => {
        if (!validNumber(item.value)) {
          pathOpen = false;
          return;
        }
        commands.push(`${pathOpen ? "L" : "M"}${x(index).toFixed(2)},${y(item.value).toFixed(2)}`);
        pathOpen = true;
      });
      svg.append(svgElement("path", {
        d: commands.join(" "),
        stroke: "#398d7c",
        class: `chart-line daily-humidity-line${reference ? " chart-reference-series" : ""}`,
      }));
    };
    appendSeries(referenceSeries, true);
    appendSeries(series);
  }

  function activeReferenceRecord() {
    if (!state.comparisonEnabled || !state.referenceRecord || !state.currentRecord) return null;
    return sameCell(state.referenceRecord.cell, state.currentRecord.cell) ? null : state.referenceRecord;
  }

  function updateComparisonControls() {
    const currentReady = Boolean(state.currentRecord?.climate);
    const hasReference = Boolean(state.referenceRecord?.climate);
    const currentIsReference = hasReference && sameCell(state.currentRecord?.cell, state.referenceRecord.cell);
    elements.setReference.disabled = !currentReady;
    elements.setReference.hidden = currentIsReference;
    elements.setReference.title = hasReference ? "現在の比較先を新しい基準地点に変更" : "現在の地点を比較基準に固定";
    elements.toggleComparison.hidden = !hasReference;
    elements.clearReference.hidden = !hasReference;
    elements.toggleComparison.setAttribute("aria-pressed", String(state.comparisonEnabled));
    elements.selectionState.textContent = currentIsReference ? "基準地点" : "比較先";
    if (hasReference) {
      const label = state.referenceRecord.location.placeName;
      elements.referenceShortLabel.textContent = label;
      const mode = state.comparisonEnabled ? "重ね表示中" : "重ね表示なし";
      elements.toggleComparison.title = `基準：${state.referenceRecord.location.headerLabel}｜${mode}`;
      elements.toggleComparison.setAttribute("aria-label", `${elements.toggleComparison.title}。クリックして切り替え`);
      elements.clearReference.title = `基準：${state.referenceRecord.location.headerLabel}を解除`;
    }
    const comparing = Boolean(activeReferenceRecord());
    elements.comparisonKeys.forEach((element) => { element.hidden = !comparing; });
    drawSelections();
  }

  function renderCharts(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload) {
    renderDailyTemperatureChart(dailyPayload, referenceDailyPayload);
    renderChart(
      elements.precipitationChart,
      monthlyPrecipitationTotals(climatePayload),
      referenceClimatePayload ? monthlyPrecipitationTotals(referenceClimatePayload) : null,
      "#287bb5",
      "bar",
    );
    renderDailySolarChart(dailyPayload, referenceDailyPayload);
    renderDailyHumidityChart(dailyPayload, referenceDailyPayload);
  }

  function renderMonthly(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload) {
    const averageHigh = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MAX") : Array(12).fill(FILL_VALUE);
    const averageLow = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MIN") : Array(12).fill(FILL_VALUE);
    const precipitation = monthlyPrecipitationTotals(climatePayload);
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN");
    const humidity = dataSeries(climatePayload, "RH2M");
    const referenceHigh = referenceDailyPayload ? averageDailyValuesByMonth(referenceDailyPayload, "T2M_MAX") : Array(12).fill(FILL_VALUE);
    const referenceLow = referenceDailyPayload ? averageDailyValuesByMonth(referenceDailyPayload, "T2M_MIN") : Array(12).fill(FILL_VALUE);
    const referencePrecipitation = referenceClimatePayload ? monthlyPrecipitationTotals(referenceClimatePayload) : Array(12).fill(FILL_VALUE);
    const referenceSolar = referenceClimatePayload ? dataSeries(referenceClimatePayload, "ALLSKY_SFC_SW_DWN") : {};
    const referenceHumidity = referenceClimatePayload ? dataSeries(referenceClimatePayload, "RH2M") : {};
    const comparing = Boolean(referenceClimatePayload);
    const fragment = document.createDocumentFragment();
    elements.monthlyHeading.textContent = comparing
      ? "月別の数値（比較先｜括弧内は基準との差）"
      : "月別の数値表（平均日最高・平均日最低）";

    MONTHS.forEach((month, index) => {
      const row = document.createElement("tr");
      const values = [
        MONTH_LABELS[index],
        averageHigh[index],
        averageLow[index],
        precipitation[index],
        solar[month],
        humidity[month],
      ];
      const referenceValues = [
        null,
        referenceHigh[index],
        referenceLow[index],
        referencePrecipitation[index],
        referenceSolar[month],
        referenceHumidity[month],
      ];
      const digits = [0, 1, 1, 1, 2, 1];
      values.forEach((value, cellIndex) => {
        const cell = document.createElement(cellIndex === 0 ? "th" : "td");
        if (cellIndex === 0) cell.scope = "row";
        if (cellIndex === 0) {
          cell.textContent = value;
        } else {
          cell.textContent = numberText(value, digits[cellIndex]);
          const referenceValue = referenceValues[cellIndex];
          if (comparing && validNumber(value) && validNumber(referenceValue)) {
            const delta = document.createElement("small");
            delta.className = "monthly-delta";
            delta.textContent = `(${signedNumberText(value - referenceValue, digits[cellIndex])})`;
            cell.append(delta);
            cell.title = `比較先 ${numberText(value, digits[cellIndex])}｜基準 ${numberText(referenceValue, digits[cellIndex])}｜差 ${signedNumberText(value - referenceValue, digits[cellIndex])}`;
          }
        }
        row.append(cell);
      });
      fragment.append(row);
    });

    elements.monthlyBody.replaceChildren(fragment);
  }

  function renderPayload(climatePayload, dailyPayload, referenceClimatePayload = null, referenceDailyPayload = null) {
    const temperature = dataSeries(climatePayload, "T2M").ANN;
    const precipitation = dataSeries(climatePayload, "PRECTOTCORR").ANN;
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const humidity = dataSeries(climatePayload, "RH2M").ANN;
    const referenceTemperature = dataSeries(referenceClimatePayload, "T2M").ANN;
    const referencePrecipitationDaily = dataSeries(referenceClimatePayload, "PRECTOTCORR").ANN;
    const referenceSolar = dataSeries(referenceClimatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const referenceHumidity = dataSeries(referenceClimatePayload, "RH2M").ANN;
    const annualPrecipitation = validNumber(precipitation) ? precipitation * AVERAGE_DAYS_PER_YEAR : FILL_VALUE;
    const referenceAnnualPrecipitation = validNumber(referencePrecipitationDaily)
      ? referencePrecipitationDaily * AVERAGE_DAYS_PER_YEAR
      : FILL_VALUE;

    setMetric(elements.annualTemperature, temperature, "℃");
    setMetricComparison(elements.annualTemperatureNote, temperature, referenceTemperature, "℃", 1, "地上2m");
    setMetric(elements.annualPrecipitation, annualPrecipitation, "mm/年", 0);
    setMetricComparison(elements.annualPrecipitationNote, annualPrecipitation, referenceAnnualPrecipitation, "mm/年", 0, "1991–2020年の年平均");
    setMetric(elements.annualSolar, solar, "MJ/㎡/日", 2);
    setMetricComparison(elements.annualSolarNote, solar, referenceSolar, "MJ/㎡/日", 2, "全天日射量・日平均");
    setMetric(elements.annualHumidity, humidity, "%");
    setMetricComparison(elements.annualHumidityNote, humidity, referenceHumidity, "%", 1, "地上2m");
    renderCharts(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload);
    renderMonthly(climatePayload, dailyPayload, referenceClimatePayload, referenceDailyPayload);
  }

  function renderCurrentPayload() {
    if (!state.currentRecord?.climate) return;
    updateComparisonControls();
    const reference = activeReferenceRecord();
    renderPayload(
      state.currentRecord.climate,
      state.currentRecord.daily,
      reference?.climate || null,
      reference?.daily || null,
    );
  }

  function setReferenceFromCurrent() {
    if (!state.currentRecord?.climate) return;
    state.referenceRecord = {
      cell: { ...state.currentRecord.cell },
      location: { ...state.currentRecord.location },
      climate: state.currentRecord.climate,
      daily: state.currentRecord.daily,
    };
    state.comparisonEnabled = true;
    renderCurrentPayload();
  }

  function toggleComparison() {
    if (!state.referenceRecord) return;
    state.comparisonEnabled = !state.comparisonEnabled;
    renderCurrentPayload();
  }

  function clearReference() {
    state.referenceRecord = null;
    state.comparisonEnabled = true;
    if (state.currentRecord?.climate) renderCurrentPayload();
    else updateComparisonControls();
  }

  function resetValues(message) {
    for (const element of [elements.annualTemperature, elements.annualPrecipitation, elements.annualSolar, elements.annualHumidity]) {
      element.textContent = "—";
    }
    elements.annualTemperatureNote.textContent = "地上2m";
    elements.annualPrecipitationNote.textContent = "1991–2020年の年平均";
    elements.annualSolarNote.textContent = "全天日射量・日平均";
    elements.annualHumidityNote.textContent = "地上2m";
    elements.monthlyHeading.textContent = "月別の数値表（平均日最高・平均日最低）";
    elements.comparisonKeys.forEach((element) => { element.hidden = true; });
    renderDailyTemperatureChart(null, null, "データを取得しています");
    renderDailySolarChart(null, null, "データを取得しています");
    renderDailyHumidityChart(null, null, "データを取得しています");
    renderChart(elements.precipitationChart, [], null, "#71827e", "line");
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-row";
    cell.textContent = message;
    row.append(cell);
    elements.monthlyBody.replaceChildren(row);
  }

  async function loadClimate(cell) {
    const cacheKey = `${cell.latitude.toFixed(1)},${cell.longitude.toFixed(1)}`;
    state.requestSerial += 1;
    const requestSerial = state.requestSerial;
    if (state.controller) state.controller.abort();
    state.controller = null;
    if (state.cache.has(cacheKey)) {
      const cached = state.cache.get(cacheKey);
      state.currentRecord = { ...state.currentRecord, cell, climate: cached.climate, daily: cached.daily };
      renderCurrentPayload();
      setStatus("取得完了", cached.daily ? "ready" : "error");
      return;
    }

    state.controller = new AbortController();
    resetValues("NASA POWERから取得しています");
    setStatus("NASA POWERへ問い合わせ中", "loading");

    try {
      const request = (url) => fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "force-cache",
        signal: state.controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const [climateResult, dailyResult] = await Promise.allSettled([
        request(powerUrl(cell)),
        request(dailyPowerUrl(cell)),
      ]);
      if (requestSerial !== state.requestSerial) return;
      if (climateResult.status !== "fulfilled" || !climateResult.value?.properties?.parameter) {
        throw climateResult.status === "rejected" ? climateResult.reason : new Error("応答形式が不正です");
      }
      const climatePayload = climateResult.value;
      const dailyPayload = dailyResult.status === "fulfilled" && dailyResult.value?.properties?.parameter
        ? dailyResult.value
        : null;
      state.cache.set(cacheKey, { climate: climatePayload, daily: dailyPayload });
      state.currentRecord = { ...state.currentRecord, cell, climate: climatePayload, daily: dailyPayload };
      renderCurrentPayload();
      const version = climatePayload?.header?.api?.version;
      const status = dailyPayload ? "取得完了" : "月別値を表示｜日別最高・最低は取得できませんでした";
      setStatus(version ? `${status}｜API ${version}` : status, dailyPayload ? "ready" : "error");
    } catch (error) {
      if (error.name === "AbortError" || requestSerial !== state.requestSerial) return;
      resetValues("データを取得できませんでした。時間をおいて再度選択してください");
      setStatus("データ取得に失敗しました", "error");
    }
  }

  function eventPoint(event) {
    const matrix = elements.map.getScreenCTM();
    if (!matrix) return null;
    const point = elements.map.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function selectFromEvent(event) {
    const point = eventPoint(event);
    if (!point || point.y < 0 || point.y > MAP_SIZE) return;
    const [longitude, latitude] = unproject(point.x, point.y);
    const cell = selectedCell(longitude, latitude);
    state.selectedCell = cell;
    updateLocation(cell);
    drawSelections();
    setResultPanelPage("overview");
    openResultPanel();
    loadClimate(cell);
  }

  function beginDrag(event) {
    if (event.button !== 0 || state.drag) return;
    const matrix = elements.map.getScreenCTM();
    if (!matrix) return;
    state.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: state.centerX,
      centerY: state.centerY,
      scaleX: Math.max(Math.abs(matrix.a), 0.0001),
      scaleY: Math.max(Math.abs(matrix.d), 0.0001),
      moved: false,
    };
    elements.map.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const deltaX = event.clientX - state.drag.startX;
    const deltaY = event.clientY - state.drag.startY;
    if (Math.hypot(deltaX, deltaY) > 5) state.drag.moved = true;
    if (!state.drag.moved) return;
    elements.map.classList.add("is-dragging");
    setView(
      state.zoom,
      state.drag.centerX - deltaX / state.drag.scaleX,
      state.drag.centerY - deltaY / state.drag.scaleY,
    );
  }

  function endDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const wasMoved = state.drag.moved;
    state.drag = null;
    elements.map.classList.remove("is-dragging");
    if (elements.map.hasPointerCapture(event.pointerId)) elements.map.releasePointerCapture(event.pointerId);
    if (!wasMoved) selectFromEvent(event);
  }

  function cancelDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    state.drag = null;
    elements.map.classList.remove("is-dragging");
  }

  function zoomFromWheel(event) {
    event.preventDefault();
    const point = eventPoint(event);
    if (!point) return;
    const oldSize = MAP_SIZE / state.zoom;
    const left = state.centerX - oldSize / 2;
    const top = state.centerY - oldSize / 2;
    const anchorX = (point.x - left) / oldSize;
    const anchorY = (point.y - top) / oldSize;
    const nextZoom = clamp(state.zoom * (event.deltaY < 0 ? 1.25 : 0.8), 1, 16);
    const nextSize = MAP_SIZE / nextZoom;
    setView(
      nextZoom,
      point.x + (0.5 - anchorX) * nextSize,
      point.y + (0.5 - anchorY) * nextSize,
    );
  }

  drawGraticule();
  drawClimateLegend();
  setView(1);
  loadWorldMap();
  elements.weatherImage.addEventListener("load", () => {
    elements.layerStatus.textContent = "表示中";
    elements.layerStatus.dataset.state = "ready";
  });
  elements.weatherImage.addEventListener("error", () => {
    elements.layerStatus.textContent = "レイヤーを読み込めませんでした";
    elements.layerStatus.dataset.state = "error";
  });
  elements.layerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!WEATHER_LAYERS[button.dataset.weatherLayer]) return;
      state.weatherLayer = button.dataset.weatherLayer;
      updateWeatherLayer();
    });
  });
  elements.layerPeriod.addEventListener("change", () => {
    if (elements.layerPeriod.value !== "annual" && !/^\d{2}$/.test(elements.layerPeriod.value)) return;
    state.weatherPeriod = elements.layerPeriod.value;
    updateWeatherLayer();
  });
  elements.weatherLayerToggle.addEventListener("change", () => {
    setWeatherVisibility(elements.weatherLayerToggle.checked);
  });
  elements.weatherLayerOpacity.addEventListener("input", () => {
    const opacity = clamp(Number(elements.weatherLayerOpacity.value) / 100, 0.2, 1);
    elements.weatherImage.style.opacity = String(opacity);
    elements.weatherLayerOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
  });
  elements.toggleLayerPanel.addEventListener("click", () => {
    const expanded = elements.layerPanel.classList.toggle("is-open");
    elements.toggleLayerPanel.setAttribute("aria-expanded", String(expanded));
  });
  elements.map.addEventListener("pointerdown", beginDrag);
  elements.map.addEventListener("pointermove", moveDrag);
  elements.map.addEventListener("pointerup", endDrag);
  elements.map.addEventListener("pointercancel", cancelDrag);
  elements.map.addEventListener("wheel", zoomFromWheel, { passive: false });
  elements.zoomIn.addEventListener("click", () => setView(state.zoom * 2));
  elements.zoomOut.addEventListener("click", () => setView(state.zoom / 2));
  elements.resetView.addEventListener("click", () => setView(1, MAP_SIZE / 2, MAP_SIZE / 2));
  elements.climateToggle.addEventListener("click", toggleClimateLayer);
  elements.setReference.addEventListener("click", setReferenceFromCurrent);
  elements.toggleComparison.addEventListener("click", toggleComparison);
  elements.clearReference.addEventListener("click", clearReference);
  elements.closeResults.addEventListener("click", closeResultPanel);
  elements.openResults.addEventListener("click", openResultPanel);
  elements.resultTabs.forEach((button) => {
    button.addEventListener("click", () => setResultPanelPage(button.dataset.resultTab));
    button.addEventListener("keydown", moveResultPanelTab);
  });
  elements.resultHeading.addEventListener("pointerdown", beginResultPanelDrag);
  elements.resultPanel.addEventListener("pointerdown", beginResultPanelResize);
  window.addEventListener("pointermove", moveResultPanelDrag);
  window.addEventListener("pointermove", moveResultPanelResize, { passive: false });
  window.addEventListener("pointerup", endResultPanelDrag);
  window.addEventListener("pointercancel", endResultPanelDrag);
  window.addEventListener("pointerup", endResultPanelResize);
  window.addEventListener("pointercancel", endResultPanelResize);
  window.addEventListener("resize", applyResultPanelPosition);
  elements.weatherImage.style.opacity = String(Number(elements.weatherLayerOpacity.value) / 100);
  updateWeatherLayer();
})();
