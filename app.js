(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAP_SIZE = 1000;
  const MAX_LAT = 85.05112878;
  const POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/point";
  const PARAMETERS = ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const FILL_VALUE = -999;

  const elements = {
    map: document.getElementById("worldMap"),
    graticule: document.getElementById("graticuleLayer"),
    land: document.getElementById("landLayer"),
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
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    resetView: document.getElementById("resetView"),
  };

  const state = {
    zoom: 1,
    centerX: MAP_SIZE / 2,
    centerY: MAP_SIZE / 2,
    requestSerial: 0,
    controller: null,
    cache: new Map(),
    selectedCell: null,
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function project(longitude, latitude) {
    const safeLatitude = clamp(latitude, -MAX_LAT, MAX_LAT);
    const x = ((longitude + 180) / 360) * MAP_SIZE;
    const sine = Math.sin((safeLatitude * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * MAP_SIZE;
    return [x, y];
  }

  function unproject(x, y) {
    const longitude = (x / MAP_SIZE) * 360 - 180;
    const mercator = Math.PI - (2 * Math.PI * y) / MAP_SIZE;
    const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
    return [clamp(longitude, -180, 180), clamp(latitude, -MAX_LAT, MAX_LAT)];
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
    state.centerX = clamp(centerX, size / 2, MAP_SIZE - size / 2);
    state.centerY = clamp(centerY, size / 2, MAP_SIZE - size / 2);
    elements.map.setAttribute("viewBox", `${state.centerX - size / 2} ${state.centerY - size / 2} ${size} ${size}`);
    elements.zoomOut.disabled = state.zoom === 1;
    elements.zoomIn.disabled = state.zoom === 16;
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
      const response = await fetch("./data/world-110m.geojson", {
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const collection = await response.json();
      if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        throw new Error("地図データ形式が不正です");
      }
      const fragment = document.createDocumentFragment();
      for (const feature of collection.features) {
        const pathData = geometryToPath(feature.geometry);
        if (pathData) fragment.append(svgElement("path", { d: pathData, class: "land", "fill-rule": "evenodd" }));
      }
      elements.land.replaceChildren(fragment);
    } catch (error) {
      setStatus("境界線を読み込めませんでした。格子選択は利用できます", "error");
    }
  }

  function selectedCell(longitude, latitude) {
    const lonMin = Math.min(179, Math.max(-180, Math.floor(longitude)));
    const latMin = Math.min(84, Math.max(-85, Math.floor(latitude)));
    return {
      lonMin,
      lonMax: lonMin + 1,
      latMin,
      latMax: latMin + 1,
      longitude: lonMin + 0.5,
      latitude: latMin + 0.5,
    };
  }

  function drawSelection(cell) {
    const [left, top] = project(cell.lonMin, cell.latMax);
    const [right, bottom] = project(cell.lonMax, cell.latMin);
    const [centerX, centerY] = project(cell.longitude, cell.latitude);
    const rect = svgElement("rect", {
      x: left,
      y: top,
      width: Math.max(0.2, right - left),
      height: Math.max(0.2, bottom - top),
      class: "selection-cell",
    });
    const marker = svgElement("circle", { cx: centerX, cy: centerY, r: 4.5, class: "selection-cross" });
    elements.selection.replaceChildren(rect, marker);
    return [centerX, centerY];
  }

  function coordinateLabel(value, positive, negative) {
    const direction = value >= 0 ? positive : negative;
    return `${Math.abs(value).toFixed(2)}°${direction}`;
  }

  function updateLocation(cell) {
    const strong = document.createElement("strong");
    strong.textContent = `選択枠：${cell.latMin}°〜${cell.latMax}° / ${cell.lonMin}°〜${cell.lonMax}°`;
    const span = document.createElement("span");
    span.textContent = `取得点：${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
    elements.locationSummary.replaceChildren(strong, span);
    elements.selectionState.textContent = "地点選択済み";
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
    return `${POWER_ENDPOINT}?${query.toString()}`;
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

  function renderMonthly(payload) {
    const temperature = dataSeries(payload, "T2M");
    const precipitation = dataSeries(payload, "PRECTOTCORR");
    const solar = dataSeries(payload, "ALLSKY_SFC_SW_DWN");
    const humidity = dataSeries(payload, "RH2M");
    const fragment = document.createDocumentFragment();

    MONTHS.forEach((month, index) => {
      const row = document.createElement("tr");
      const values = [
        MONTH_LABELS[index],
        numberText(temperature[month], 1),
        numberText(precipitation[month], 2),
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

  function renderPayload(payload) {
    const temperature = dataSeries(payload, "T2M").ANN;
    const precipitation = dataSeries(payload, "PRECTOTCORR").ANN;
    const solar = dataSeries(payload, "ALLSKY_SFC_SW_DWN").ANN;
    const humidity = dataSeries(payload, "RH2M").ANN;

    setMetric(elements.annualTemperature, temperature, "℃");
    setMetric(elements.annualPrecipitation, precipitation, "mm/日", 2);
    elements.annualPrecipitationNote.textContent = validNumber(precipitation)
      ? `日平均｜年換算 約${Math.round(precipitation * 365.25).toLocaleString("ja-JP")} mm`
      : "日平均";
    setMetric(elements.annualSolar, solar, "MJ/㎡/日", 2);
    setMetric(elements.annualHumidity, humidity, "%");
    renderMonthly(payload);
  }

  function resetValues(message) {
    for (const element of [elements.annualTemperature, elements.annualPrecipitation, elements.annualSolar, elements.annualHumidity]) {
      element.textContent = "—";
    }
    elements.annualPrecipitationNote.textContent = "日平均";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-row";
    cell.textContent = message;
    row.append(cell);
    elements.monthlyBody.replaceChildren(row);
  }

  async function loadClimate(cell) {
    const cacheKey = `${cell.latitude.toFixed(1)},${cell.longitude.toFixed(1)}`;
    if (state.cache.has(cacheKey)) {
      renderPayload(state.cache.get(cacheKey));
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
      const response = await fetch(powerUrl(cell), {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "force-cache",
        signal: state.controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (requestSerial !== state.requestSerial) return;
      if (!payload?.properties?.parameter) throw new Error("応答形式が不正です");
      state.cache.set(cacheKey, payload);
      renderPayload(payload);
      const version = payload?.header?.api?.version;
      setStatus(version ? `取得完了｜API ${version}` : "取得完了", "ready");
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
    if (event.button !== 0) return;
    const point = eventPoint(event);
    if (!point || point.x < 0 || point.x > MAP_SIZE || point.y < 0 || point.y > MAP_SIZE) return;
    const [longitude, latitude] = unproject(point.x, point.y);
    const cell = selectedCell(longitude, latitude);
    state.selectedCell = cell;
    const [centerX, centerY] = drawSelection(cell);
    updateLocation(cell);
    if (state.zoom < 8) setView(8, centerX, centerY);
    loadClimate(cell);
  }

  drawGraticule();
  setView(1);
  loadWorldMap();
  elements.map.addEventListener("pointerup", selectFromEvent);
  elements.zoomIn.addEventListener("click", () => setView(state.zoom * 2));
  elements.zoomOut.addEventListener("click", () => setView(state.zoom / 2));
  elements.resetView.addEventListener("click", () => setView(1, MAP_SIZE / 2, MAP_SIZE / 2));
})();
