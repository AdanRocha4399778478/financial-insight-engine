import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");


const filePath = process.argv[2];

if (!filePath) {
  console.error("Informe o caminho do arquivo XLSX.");
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const rows = XLSX.utils.sheet_to_json(sheet, {
  defval: null,
  raw: false,
});

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCounterparty(value) {
  return normalize(String(value ?? "").replace(/\s+\d{2}\/\d{2}\s*$/, ""));
}

function counterpartyFromDescription(description) {
  const raw = String(description ?? "").trim();

  const patterns = [
    /^PIX\s+QR\s+CODE\s+DINAMICO\s+DES:\s*(.+)$/i,
    /^PIX\s+QR\s+CODE\s+ESTATICO\s+DES:\s*(.+)$/i,
    /^PIX\s+ENVIADO\s+DES:\s*(.+)$/i,
    /^PIX\s+RECEBIDO\s+REM:\s*(.+)$/i,
    /^TED-TRANSF\s+ELET\s+DISPON\s+REMET\.\s*(.+)$/i,
    /^COMPRA\s+CARTAO\s+VISA\s+(.+)$/i,
    /^CARTAO\s+VISA\s+ELECTRON\s+(.+)$/i,
    /^PAGTO\s+ELETRON\s+COBRANCA\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const candidate = cleanCounterparty(match[1]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function direction(description) {
  const raw = normalize(description);

  if (
    raw.startsWith("PIX RECEBIDO REM ") ||
    raw.startsWith("TED TRANSF ELET DISPON REMET ") ||
    raw.startsWith("RECEBIMENTO PIX ")
  ) return "ENTRADA";

  if (
    raw.startsWith("PIX ENVIADO DES ") ||
    raw.startsWith("PIX QR CODE DINAMICO DES ") ||
    raw.startsWith("PIX QR CODE ESTATICO DES ") ||
    raw.startsWith("COMPRA CARTAO VISA ") ||
    raw.startsWith("CARTAO VISA ELECTRON ") ||
    raw.startsWith("PAGTO ELETRON COBRANCA ") ||
    raw.startsWith("PAGAMENTO PIX ") ||
    raw.startsWith("PAGAMENTO BOLETO ")
  ) return "SAIDA";

  return null;
}

function historyKey(description) {
  const cp = counterpartyFromDescription(description);
  const dir = direction(description);

  if (cp) return dir ? `${dir}|${cp}` : cp;

  const fallback = normalize(description).split(" ").slice(0, 4).join(" ");
  return dir ? `${dir}|${fallback}` : fallback;
}

const groups = new Map();

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const description = String(row["Descrição"] ?? "").trim();
  const category = String(row["Categoria"] ?? "").trim();

  if (!description || !category) continue;

  const key = historyKey(description);

  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    row: i + 2,
    description,
    category,
  });
}

const conflicts = [];

for (const [key, items] of groups) {
  const categories = [...new Set(items.map((x) => x.category))];

  if (categories.length > 1) {
    conflicts.push({
      key,
      categories,
      rows: items.map((x) => x.row),
    });
  }
}

console.log("Linhas lidas:", rows.length);
console.log("History keys unicos:", groups.size);
console.log("Conflitos:", conflicts.length);
console.log("");
console.log(JSON.stringify(conflicts, null, 2));