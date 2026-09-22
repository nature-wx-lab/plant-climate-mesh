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
    annualPrecipitation: document.getElementById("annualPrecipitation"),
    annualPrecipitationNote: document.getElementById("annualPrecipitationNote"),
    annualSolar: document.getElementById("annualSolar"),
    annualHumidity: document.getElementById("annualHumidity"),
    monthlyBody: document.getElementById("monthlyBody"),
    temperatureChart: document.getElementById("temperatureChart"),
    precipitationChart: document.getElementById("precipitationChart"),
    solarChart: document.getElementById("solarChart"),
    humidityChart: document.getElementById("humidityChart"),
    resultPanel: document.getElementById("resultPanel"),
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
    climateVisible: false,
    weatherLayer: "temperature",
    weatherPeriod: "annual",
    weatherVisible: true,
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
    if (state.selectedCell) drawSelection(state.selectedCell);
  }

  function openResultPanel() {
    elements.resultPanel.hidden = false;
    elements.openResults.hidden = true;
    elements.openResults.setAttribute("aria-expanded", "true");
    elements.closeResults.setAttribute("aria-expanded", "true");
  }

  function closeResultPanel() {
    elements.resultPanel.hidden = true;
    elements.openResults.hidden = false;
    elements.openResults.setAttribute("aria-expanded", "false");
    elements.closeResults.setAttribute("aria-expanded", "false");
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

  function drawSelection(cell) {
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
        class: "selection-cell",
      }));
      copies.push(svgElement("circle", {
        cx: centerX + offset,
        cy: centerY,
        r: 2.2 / state.zoom,
        class: "selection-point",
      }));
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

  function updateLocation(cell) {
    const strong = document.createElement("strong");
    strong.textContent = "気象格子：約0.5°×0.625°（橙枠）";
    const span = document.createElement("span");
    span.textContent = `格子中心：${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
    const country = countryAt(cell.longitude, cell.latitude);
    const place = document.createElement("span");
    place.className = "place-summary";
    place.textContent = country
      ? `国・地域：${country.properties.name}｜首都：${country.properties.capital || "—"}`
      : "国・地域：海上｜首都：—";
    const note = document.createElement("small");
    note.textContent = "気温・降水・相対湿度は橙枠に対応する元格子の空間平均です。日射は中心点に対応する別の1°×1°格子です。";
    elements.locationSummary.replaceChildren(strong, span, place, note);
    elements.selectionState.textContent = "気象格子選択済み";
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

  function dataSeries(payload, key) {
    const series = payload?.properties?.parameter?.[key];
    return series && typeof series === "object" ? series : {};
  }

  function renderChart(svg, values, color, type) {
    svg.replaceChildren();
    const validValues = values.filter(validNumber);
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
      const barWidth = Math.max(5, width / 17);
      values.forEach((value, index) => {
        if (!validNumber(value)) return;
        svg.append(svgElement("rect", {
          x: x(index) - barWidth / 2,
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

  function renderDailyTemperatureChart(payload, emptyMessage = "日別最高・最低を取得できませんでした") {
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
    const values = [...maximumSeries, ...minimumSeries].map((item) => item.value).filter(validNumber);
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

    const appendSeries = (series, color) => {
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
      svg.append(svgElement("path", { d: commands.join(" "), stroke: color, class: "chart-line daily-temperature-line" }));
    };

    appendSeries(maximumSeries, "#d4513e");
    appendSeries(minimumSeries, "#287bb5");
  }

  function renderDailySolarChart(payload, emptyMessage = "日別日射量を取得できませんでした") {
    const svg = elements.solarChart;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const series = averageByCalendarDay(payload, "ALLSKY_SFC_SW_DWN");
    const values = series.map((item) => item.value).filter(validNumber);
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
    svg.append(svgElement("path", { d: commands.join(" "), stroke: "#d99516", class: "chart-line daily-solar-line" }));
  }

  function renderDailyHumidityChart(payload, emptyMessage = "日別相対湿度を取得できませんでした") {
    const svg = elements.humidityChart;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const series = averageByCalendarDay(payload, "RH2M");
    const values = series.map((item) => item.value).filter(validNumber);
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
    svg.append(svgElement("path", { d: commands.join(" "), stroke: "#398d7c", class: "chart-line daily-humidity-line" }));
  }

  function renderCharts(climatePayload, dailyPayload) {
    renderDailyTemperatureChart(dailyPayload);
    renderChart(elements.precipitationChart, monthlyPrecipitationTotals(climatePayload), "#287bb5", "bar");
    renderDailySolarChart(dailyPayload);
    renderDailyHumidityChart(dailyPayload);
  }

  function renderMonthly(climatePayload, dailyPayload) {
    const averageHigh = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MAX") : Array(12).fill(FILL_VALUE);
    const averageLow = dailyPayload ? averageDailyValuesByMonth(dailyPayload, "T2M_MIN") : Array(12).fill(FILL_VALUE);
    const precipitation = monthlyPrecipitationTotals(climatePayload);
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN");
    const humidity = dataSeries(climatePayload, "RH2M");
    const fragment = document.createDocumentFragment();

    MONTHS.forEach((month, index) => {
      const row = document.createElement("tr");
      const values = [
        MONTH_LABELS[index],
        numberText(averageHigh[index], 1),
        numberText(averageLow[index], 1),
        numberText(precipitation[index], 1),
        numberText(solar[month], 2),
        numberText(humidity[month], 1),
      ];
      values.forEach((value, cellIndex) => {
        const cell = document.createElement(cellIndex === 0 ? "th" : "td");
        if (cellIndex === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      fragment.append(row);
    });

    elements.monthlyBody.replaceChildren(fragment);
  }

  function renderPayload(climatePayload, dailyPayload) {
    const temperature = dataSeries(climatePayload, "T2M").ANN;
    const precipitation = dataSeries(climatePayload, "PRECTOTCORR").ANN;
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const humidity = dataSeries(climatePayload, "RH2M").ANN;

    setMetric(elements.annualTemperature, temperature, "℃");
    setMetric(elements.annualPrecipitation, validNumber(precipitation) ? precipitation * AVERAGE_DAYS_PER_YEAR : FILL_VALUE, "mm/年", 0);
    elements.annualPrecipitationNote.textContent = "1991–2020年の年平均";
    setMetric(elements.annualSolar, solar, "MJ/㎡/日", 2);
    setMetric(elements.annualHumidity, humidity, "%");
    renderCharts(climatePayload, dailyPayload);
    renderMonthly(climatePayload, dailyPayload);
  }

  function resetValues(message) {
    for (const element of [elements.annualTemperature, elements.annualPrecipitation, elements.annualSolar, elements.annualHumidity]) {
      element.textContent = "—";
    }
    elements.annualPrecipitationNote.textContent = "1991–2020年の年平均";
    renderDailyTemperatureChart(null, "データを取得しています");
    renderDailySolarChart(null, "データを取得しています");
    renderDailyHumidityChart(null, "データを取得しています");
    renderChart(elements.precipitationChart, [], "#71827e", "line");
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
    if (state.cache.has(cacheKey)) {
      const cached = state.cache.get(cacheKey);
      renderPayload(cached.climate, cached.daily);
      setStatus("取得済みデータを表示", "ready");
      return;
    }

    state.requestSerial += 1;
    const requestSerial = state.requestSerial;
    if (state.controller) state.controller.abort();
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
      if (dailyPayload) state.cache.set(cacheKey, { climate: climatePayload, daily: dailyPayload });
      renderPayload(climatePayload, dailyPayload);
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
    drawSelection(cell);
    updateLocation(cell);
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
  elements.closeResults.addEventListener("click", closeResultPanel);
  elements.openResults.addEventListener("click", openResultPanel);
  elements.weatherImage.style.opacity = String(Number(elements.weatherLayerOpacity.value) / 100);
  updateWeatherLayer();
})();
