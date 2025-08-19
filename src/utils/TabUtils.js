export function getDomain(url = "") {
  try {
    return new URL(url).hostname || "";
  } catch {
    return "";
  }
}

export function sanitizeTitle(title = "") {
  return String(title || "").trim();
}

export function batch(arr = [], size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
