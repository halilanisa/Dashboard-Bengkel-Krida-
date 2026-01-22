let trendChartInstance = null;
let unitPerHariChartInstance = null;
let distribusiNamaChartInstance = null;
let stackedBarChartInstance;
let jasaPartChartInstance = null;
let dashboardLoaded = false;

const BASE_URL = "https://dashboard-bengkel-krida-production.up.railway.app/";

/* =====================
   LOAD FILTERS & FILL SELECT
==================== */
async function loadFilters() {
  const res = await fetch(`${BASE_URL}/filters`);
  const data = await res.json();

  fillSelect("filter-nama", data.nama);
  fillSelect("filter-hari", data.hari);
}

function fillSelect(id, items) {
  const select = document.getElementById(id);
  if (!select || !Array.isArray(items)) return;
  select.querySelectorAll("option:not(:first-child)").forEach(o => o.remove());

  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    select.appendChild(opt);
  });
}

function getGlobalFilters() {
  return {
    nama: document.getElementById("filter-nama")?.value,
    hari: document.getElementById("filter-hari")?.value,
    start_date: document.getElementById("startDate")?.value,
    end_date: document.getElementById("endDate")?.value
  };
}

function buildQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== "All") q.append(k, v);
  });
  return q.toString();
}

/* =====================
   REFRESH
===================== */
async function refreshData() {
  try {
    const res = await fetch(`${BASE_URL}/refresh`, {
      method: "POST"
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.detail || "Gagal refresh data");
      return;
    }

    const data = await res.json();
    alert(data.message);

    // Reload overview
    await loadOverviewData();
  } catch (err) {
    console.error("Error refresh:", err);
    alert("Gagal refresh data (check console)");
  }
}

/* =====================
   REFRESH KPB 1 & 2
===================== */
async function refreshKPB12() {
  try {
    const res = await fetch(`${BASE_URL}/refresh-kpb-12`, {
      method: "POST"
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.detail || "Gagal refresh data KPB 1 & 2");
      return;
    }

    const data = await res.json();
    alert(data.message);

    await loadKPB1Data();
  } catch (err) {
    console.error("ERROR refreshKPB12:", err);
    alert("Terjadi kesalahan saat refresh KPB");
  }
}

/* =====================
   RENDER DASHBOARD
==================== */
async function renderPage() {
  const content = document.getElementById("content");

  content.innerHTML = `
    <!-- FILTER -->
    <section class="filter-bar">
      <button id="refreshBtn" class="btn">Refresh Data</button>
      <select id="filter-nama">
        <option value="All">Semua Nama</option>
      </select>
      <select id="filter-hari">
        <option value="All">Semua Hari</option>
      </select>
      <input type="date" id="startDate">
      <input type="date" id="endDate">
    </section>

    <!-- SUMMARY -->
    <section class="grid-6" id="summary-cards">
      <div class="card summary-card">
        <h3>Total Unit Entri</h3>
        <div id="summary-total">-</div>
      </div>
      <div class="card summary-card">
        <h3>Rata-rata Unit Entri</h3>
        <div id="summary-rata">-</div>
      </div>
      <div class="card summary-card">
        <h3>Prediksi Bulan Ini</h3>
        <div id="summary-prediksi">-</div>
      </div>
      <div class="card summary-card">
        <h3>Target</h3>
        <div id="summary-target">-</div>
      </div>
      <div class="card summary-card">
        <h3>Sisa Hari</h3>
        <div id="summary-sisa-hari">-</div>
      </div>
      <div class="card summary-card">
        <h3>Persentase Pencapaian</h3>
        <div id="summary-persentase">-</div>
      </div>
    </section>

    <!-- CHARTS -->
    <section class="chart-card">
      <h3>Tren Unit Entri Harian</h3>
      <canvas id="trendChart"></canvas>
    </section>

    <section class="grid-2">
      <div class="card chart-card">
        <h3>Unit Entri Per Nama Hari</h3>
        <canvas id="unitPerHari"></canvas>
      </div>
      <div class="card chart-card">
        <h3>Unit Entri Per Mekanik</h3>
        <canvas id="distribusiNama"></canvas>
      </div>
    </section>

    <section class="grid-2">
      <div class="card chart-card">
        <h3>Distribusi Tipe Pekerjaan</h3>
        <div id="tableTipePekerjaan" style="margin-top:15px;"></div>
      </div>
      <div class="card chart-card">
        <h3>Total Jasa, Part, dan Sparepart Per Mekanik</h3>
        <canvas id="jasaPartChart"></canvas>
      </div>
    </section>
  `;

  await loadFilters();

  // Event listener langsung update saat filter diganti
  document.querySelectorAll(".filter-bar select, .filter-bar input").forEach(el => {
    el.addEventListener("change", loadOverviewData);
  });

  // Event listener untuk tombol refresh
  document.getElementById("refreshBtn")?.addEventListener("click", refreshData);

  // Load data pertama
  loadOverviewData();
}

/* =====================
   RENDER CHARTS
==================== */
function renderCharts(data) {
  // Hapus chart lama
  if (trendChartInstance) trendChartInstance.destroy();
  if (unitPerHariChartInstance) unitPerHariChartInstance.destroy();
  if (distribusiNamaChartInstance) distribusiNamaChartInstance.destroy();

  // Tren Unit Harian
  const trendCanvas = document.getElementById("trendChart");
  const trendCard = trendCanvas.parentElement;

  // SETTING UKURAN CARD DAN CANVAS
  trendCard.style.height = "450px";    
  trendCanvas.height = trendCard.clientHeight; 

  const trendCtx = document.getElementById("trendChart").getContext("2d");

  // Gradient untuk area chart (merah)
  const trendGradient = trendCtx.createLinearGradient(0, 0, 0, 300);
  trendGradient.addColorStop(0, "rgba(199,51,51,0.25)"); 
  trendGradient.addColorStop(1, "rgba(199,51,51,0)");    

  // Data chart
  const trendLabels = data.trend_harian.map(d => d.tanggal);
  const trendValues = data.trend_harian.map(d => d.jumlah);

  // Hapus chart lama kalau ada
  if (trendChartInstance) trendChartInstance.destroy();

  // Plugin hover line
  const trendHoverLine = {
    id: "trendHoverLine",
    afterDraw(chart) {
      const active = chart.tooltip?.getActiveElements();
      if (!active || !active.length) return;
      const { ctx, chartArea } = chart;
      const x = active[0].element.x;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#c73333";
      ctx.stroke();
      ctx.restore();
    }
  };

  // Buat chart baru
  trendChartInstance = new Chart(trendCtx, {
    type: "line",
    data: {
      labels: trendLabels,
      datasets: [{
        data: trendValues,
        borderColor: "#c73333",      
        backgroundColor: trendGradient,
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#c73333", 
        pointBorderColor: "#fff",
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { bottom: 30 }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#111",
          bodyColor: "#333",
          borderColor: "#c73333",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: c => `Jumlah: ${c.parsed.y}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          offset: true,  
          ticks: {
            color: "#9ca3af",
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            padding: 15    
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "#f1f5f9",
            drawBorder: false
          },
          ticks: {
            color: "#9ca3af",
            stepSize: 10
          }
        }
      }
    },
    plugins: [trendHoverLine]
  });

  // Unit Per Hari
  const unitCtx = document.getElementById("unitPerHari").getContext("2d");

  // Gradient untuk bar
  const unitGradient = unitCtx.createLinearGradient(0, 0, 0, 300);
  unitGradient.addColorStop(0, "rgba(255,159,64,0.7)");
  unitGradient.addColorStop(1, "rgba(255,159,64,0.2)");

  // Plugin untuk menampilkan angka di atas bar
  const barValuePlugin = {
    id: 'barValuePlugin',
    afterDatasetsDraw(chart) {
      const { ctx, data, scales: { x, y } } = chart;

      ctx.save();
      ctx.font = "bold 12px Arial";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((bar, index) => {
          const value = dataset.data[index];
          ctx.fillText(value, bar.x, bar.y - 5);
        });
      });

      ctx.restore();
    }
  };

  unitPerHariChartInstance = new Chart(unitCtx, {
    type: "bar",
    data: {
      labels: data.unit_per_hari.map(d => d.weekday),
      datasets: [{
        data: data.unit_per_hari.map(d => d.jumlah),
        backgroundColor: unitGradient,
        borderColor: "rgba(255,159,64,1)",
        borderWidth: 2,
        borderRadius: 8, 
        hoverBackgroundColor: "rgba(255,159,64,0.9)"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 30 } }, 
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#111",
          bodyColor: "#333",
          borderColor: "#FF9F40",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: c => `Unit: ${c.parsed.y}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#9ca3af",
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: "#f1f5f9", drawBorder: false },
          ticks: { color: "#9ca3af", stepSize: 10 }
        }
      },
      interaction: {
        mode: "index",
        intersect: false
      }
    },
    plugins: [barValuePlugin] 
  });

  // ================================
  // Distribusi Unit Per Nama
  // (Sekarang vs Lalu — DINAMIS)
  // ================================
  const ctx = document.getElementById("distribusiNama").getContext("2d");

  // ================================
  // Gradient SEKARANG (MERAH)
  // ================================
  const gradNow = ctx.createLinearGradient(0, 0, 0, 300);
  gradNow.addColorStop(0, "rgba(199,51,51,0.7)");
  gradNow.addColorStop(1, "rgba(199,51,51,0.2)");

  // ================================
  // Gradient LALU (KUNING)
  // ================================
  const gradPrev = ctx.createLinearGradient(0, 0, 0, 300);
  gradPrev.addColorStop(0, "rgba(255,183,3,0.7)");
  gradPrev.addColorStop(1, "rgba(255,183,3,0.25)");

  // ================================
  // Plugin angka kecil di atas bar
  // ================================
  const valuePlugin = {
    id: "valuePlugin",
    afterDatasetsDraw(chart) {
      const { ctx, data } = chart;
      ctx.save();
      ctx.font = "bold 10px Arial";
      ctx.fillStyle = "#374151";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      data.datasets.forEach((dataset, datasetIndex) => {
        chart.getDatasetMeta(datasetIndex).data.forEach((bar, i) => {
          const val = dataset.data[i];
          if (val > 0) {
            ctx.fillText(val, bar.x, bar.y - 4);
          }
        });
      });

      ctx.restore();
    }
  };

  // ================================
  // DATA SEKARANG
  // ================================
  const labels = data.distribusi_per_nama_sekarang.map(d => d.nama);
  const nowData = data.distribusi_per_nama_sekarang.map(d => d.jumlah);

  // ================================
  // CEK DATA LALU (hanya ada jika filter)
  // ================================
  const hasLalu =
    data.is_filter_tanggal === true &&
    Array.isArray(data.distribusi_per_nama_lalu) &&
    data.distribusi_per_nama_lalu.length > 0;

  // ================================
  // DATASETS
  // ================================
  const datasets = [
    {
      label: "Sekarang",
      data: nowData,
      backgroundColor: gradNow,
      borderColor: "#c73333",
      borderWidth: 2,
      borderRadius: 6,
      barPercentage: 0.8,
      categoryPercentage: 0.8,
      hoverBackgroundColor: "rgba(199,51,51,0.9)"
    }
  ];

  if (hasLalu) {
    const prevData = labels.map(nama => {
      const found = data.distribusi_per_nama_lalu.find(x => x.nama === nama);
      return found ? found.jumlah : 0;
    });

    datasets.push({
      label: "Lalu",
      data: prevData,
      backgroundColor: gradPrev,
      borderColor: "#FFB703",
      borderWidth: 2,
      borderRadius: 6,
      barPercentage: 0.8,
      categoryPercentage: 0.8,
      hoverBackgroundColor: "rgba(255,183,3,0.9)"
    });
  }

  // ================================
  // CHART
  // ================================
  distribusiNamaChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { bottom: 24 }
      },
      plugins: {
        legend: {
          display: false,
          labels: {
            color: "#374151",
            boxWidth: 12,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#111",
          bodyColor: "#333",
          borderColor: "#c73333",
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          titleFont: { size: 11 },
          bodyFont: { size: 10 },
          callbacks: {
            label(ctx) {
              return `${ctx.dataset.label}: ${ctx.parsed.y}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#9ca3af",
            font: { size: 10 },
            padding: 6,
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            callback(value) {
              const label = this.getLabelForValue(value);
              return label.split(" ").slice(0, 2).join(" ");
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "#f1f5f9",
            drawBorder: false
          },
          ticks: {
            color: "#9ca3af",
            font: { size: 10 },
            stepSize: 10
          }
        }
      },
      interaction: {
        mode: "index",
        intersect: false
      }
    },
    plugins: [valuePlugin]
  });

  function buildAutoTable(headers, rows) {
    let html = `<div class="table-wrapper"><table class="table"><thead><tr>`;
    headers.forEach(h => html += `<th>${h}</th>`);
    html += `</tr></thead><tbody>`;

    rows.forEach(row => {
      html += `<tr>`;
      row.forEach(cell => html += `<td>${cell}</td>`);
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
  }

  // ============================
  // KONFIGURASI JENIS PEKERJAAN
  // ============================
  const JENIS_PEKERJAAN = [
    { label: "KPB 1", key: "kpb_1" },
    { label: "KPB 2", key: "kpb_2" },
    { label: "KPB 3", key: "kpb_3" },
    { label: "KPB 4", key: "kpb_4" },
    { label: "C1/C2", key: "claim_c1___c2" },
    { label: "P Lengkap", key: "p_lengkap" },
    { label: "P Ringan", key: "p_ringan" },
    { label: "G. Oli+", key: "g_oli_plus" }
  ];

  // ============================
  // BENTUK DATA TABEL (VERTIKAL) DENGAN WARNA STATUS + SELISIH
  // ============================
  const rowsTipePekerjaan = [];

  JENIS_PEKERJAAN.forEach(j => {
    const d = data.distribusi_tipe_pekerjaan[j.key]; // ambil object pekerjaan dari dict

    let kelas = "neutral"; // default stabil
    let selisih = 0;

    if (d.lalu !== null && d.lalu !== undefined) {
      selisih = d.sekarang - d.lalu;

      if (selisih > 0) kelas = "up";
      else if (selisih < 0) kelas = "down";
    }

    // Status dengan selisih
    let statusText;
    if (d.lalu === null || d.lalu === undefined) {
      statusText = `${d.status.icon} ${d.status.status}`; // tanpa selisih
    } else if (selisih > 0) {
      statusText = `${d.status.icon} ${d.status.status} ${selisih}`;
    } else if (selisih < 0) {
      statusText = `${d.status.icon} ${d.status.status} ${Math.abs(selisih)}`;
    } else {
      statusText = `${d.status.icon} ${d.status.status}`;
    }

    const statusHTML = `<span class="delta ${kelas}">${statusText}</span>`;

    rowsTipePekerjaan.push([
      j.label,          // Jenis Pekerjaan
      d.sekarang,       // Jumlah Sekarang
      d.lalu !== null && d.lalu !== undefined ? d.lalu : "-", // Jumlah Lalu
      statusHTML        // Status + selisih
    ]);
  });

  // ============================
  // RENDER TABEL
  // ============================
  document.getElementById("tableTipePekerjaan").innerHTML = buildAutoTable(
    ["Tipe Pekerjaan", "M", "-M", "Growth"],
    rowsTipePekerjaan
  );

  // =====================
  // Horizontal Bar Chart: Total Jasa / Part / Total Sparepart (Per Mekanik)
  // =====================

  // Ambil canvas
  const jasaPartCanvas = document.getElementById("jasaPartChart");

  // Hancurkan chart lama jika ada
  if (jasaPartChartInstance) jasaPartChartInstance.destroy();

  // Warna dasar tiap kolom
  const COLORS = ["#c73333", "#FF9F40", "#FFB703"];

  // Kolom data
  const cols = ["total_jasa", "part_total", "total_sparepart"];
  const labelsJP = ["JASA", "PART", "SPAREPART"];

  // Ambil semua mekanik dari data
  const mekaniks = data.jasa_part.map(d => d.nama);

  // Buat label tiap bar: gabungkan nama mekanik + kategori
  const labelsPerMekanik = [];
  mekaniks.forEach(m => {
    // ambil maksimal 2 kata dari nama
    const namaSingkat = m.split(" ").slice(0, 2).join(" ");
    labelsJP.forEach(cat => {
      labelsPerMekanik.push(`${namaSingkat} - ${cat}`);
    });
  });

  // Buat data tiap bar: sesuai mekanik + kategori
  const dataPerMekanik = [];
  data.jasa_part.forEach(d => {
    dataPerMekanik.push(Number(d.total_jasa) || 0);
    dataPerMekanik.push(Number(d.part_total) || 0);
    dataPerMekanik.push(Number(d.total_sparepart) || 0);
  });

  // =====================
  // Plugin: Value di ujung bar (tidak keluar card)
  // =====================
  const jasaPartValuePlugin = {
    id: "jasaPartValuePlugin",
    afterDatasetsDraw(chart) {
      const { ctx, data, chartArea } = chart;
      ctx.save();
      ctx.font = "bold 12px Arial";
      ctx.fillStyle = "#333";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      data.datasets[0].data.forEach((value, i) => {
        const meta = chart.getDatasetMeta(0).data[i];
        if (!meta) return;

        const text = value.toLocaleString();
        const textWidth = ctx.measureText(text).width;

        // Posisi default (di kanan bar)
        let x = meta.x + 8;
        const y = meta.y;

        // Batasi supaya tidak keluar dari canvas/card
        const maxX = chartArea.right - textWidth - 6;
        if (x > maxX) x = maxX;

        ctx.fillText(text, x, y);
      });

      ctx.restore();
    }
  };

  // =====================
  // Buat chart baru
  // =====================
  jasaPartChartInstance = new Chart(jasaPartCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: labelsPerMekanik,  // label per mekanik + kategori
      datasets: [{
        label: "TOTAL",
        data: dataPerMekanik,
        borderWidth: 3,
        borderColor: COLORS,
        borderRadius: 8,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
        backgroundColor: function(context) {
          const index = context.dataIndex;
          const color = COLORS[index % COLORS.length];
          const chart = context.chart;
          const ctx = chart.ctx;
          const canvasWidth = chart.width;
          const grad = ctx.createLinearGradient(0, 0, canvasWidth, 0);
          grad.addColorStop(0, color + "cc");
          grad.addColorStop(1, color + "33");
          return grad;
        },
        hoverBackgroundColor: function(context) {
          const index = context.dataIndex;
          const color = COLORS[index % COLORS.length];
          return color;
        }
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 30, right: 30, top: 20, bottom: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#fff",
          titleColor: "#111",
          bodyColor: "#333",
          borderColor: "#333",
          borderWidth: 1,
          cornerRadius: 6,
          callbacks: {
            label: c => `${c.dataset.label}: ${c.parsed.x.toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grace: "15%",
          suggestedMax: Math.max(...dataPerMekanik) * 1.2,
          grid: { color: "#f1f5f9", drawBorder: false },
          ticks: {
            color: "#9ca3af",
            padding: 20,
            maxRotation: 0,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            callback: value => {
              if (value >= 1000000) return (value / 1000000).toLocaleString() + " jt";
              if (value >= 1000) return (value / 1000).toLocaleString() + " rb";
              return value.toLocaleString();
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: "#9ca3af" }
        }
      },
      hover: {
        mode: 'nearest',
        intersect: true
      }
    },
    plugins: [jasaPartValuePlugin]
  });

}

/* =====================
   LOAD OVERVIEW DATA
==================== */
async function loadOverviewData() {
  const params = buildQuery(getGlobalFilters());
  
  try {
        const res = await fetch(`${BASE_URL}/overview?${params}`);
    
    if (!res.ok) {
      console.error("Fetch error:", res.status, res.statusText);
      return;
    }

    const data = await res.json();
    console.log("Overview data:", data); 

    // Jika backend mengirim error
    if (data.message) {
      console.warn("Backend returned message:", data.message);
      ["summary-total","summary-rata","summary-sisa-hari","summary-prediksi","summary-persentase"].forEach(id => {
        document.getElementById(id).textContent = "-";
      });
      return;
    }

    // Update summary cards
    // ===== UPDATE SUMMARY TOTAL + DELTA =====
    const deltaClass =
      data.selisih > 0 ? 'up' :
      data.selisih < 0 ? 'down' : 'neutral';

    const deltaIcon =
      data.selisih > 0 ? '▲' :
      data.selisih < 0 ? '▼' : '•';

    const selisihAbs = Math.abs(data.selisih ?? 0);

    document.getElementById("summary-total").innerHTML = `
      ${data.total_sekarang?.toLocaleString() ?? "-"}
      <div class="delta ${deltaClass}">
        ${deltaIcon}
        ${selisihAbs.toLocaleString()}
        dari ${data.total_lalu?.toLocaleString() ?? 0}
      </div>
    `;

    document.getElementById("summary-rata").textContent =
      data.rata_rata_unit_entri ?? "-";

    document.getElementById("summary-target").textContent =
      data.target ?? "-";
      
    document.getElementById("summary-sisa-hari").textContent =
      data.sisa_hari ?? "-";

    document.getElementById("summary-prediksi").textContent =
      data.prediksi_bulan_ini ?? "-";

    document.getElementById("summary-persentase").textContent =
      (data.persentase_pencapaian ?? "-") + "%";

    // Render charts
    renderCharts(data);

  } catch (err) {
    console.error("Load overview failed:", err);
  }
}

function renderKPB1Page() {
  const container = document.getElementById("kpb1-page");
  if (!container) return;

  container.innerHTML = `
  <div class="dashboard">

  <section class="filter-bar mb-3">
    <button id="refreshKPB1" class="btn btn-primary">Refresh Data</button>
    <button id="downloadPotential" class="btn btn-success">Download Potential</button>
    <input type="date" id="kpb1StartDate">
    <input type="date" id="kpb1EndDate">
  </section>

    <section class="grid-3" id="summary-cards">
      <div class="card summary-card">
        <h3>Total Claim</h3>
        <div id="summary-claim">-</div>
      </div>
      <div class="card summary-card">
        <h3>Total Potential</h3>
        <div id="summary-potential">-</div>
      </div>
      <div class="card summary-card">
        <h3>Total Lost</h3>
        <div id="summary-lost">-</div>
      </div>
    </section>

    <!-- GRID 2 -->
    <div class="grid-2">
      <div>
        <div class="card chart-card mb-3">
          <h3>Customer dengan Status Claim</h3>
          <div id="table-claim" class="table-wrapper"></div>
        </div>

        <div class="card chart-card mb-3">
          <h3>Customer Dengan Status Potential</h3>
          <div id="table-potential" class="table-wrapper"></div>
        </div>
      </div>

      <div>
        <div class="card chart-card">
          <h3>Customer Dengan Status Lost</h3>
          <div id="table-lost" class="table-wrapper"></div>
        </div>

        <div class="card chart-card">
          <h3>Peta Sebaran Customer Dengan Status Potential</h3>
          <div id="mapPotential" style="height:400px;"></div>
        </div>
      </div>

    </div>
  </div>
  `;

  // EVENT
  document.getElementById("refreshKPB1").addEventListener("click", loadKPB1Data);

  document.getElementById("downloadPotential").addEventListener("click", () => {
    const startDate = document.getElementById("kpb1StartDate")?.value || "";
    const endDate   = document.getElementById("kpb1EndDate")?.value || "";

    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate)   params.append("end_date", endDate);

    window.open(
      `${BASE_URL}/kpb1/download-potential?${params.toString()}`,
      "_blank"
    );
  });

  document
    .querySelectorAll("#kpb1StartDate, #kpb1EndDate")
    .forEach(el => el.addEventListener("change", loadKPB1Data));

  // load pertama
  loadKPB1Data();
}

async function loadKPB1Data() {
  try {
    // ===============================
    // Ambil filter tanggal
    // ===============================
    const startDate = document.getElementById("kpb1StartDate")?.value || "";
    const endDate   = document.getElementById("kpb1EndDate")?.value || "";

    const params = new URLSearchParams();
    if (startDate) params.append("start_date", startDate);
    if (endDate)   params.append("end_date", endDate);

    const res = await fetch(`${BASE_URL}/kpb1?${params.toString()}`);
    if (!res.ok) throw new Error("Gagal fetch data KPB1");

    const data = await res.json();
    console.log("DATA KPB1:", data);

    // ===============================
    // SUMMARY
    // ===============================
    if (data.summary) {
      renderSummaryCards(data.summary);
    } else {
      console.warn("SUMMARY tidak ada di response API");
    }

    // ===============================
    // TABLE CLAIM
    // ===============================
    renderSimpleTable(
      "table-claim",
      ["Nama Customer", "Wiraniaga", "No Rangka", "Tanggal Service", "Status"],
      (data.claim || []).map(d => [
        d.nama_customer || "-",
        d.wiraniaga || "-",
        d.no_rangka || "-",
        d.tanggal_service || "-",
        d.status || "CLAIM"
      ])
    );

    // ===============================
    // TABLE POTENTIAL
    // ===============================
    renderSimpleTable(
      "table-potential",
      ["Nama Customer", "Wiraniaga", "No Rangka", "Kecamatan", "Usia Kendaraan (Hari)", "Status"],
      (data.potential || []).map(d => [
        d.nama_customer || "-",
        d.wiraniaga || "-",
        d.no_rangka || "-",
        d.kecamatan || "-",
        d.usia_hari || "-",
        d.status || "POTENTIAL"
      ])
    );

    // ===============================
    // TABLE LOST
    // ===============================
    renderSimpleTable(
      "table-lost",
      ["Nama Customer", "Wiraniaga", "No Rangka", "Kecamatan", "Status"],
      (data.lost || []).map(d => [
        d.nama_customer || "-",
        d.wiraniaga || "-",
        d.no_rangka || "-",
        d.kecamatan || "-",
        d.status || "LOST"
      ])
    );

    // ===============================
    // MAP POTENTIAL
    // ===============================
    renderPotentialMap(data.peta_potential || []);

  } catch (err) {
    console.error("ERROR loadKPB1Data:", err);
  }
}

function renderSimpleTable(containerId, headers, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let html = `<div class="table-wrapper"><table class="table table-bordered table-striped">
    <thead><tr>`;
  headers.forEach(h => html += `<th>${h}</th>`);
  html += `</tr></thead><tbody>`;

  if (rows.length === 0) {
    html += `<tr><td colspan="${headers.length}" class="text-center">Tidak ada data</td></tr>`;
  } else {
    rows.forEach(r => {
      html += "<tr>";
      r.forEach((c, i) => {
        // Cek kalau ini kolom terakhir (status)
        if(i === r.length - 1) {
          let statusClass = "";
          if(c === "CLAIM") statusClass = "delta up";
          else if(c === "LOST") statusClass = "delta down";
          else if(c === "POTENTIAL") statusClass = "delta neutral";
          html += `<td class="${statusClass}">${c}</td>`;
        } else {
          html += `<td>${c}</td>`;
        }
      });
      html += "</tr>";
    });

  }

  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

let mapPotential = null;

const KECAMATAN_COORD = {
  // ======================
  // KOTA BIMA
  // ======================
  "Rasanae Barat":  [-8.455, 118.715],
  "Rasanae Timur":  [-8.462, 118.742],
  "Mpunda":        [-8.447, 118.732],
  "Asakota":       [-8.480, 118.705],
  "Raba":          [-8.503, 118.755],

  // ======================
  // KABUPATEN BIMA
  // ======================
  "Woha":          [-8.580, 118.530],
  "Wera":          [-8.580, 118.680],
  "Wawo":          [-8.630, 118.550],
  "Sape":          [-8.510, 118.740],
  "Sanggar":       [-8.580, 118.500],
  "Parado":        [-8.610, 118.580],
  "Palibelo":      [-8.605, 118.600],
  "Monta":         [-8.553, 118.660],
  "Madapangga":    [-8.570, 118.620],
  "Langgudu":      [-8.590, 118.620],
  "Lambu":         [-8.590, 118.680],
  "Lambitu":       [-8.620, 118.660],
  "Donggo":        [-8.620, 118.540],
  "Bolo":          [-8.600, 118.600],
  "Belo":          [-8.600, 118.550],
  "Ambalawi":      [-8.610, 118.620],
  "Soromandi":     [-8.610, 118.520],
  "Tambora":       [-8.650, 118.600],

  // ======================
  // KABUPATEN DOMPU
  // ======================
  "Dompu":         [-8.537, 118.463],
  "Woja":          [-8.605, 118.370],
  "Hu'u":          [-8.650, 118.240],
  "Kempo":         [-8.650, 118.400],
  "Kilo":          [-8.630, 118.450],
  "Pekat":         [-8.550, 118.350],
  "Pajo":          [-8.620, 118.428],
  "Manggalewa":    [-8.680, 118.380],

  // ======================
  // KOTA MATARAM
  // ======================
  "Ampenan":       [-8.583, 116.095],
  "Mataram":       [-8.583, 116.105],
  "Cakranegara":   [-8.600, 116.110],
  "Sekarbela":     [-8.620, 116.080],
  "Selaparang":    [-8.590, 116.115],
  "Sandubaya":     [-8.610, 116.130],

  // ======================
  // KABUPATEN LOMBOK BARAT
  // ======================
  "Gerung":        [-8.695, 116.120],
  "Kediri":        [-8.655, 116.105],
  "Labuapi":       [-8.665, 116.085],
  "Kuripan":       [-8.620, 116.060],
  "Narmada":       [-8.585, 116.250],
  "Gunungsari":    [-8.555, 116.145],
  "Lingsar":       [-8.575, 116.180],
  "Sekotong":      [-8.780, 115.950],
  "Batulayar":     [-8.500, 116.070],

  // ======================
  // KABUPATEN LOMBOK TENGAH
  // ======================
  "Praya":         [-8.720, 116.280],
  "Praya Barat":   [-8.760, 116.200],
  "Praya Timur":   [-8.700, 116.350],
  "Praya Tengah":  [-8.730, 116.300],
  "Praya Barat Daya": [-8.780, 116.230],
  "Pujut":         [-8.900, 116.300],
  "Jonggat":       [-8.650, 116.300],
  "Kopang":        [-8.600, 116.350],
  "Janapria":      [-8.750, 116.350],
  "Batukliang":    [-8.650, 116.350],
  "Batukliang Utara": [-8.600, 116.300],

  // ======================
  // KABUPATEN LOMBOK TIMUR
  // ======================
  "Selong":        [-8.650, 116.530],
  "Sukamulia":     [-8.660, 116.500],
  "Suralaga":      [-8.630, 116.520],
  "Terara":        [-8.610, 116.480],
  "Aikmel":        [-8.600, 116.450],
  "Wanasaba":      [-8.550, 116.500],
  "Sambelia":      [-8.450, 116.650],
  "Suela":         [-8.600, 116.480],
  "Labuhan Haji":  [-8.660, 116.550],
  "Keruak":        [-8.780, 116.550],
  "Jerowaru":      [-8.820, 116.580],
  "Sikur":         [-8.630, 116.460],
  "Pringgabaya":   [-8.500, 116.580],
  "Pringgasela":   [-8.600, 116.480],
  "Masbagik":      [-8.630, 116.470],

  // ======================
  // KABUPATEN LOMBOK UTARA
  // ======================
  "Tanjung":       [-8.350, 116.280],
  "Gangga":        [-8.300, 116.250],
  "Kayangan":      [-8.250, 116.300],
  "Bayan":         [-8.270, 116.350],
  "Pemenang":      [-8.350, 116.100],

  // ======================
  // KABUPATEN SUMBAWA
  // ======================
  "Sumbawa":       [-8.500, 117.420],
  "Labuhan Badas": [-8.480, 117.390],
  "Unter Iwes":    [-8.500, 117.450],
  "Utan":          [-8.360, 117.300],
  "Buer":          [-8.430, 117.250],
  "Ropang":        [-8.700, 117.200],
  "Empang":        [-8.770, 117.350],
  "Tarano":        [-8.690, 117.600],
  "Plampang":      [-8.650, 117.450],
  "Moyo Hilir":    [-8.560, 117.350],
  "Moyo Hulu":     [-8.520, 117.280],
  "Moyo Utara":    [-8.450, 117.300],

  // ======================
  // KABUPATEN SUMBAWA BARAT
  // ======================
  "Taliwang":      [-8.760, 116.830],
  "Jereweh":       [-8.850, 116.780],
  "Sekongkang":    [-8.900, 116.750],
  "Maluk":         [-8.950, 116.850],
  "Poto Tano":     [-8.800, 116.900]
};


function renderPotentialMap(data) {
  if (!document.getElementById("mapPotential")) return;

  if (!mapPotential) {
    mapPotential = L.map("mapPotential").setView([-8.462, 118.727], 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap"
    }).addTo(mapPotential);
  }

  mapPotential.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) {
      mapPotential.removeLayer(layer);
    }
  });

  data.forEach(d => {
    const key = (d.kecamatan || "").trim();

    if (!KECAMATAN_COORD[key]) {
      console.warn("Koordinat tidak ada untuk:", key);
      return;
    }

    const [lat, lng] = KECAMATAN_COORD[key];

    L.circleMarker([lat, lng], {
      radius: 6 + d.jumlah,
      color: "#FF9F40",
      fillColor: "#FF9F40",
      fillOpacity: 0.6
    })
    .bindPopup(`<b>${key}</b><br>Potential: ${d.jumlah}`)
    .addTo(mapPotential);
  });

  setTimeout(() => mapPotential.invalidateSize(), 200);
}


function renderSummaryCards(summary) {
  document.getElementById("summary-claim").textContent = summary.claim || 0;
  document.getElementById("summary-potential").textContent = summary.potential || 0;
  document.getElementById("summary-lost").textContent = summary.lost || 0;
}

function showPage(pageId) {
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.style.display = 'none');

  document.getElementById(pageId).style.display = 'block';

  if (pageId === 'unit' && !dashboardLoaded) {
    dashboardLoaded = true;
    requestAnimationFrame(() => {
      setTimeout(renderPage, 50);
    });
  }

  if (pageId === 'kpb12') {
      requestAnimationFrame(() => {
        setTimeout(renderKPB1Page, 50); 
      });
  }
}

// ======================
// INITIAL LOAD
// ======================
document.addEventListener("DOMContentLoaded", () => {
    // tampilkan Home page saat pertama load
    showPage('home');
});