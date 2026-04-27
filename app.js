const state = {
  rows: [],
  topGenres: [],
};

const pairSpecs = {
  budget_vote_count: {
    label: "Budget × Vote Count",
    x: "log_budget",
    y: "log_vote_count",
    xLabel: "log10(budget)",
    yLabel: "log10(vote count)",
    colorScale: [
      [0.0, "#d5e9ff"],
      [1.0, "#012b42"],
    ],
  },
  budget_vote_average: {
    label: "Budget × Vote Average",
    x: "log_budget",
    y: "vote_average",
    xLabel: "log10(budget)",
    yLabel: "vote average",
    colorScale: [
      [0.0, "#ffdbe8"],
      [1.0, "#3d0c63"],
    ],
  },
  vote_count_vote_average: {
    label: "Vote Count × Vote Average",
    x: "log_vote_count",
    y: "vote_average",
    xLabel: "log10(vote count)",
    yLabel: "vote average",
    colorScale: [
      [0.0, "#bcffc4"],
      [1.0, "#1d4e00"],
    ],
  },
};

const genrePalette = [
  "#4e79a7",
  "#f28e2c",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc949",
  "#af7aa1",
  "#9c755f",
];

document.addEventListener("DOMContentLoaded", async () => {
  wireTabs();
  wireControls();
  await loadData();
  renderOverview();
  renderSurface();
  renderScatter();
  renderTrend();
});

function wireTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("is-active", b === button));
      panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === target));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function wireControls() {
  document.getElementById("surface-select").addEventListener("change", renderSurface);
  document.getElementById("genre-select").addEventListener("change", renderScatter);
  document.getElementById("trend-select").addEventListener("change", renderTrend);
}

async function loadData() {
  const rows = await new Promise((resolve, reject) => {
    Papa.parse("data/tmdb_movies_revenue_sample.csv", {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: reject,
    });
  });

  state.rows = rows
    .map((row) => {
      const primaryGenre = String(row.genres || "").split(", ")[0] || "Unknown";
      const budget = Number(row.budget);
      const revenue = Number(row.revenue);
      const voteCount = Number(row.vote_count);
      const voteAverage = Number(row.vote_average);
      const releaseYear = Number(row.release_year);
      const popularity = Number(row.popularity);

      if (!Number.isFinite(budget) || !Number.isFinite(revenue) || budget <= 0 || revenue <= 0) {
        return null;
      }

      return {
        ...row,
        primary_genre: primaryGenre,
        budget,
        revenue,
        vote_count: voteCount,
        vote_average: voteAverage,
        release_year: releaseYear,
        popularity,
        log_budget: Math.log10(budget),
        log_revenue: Math.log10(revenue),
        log_vote_count: Math.log10(Math.max(voteCount, 1)),
      };
    })
    .filter(Boolean);

  const genreCounts = countBy(state.rows, (d) => d.primary_genre);
  state.topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);

  populateGenreSelect();
}

function renderOverview() {
  document.getElementById("stat-movies").textContent = formatInteger(state.rows.length);
  document.getElementById("stat-budget").textContent = formatCurrency(median(state.rows.map((d) => d.budget)));
  document.getElementById("stat-revenue").textContent = formatCurrency(median(state.rows.map((d) => d.revenue)));
}

function renderSurface() {
  const pairKey = document.getElementById("surface-select").value;
  const spec = pairSpecs[pairKey];
  const { xGrid, yGrid, zGrid } = buildSurfaceGrid(state.rows, spec.x, spec.y, "log_revenue", 28, 28);

  const surfaceTrace = {
    type: "surface",
    x: xGrid,
    y: yGrid,
    z: zGrid,
    colorscale: spec.colorScale,
    hovertemplate:
      `${spec.xLabel}: %{x:.2f}<br>` +
      `${spec.yLabel}: %{y:.2f}<br>` +
      `mean log10(revenue): %{z:.2f}<extra></extra>`,
    contours: {
      z: { show: true, usecolormap: false, color: "#ffffff", width: 1 },
    },
    colorbar: {
      title: { text: "Mean<br>log10(revenue)", side: "top" },
      thickness: 16,
      len: 0.58,
      x: 0.99,
      outlinewidth: 0,
    },
  };

  Plotly.react(
    "surface-plot",
    [surfaceTrace],
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 0, r: 0, t: 20, b: 0 },
      scene: {
        bgcolor: "#ffffff",
        xaxis: axisStyle(spec.xLabel),
        yaxis: axisStyle(spec.yLabel),
        zaxis: axisStyle("log10(revenue)"),
        camera: { eye: { x: 1.45, y: 1.2, z: 0.95 } },
        aspectmode: "manual",
        aspectratio: { x: 1.12, y: 1.0, z: 0.88 },
      },
      font: { family: "Inter, sans-serif", color: "#173145" },
    },
    { responsive: true, displaylogo: false }
  );
}

function renderScatter() {
  const selectedGenre = document.getElementById("genre-select").value;
  const rows =
    selectedGenre === "All"
      ? state.rows
      : state.rows.filter((d) => d.primary_genre === selectedGenre);

  const grouped = groupBy(rows, (d) => d.primary_genre);
  const traces = Object.keys(grouped).map((genre, index) => ({
    type: "scattergl",
    mode: "markers",
    name: genre,
    x: grouped[genre].map((d) => d.log_budget),
    y: grouped[genre].map((d) => d.log_revenue),
    text: grouped[genre].map((d) => d.title),
    customdata: grouped[genre].map((d) => [d.release_year, d.vote_average, d.vote_count]),
    marker: {
      color: genrePalette[index % genrePalette.length],
      size: 8,
      opacity: selectedGenre === "All" ? 0.55 : 0.72,
      line: { width: 0 },
    },
    hovertemplate:
      "<b>%{text}</b><br>" +
      "Genre: " + genre + "<br>" +
      "Year: %{customdata[0]}<br>" +
      "Vote average: %{customdata[1]:.2f}<br>" +
      "Vote count: %{customdata[2]:,}<br>" +
      "log10(budget): %{x:.2f}<br>" +
      "log10(revenue): %{y:.2f}<extra></extra>",
  }));

  Plotly.react(
    "scatter-plot",
    traces,
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      margin: { l: 70, r: 20, t: 20, b: 60 },
      xaxis: flatAxisStyle("log10(budget)"),
      yaxis: flatAxisStyle("log10(revenue)"),
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "left",
        x: 0,
      },
      font: { family: "Inter, sans-serif", color: "#173145" },
    },
    { responsive: true, displaylogo: false }
  );
}

function renderTrend() {
  const metric = document.getElementById("trend-select").value;
  const yKey = metric === "budget" ? "log_budget" : "log_revenue";
  const yLabel = metric === "budget" ? "Median log10(budget)" : "Median log10(revenue)";

  const traces = state.topGenres.map((genre, index) => {
    const rows = state.rows.filter((d) => d.primary_genre === genre);
    const yearly = Object.entries(groupBy(rows, (d) => d.release_year))
      .map(([year, yearRows]) => ({
        year: Number(year),
        value: median(yearRows.map((d) => d[yKey])),
      }))
      .sort((a, b) => a.year - b.year);

    return {
      type: "scatter",
      mode: "lines+markers",
      name: genre,
      x: yearly.map((d) => d.year),
      y: yearly.map((d) => d.value),
      line: { width: 3, color: genrePalette[index % genrePalette.length] },
      marker: { size: 7 },
      hovertemplate: `<b>${genre}</b><br>Year: %{x}<br>${yLabel}: %{y:.2f}<extra></extra>`,
    };
  });

  Plotly.react(
    "trend-plot",
    traces,
    {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      margin: { l: 70, r: 20, t: 20, b: 60 },
      xaxis: flatAxisStyle("Release year"),
      yaxis: flatAxisStyle(yLabel),
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "left",
        x: 0,
      },
      font: { family: "Inter, sans-serif", color: "#173145" },
    },
    { responsive: true, displaylogo: false }
  );
}

function populateGenreSelect() {
  const select = document.getElementById("genre-select");
  const options = ["All", ...state.topGenres];
  select.innerHTML = options
    .map((genre) => `<option value="${genre}">${genre}</option>`)
    .join("");
}

function buildSurfaceGrid(rows, xKey, yKey, zKey, xBins, yBins) {
  const xs = rows.map((d) => d[xKey]);
  const ys = rows.map((d) => d[yKey]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const stepX = (maxX - minX) / (xBins - 1);
  const stepY = (maxY - minY) / (yBins - 1);

  const zGrid = Array.from({ length: yBins }, () => Array.from({ length: xBins }, () => null));
  const sumGrid = Array.from({ length: yBins }, () => Array.from({ length: xBins }, () => 0));
  const countGrid = Array.from({ length: yBins }, () => Array.from({ length: xBins }, () => 0));

  rows.forEach((row) => {
    const xi = clamp(Math.round((row[xKey] - minX) / stepX), 0, xBins - 1);
    const yi = clamp(Math.round((row[yKey] - minY) / stepY), 0, yBins - 1);
    sumGrid[yi][xi] += row[zKey];
    countGrid[yi][xi] += 1;
  });

  for (let yi = 0; yi < yBins; yi += 1) {
    for (let xi = 0; xi < xBins; xi += 1) {
      if (countGrid[yi][xi] > 0) {
        zGrid[yi][xi] = sumGrid[yi][xi] / countGrid[yi][xi];
      }
    }
  }

  const xValues = Array.from({ length: xBins }, (_, i) => minX + i * stepX);
  const yValues = Array.from({ length: yBins }, (_, i) => minY + i * stepY);
  const xGrid = Array.from({ length: yBins }, () => [...xValues]);
  const yGrid = yValues.map((y) => Array.from({ length: xBins }, () => y));

  return { xGrid, yGrid, zGrid };
}

function axisStyle(title) {
  return {
    title: { text: title, font: { color: "#22384d" } },
    tickfont: { color: "#53687d" },
    backgroundcolor: "#ffffff",
    gridcolor: "#dfe8f1",
    zerolinecolor: "#c7d3df",
  };
}

function flatAxisStyle(title) {
  return {
    title,
    gridcolor: "#e8eef4",
    zerolinecolor: "#c7d3df",
    linecolor: "#d0dae4",
    mirror: false,
  };
}

function groupBy(rows, accessor) {
  return rows.reduce((acc, row) => {
    const key = accessor(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function countBy(rows, accessor) {
  return rows.reduce((acc, row) => {
    const key = accessor(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
