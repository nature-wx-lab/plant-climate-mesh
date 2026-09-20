(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAP_SIZE = 1000;
  const MAX_LAT = 85.05112878;
  const POWER_CLIMATOLOGY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/point";
  const POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
  const PARAMETERS = ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M"];
  const DAILY_PARAMETERS = ["T2M_MAX", "T2M_MIN"];
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

  function updateLocation(cell) {
    const strong = document.createElement("strong");
    strong.textContent = `選択枠：${cell.latMin}°〜${cell.latMax}° / ${cell.lonMin}°〜${cell.lonMax}°`;
    const span = document.createElement("span");
    span.textContent = `取得点：${coordinateLabel(cell.latitude, "N", "S")}, ${coordinateLabel(cell.longitude, "E", "W")}`;
    const note = document.createElement("small");
    note.textContent = "枠は地点選択用。値は円内・枠内平均ではなく、中心点を含むPOWER元格子の代表値です。";
    elements.locationSummary.replaceChildren(strong, span, note);
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

  function renderDailyTemperatureChart(payload, emptyMessage = "日別最高・最低を取得できませんでした") {
    const svg = elements.temperatureChart;
    svg.replaceChildren();
    if (!payload) {
      const empty = svgElement("text", { x: 180, y: 66, class: "chart-empty" });
      empty.textContent = emptyMessage;
      svg.append(empty);
      return;
    }

    const maximumSeries = averageByCalendarDay(payload, "T2M_MAX");
    const minimumSeries = averageByCalendarDay(payload, "T2M_MIN");
    const values = [...maximumSeries, ...minimumSeries].map((item) => item.value).filter(validNumber);
    if (!values.length) {
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
    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const padding = Math.max((rawMaximum - rawMinimum) * 0.08, 0.5);
    const minimum = rawMinimum - padding;
    const maximum = rawMaximum + padding;
    const x = (index) => left + (index / (maximumSeries.length - 1)) * width;
    const y = (value) => top + ((maximum - value) / (maximum - minimum)) * height;

    for (let index = 0; index <= 2; index += 1) {
      const fraction = index / 2;
      const lineY = top + fraction * height;
      const gridline = svgElement("line", { x1: left, y1: lineY, x2: left + width, y2: lineY, class: "chart-gridline" });
      const label = svgElement("text", { x: left - 5, y: lineY + 3, class: "chart-axis-label", "text-anchor": "end" });
      label.textContent = (maximum - fraction * (maximum - minimum)).toFixed(1);
      svg.append(gridline, label);
    }

    ["0101", "0301", "0501", "0701", "0901", "1101"].forEach((calendarDay) => {
      const index = maximumSeries.findIndex((item) => item.calendarDay === calendarDay);
      const label = svgElement("text", { x: x(index), y: 121, class: "chart-axis-label", "text-anchor": "middle" });
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

  function renderCharts(climatePayload, dailyPayload) {
    renderDailyTemperatureChart(dailyPayload);
    renderChart(elements.precipitationChart, monthlyValues(climatePayload, "PRECTOTCORR"), "#287bb5", "bar");
    renderChart(elements.solarChart, monthlyValues(climatePayload, "ALLSKY_SFC_SW_DWN"), "#d99516", "line");
    renderChart(elements.humidityChart, monthlyValues(climatePayload, "RH2M"), "#398d7c", "line");
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

  function renderPayload(climatePayload, dailyPayload) {
    const temperature = dataSeries(climatePayload, "T2M").ANN;
    const precipitation = dataSeries(climatePayload, "PRECTOTCORR").ANN;
    const solar = dataSeries(climatePayload, "ALLSKY_SFC_SW_DWN").ANN;
    const humidity = dataSeries(climatePayload, "RH2M").ANN;

    setMetric(elements.annualTemperature, temperature, "℃");
    setMetric(elements.annualPrecipitation, precipitation, "mm/日", 2);
    elements.annualPrecipitationNote.textContent = validNumber(precipitation)
      ? `日平均｜年換算 約${Math.round(precipitation * 365.25).toLocaleString("ja-JP")} mm`
      : "日平均";
    setMetric(elements.annualSolar, solar, "MJ/㎡/日", 2);
    setMetric(elements.annualHumidity, humidity, "%");
    renderCharts(climatePayload, dailyPayload);
    renderMonthly(climatePayload);
  }

  function resetValues(message) {
    for (const element of [elements.annualTemperature, elements.annualPrecipitation, elements.annualSolar, elements.annualHumidity]) {
      element.textContent = "—";
    }
    elements.annualPrecipitationNote.textContent = "日平均";
    renderDailyTemperatureChart(null, "データを取得しています");
    for (const chart of [elements.precipitationChart, elements.solarChart, elements.humidityChart]) renderChart(chart, [], "#71827e", "line");
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
  setView(1);
  loadWorldMap();
  elements.map.addEventListener("pointerdown", beginDrag);
  elements.map.addEventListener("pointermove", moveDrag);
  elements.map.addEventListener("pointerup", endDrag);
  elements.map.addEventListener("pointercancel", cancelDrag);
  elements.map.addEventListener("wheel", zoomFromWheel, { passive: false });
  elements.zoomIn.addEventListener("click", () => setView(state.zoom * 2));
  elements.zoomOut.addEventListener("click", () => setView(state.zoom / 2));
  elements.resetView.addEventListener("click", () => setView(1, MAP_SIZE / 2, MAP_SIZE / 2));
  elements.closeResults.addEventListener("click", closeResultPanel);
  elements.openResults.addEventListener("click", openResultPanel);
})();
