const form = document.getElementById("upload");
const fileInput = document.getElementById("file");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function row(cells, tag = "td") {
  const tr = document.createElement("tr");
  for (const cell of cells) tr.append(el(tag, String(cell)));
  return tr;
}

function render({ receipt, warnings }) {
  resultEl.replaceChildren();
  resultEl.append(el("h2", `${receipt.merchant} (${receipt.date})`));
  resultEl.append(el("p", `Category: ${receipt.category}`));

  const table = document.createElement("table");
  table.append(row(["Item", "Qty", "Unit price", "Total"], "th"));
  for (const item of receipt.lineItems) {
    table.append(row([item.description, item.quantity, item.unitPrice, item.total]));
  }
  table.append(row(["Subtotal", "", "", receipt.subtotal]));
  table.append(row(["Tax", "", "", receipt.tax]));
  table.append(row(["Total", "", "", `${receipt.total} ${receipt.currency}`]));
  resultEl.append(table);

  if (warnings.length > 0) resultEl.append(el("p", `Warnings: ${warnings.join(", ")}`, "warn"));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return;

  statusEl.className = "";
  statusEl.textContent = "Extracting...";
  resultEl.replaceChildren();

  const body = new FormData();
  body.append("file", file);
  try {
    const res = await fetch("/v1/receipts", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) {
      statusEl.className = "error";
      statusEl.textContent = data.error?.message ?? "Request failed.";
      return;
    }
    statusEl.textContent = "";
    render(data);
  } catch {
    statusEl.className = "error";
    statusEl.textContent = "Network error.";
  }
});
