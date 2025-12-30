const form = document.getElementById("clean-form");
const input = document.getElementById("url-input");
const statusEl = document.getElementById("status");
const expandedEl = document.getElementById("expanded-url");
const cleanedEl = document.getElementById("cleaned-url");
const asinEl = document.getElementById("asin");
const removedEl = document.getElementById("removed");
const submitBtn = document.getElementById("submit-btn");

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

function setResult({ expanded_url, cleaned_url, asin, removed_params }) {
  expandedEl.textContent = expanded_url || "-";
  cleanedEl.textContent = cleaned_url || "-";
  asinEl.textContent = asin || "-";
  removedEl.textContent = removed_params && removed_params.length ? removed_params.join(", ") : "-";
}

async function handleSubmit(event) {
  event.preventDefault();

  const url = input.value.trim();
  if (!url) {
    setStatus("URLを入力してください。", "error");
    return;
  }

  setStatus("展開中...", "info");
  submitBtn.disabled = true;

  try {
    const response = await fetch(`/api/clean?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) {
      const message = data && data.error ? data.error : "処理に失敗しました。";
      setStatus(`${message} 入力URLを確認してください。`, "error");
      setResult({});
      return;
    }

    setResult(data);
    setStatus(`完了しました。リダイレクト回数: ${data.redirect_hops}`, "success");
  } catch (error) {
    setStatus("通信エラーが発生しました。時間をおいて再試行してください。", "error");
    setResult({});
  } finally {
    submitBtn.disabled = false;
  }
}

async function copyText(value) {
  if (!value || value === "-") {
    setStatus("コピーできるURLがありません。", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    setStatus("コピーしました。", "success");
  } catch {
    setStatus("コピーに失敗しました。ブラウザの権限を確認してください。", "error");
  }
}

form.addEventListener("submit", handleSubmit);

for (const button of document.querySelectorAll(".copy-btn")) {
  button.addEventListener("click", () => {
    const target = button.dataset.copy;
    if (target === "expanded") {
      copyText(expandedEl.textContent);
    } else if (target === "cleaned") {
      copyText(cleanedEl.textContent);
    }
  });
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSubmit(event);
  }
});
