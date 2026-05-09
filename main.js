const API_BASE = "https://formula-ocr-worker.ymcss.workers.dev";

const imageInput = document.getElementById("imageInput");
const previewList = document.getElementById("previewList");
const recognizeBtn = document.getElementById("recognizeBtn");
const resultList = document.getElementById("resultList");
const exportWordBtn = document.getElementById("exportWordBtn");

const statusText = document.getElementById("statusText");
const usageText = document.getElementById("usageText");

const showVipBtn = document.getElementById("showVipBtn");
const vipModal = document.getElementById("vipModal");
const closeVipBtn = document.getElementById("closeVipBtn");
const activateBtn = document.getElementById("activateBtn");
const vipCodeInput = document.getElementById("vipCodeInput");
const vipMsg = document.getElementById("vipMsg");

let selectedFiles = [];
let currentResults = [];

function getDeviceId() {
  let id = localStorage.getItem("formula_device_id");

  if (!id) {
    if (crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = `${Date.now()}-${Math.random()}`;
    }

    localStorage.setItem("formula_device_id", id);
  }

  return id;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || "请求失败");
  }

  return data;
}

async function loadStatus() {
  try {
    const deviceId = getDeviceId();
    const data = await fetchJson(`${API_BASE}/api/status?deviceId=${encodeURIComponent(deviceId)}`);

    if (data.vip) {
      statusText.textContent = "会员状态：已解锁";
      usageText.textContent = `会员到期时间：${new Date(data.vipExpiresAt).toLocaleString()}`;
    } else {
      statusText.textContent = "会员状态：免费用户";
      usageText.textContent = `今日免费次数：${data.used}/${data.freeLimit}，剩余 ${data.remaining} 次`;
    }
  } catch (e) {
    statusText.textContent = "状态加载失败";
    usageText.textContent = e.message;
  }
}

imageInput.addEventListener("change", () => {
  selectedFiles = Array.from(imageInput.files || []);
  currentResults = [];
  renderPreviews();
  renderResults();
});

function renderPreviews() {
  previewList.innerHTML = "";

  selectedFiles.forEach((file) => {
    const div = document.createElement("div");
    div.className = "preview-item";

    div.innerHTML = `
      <img src="${URL.createObjectURL(file)}" alt="${escapeHtml(file.name)}">
      <p>${escapeHtml(file.name)}</p>
    `;

    previewList.appendChild(div);
  });
}

recognizeBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    alert("请先选择公式图片");
    return;
  }

  const form = new FormData();
  form.append("deviceId", getDeviceId());

  selectedFiles.forEach((file) => {
    form.append("images", file, file.name);
  });

  try {
    recognizeBtn.disabled = true;
    recognizeBtn.textContent = "识别中，免费 CPU 可能较慢...";

    const data = await fetchJson(`${API_BASE}/api/recognize`, {
      method: "POST",
      body: form,
    });

    currentResults = data.results || [];
    renderResults();
    await loadStatus();
  } catch (e) {
    if (e.message.includes("免费用户") || e.message.includes("最多识别")) {
      vipModal.classList.remove("hidden");
    }

    alert(e.message);
  } finally {
    recognizeBtn.disabled = false;
    recognizeBtn.textContent = "开始识别";
  }
});

function renderResults() {
  if (!currentResults.length) {
    resultList.className = "result-list empty";
    resultList.textContent = "暂无结果";
    return;
  }

  resultList.className = "result-list";
  resultList.innerHTML = "";

  currentResults.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "result-item";

    if (!item.ok) {
      div.innerHTML = `
        <div class="result-head">
          <strong>${escapeHtml(item.name)}</strong>
          <span>识别失败</span>
        </div>
        <p class="muted">${escapeHtml(item.error || "未知错误")}</p>
      `;

      resultList.appendChild(div);
      return;
    }

    const latex = item.latex || "";

    div.innerHTML = `
      <div class="result-head">
        <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
        <span>识别成功</span>
      </div>

      <textarea class="latex-box" data-index="${index}">${escapeHtml(latex)}</textarea>

      <div class="formula-preview" id="preview-${index}"></div>

      <div class="btn-row">
        <button data-action="copy-latex" data-index="${index}">复制 LaTeX</button>
        <button data-action="copy-word" data-index="${index}">复制 Word 公式</button>
      </div>
    `;

    resultList.appendChild(div);

    const preview = document.getElementById(`preview-${index}`);

    try {
      katex.render(latex, preview, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      preview.textContent = latex;
    }
  });
}

resultList.addEventListener("input", (event) => {
  if (!event.target.classList.contains("latex-box")) return;

  const index = Number(event.target.dataset.index);
  currentResults[index].latex = event.target.value;

  const preview = document.getElementById(`preview-${index}`);
  preview.innerHTML = "";

  try {
    katex.render(event.target.value, preview, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    preview.textContent = event.target.value;
  }
});

resultList.addEventListener("click", async (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;

  const index = Number(btn.dataset.index);
  const latex = currentResults[index]?.latex || "";

  if (!latex.trim()) {
    alert("没有可复制的公式");
    return;
  }

  await navigator.clipboard.writeText(latex);

  if (btn.dataset.action === "copy-word") {
    alert("已复制。打开 Word，按 Alt + =，然后粘贴。");
  } else {
    alert("已复制 LaTeX");
  }
});

showVipBtn.addEventListener("click", () => {
  vipModal.classList.remove("hidden");
});

closeVipBtn.addEventListener("click", () => {
  vipModal.classList.add("hidden");
});

activateBtn.addEventListener("click", async () => {
  const code = vipCodeInput.value.trim();

  if (!code) {
    vipMsg.textContent = "请输入激活码";
    return;
  }

  try {
    activateBtn.disabled = true;
    vipMsg.textContent = "正在激活...";

    const data = await fetchJson(`${API_BASE}/api/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        code,
      }),
    });

    vipMsg.textContent = `激活成功，到期时间：${new Date(data.vipExpiresAt).toLocaleString()}`;

    await loadStatus();

    setTimeout(() => {
      vipModal.classList.add("hidden");
    }, 1000);
  } catch (e) {
    vipMsg.textContent = e.message;
  } finally {
    activateBtn.disabled = false;
  }
});

exportWordBtn.addEventListener("click", () => {
  const successResults = currentResults.filter((item) => item.ok && item.latex);

  if (!successResults.length) {
    alert("没有可导出的结果");
    return;
  }

  let html = `
    <html>
    <head>
      <meta charset="utf-8">
      <title>公式识别结果</title>
    </head>
    <body>
      <h1>公式识别结果</h1>
      <p>说明：复杂公式建议复制 LaTeX 后，在 Word 中按 Alt + = 粘贴使用。</p>
  `;

  successResults.forEach((item, index) => {
    html += `
      <h2>公式 ${index + 1}</h2>
      <p><strong>图片：</strong>${escapeHtml(item.name)}</p>
      <p><strong>LaTeX：</strong></p>
      <pre>${escapeHtml(item.latex)}</pre>
    `;
  });

  html += `
    </body>
    </html>
  `;

  const blob = new Blob([html], {
    type: "application/msword;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "公式识别结果.doc";
  a.click();

  URL.revokeObjectURL(url);
});

loadStatus();