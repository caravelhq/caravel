// Ported verbatim from client.js:3226–4161 with minor TypeScript typing.

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function fileIcon(entry: { type: string; name: string }): string {
  if (entry.type === "directory") return "📁";
  const ext = (entry.name.match(/\.([^.]+)$/) || [])[1] || "";
  const lx = ext.toLowerCase();
  if (lx === "md" || lx === "markdown" || lx === "mdx") return "📝";
  if (lx === "ts" || lx === "js" || lx === "mjs") return "📦";
  if (lx === "json") return "📋";
  if (lx === "sh" || lx === "bash") return "⚙️";
  if (lx === "yml" || lx === "yaml") return "📑";
  if (["png","jpg","jpeg","gif","webp","svg","bmp","ico","avif"].indexOf(lx) !== -1) return "🖼️";
  return "📄";
}

export function detectLang(filePath: string): string {
  const ext = ((filePath.match(/\.([^./]+)$/) || [])[1] || "").toLowerCase();
  if (ext === "json") return "json";
  if (["js","mjs","cjs","ts","tsx","jsx"].indexOf(ext) !== -1) return "js";
  if (ext === "py") return "py";
  if (ext === "vue") return "vue";
  if (ext === "html" || ext === "htm") return "html";
  if (["css","scss","sass","less"].indexOf(ext) !== -1) return "css";
  return "";
}

export function isYaml(filePath: string): boolean {
  const ext = ((filePath.match(/\.([^./]+)$/) || [])[1] || "").toLowerCase();
  return ext === "yaml" || ext === "yml";
}

export function isImageFile(filePath: string): boolean {
  const ext = ((filePath.match(/\.([^./]+)$/) || [])[1] || "").toLowerCase();
  return ["png","jpg","jpeg","gif","webp","svg","bmp","ico","avif"].indexOf(ext) !== -1;
}

export function highlightCode(src: string, lang: string): string {
  if (lang === "json") return highlightJson(src);
  if (lang === "js") return highlightJs(src);
  if (lang === "py") return highlightPy(src);
  if (lang === "vue") return highlightVue(src);
  if (lang === "html") return highlightHtml(src);
  if (lang === "css") return highlightCss(src);
  return escHtml(src);
}

function highlightJson(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  while (i < len) {
    const ch = src[i];
    if (ch === '"') {
      const start = i;
      i++;
      while (i < len) {
        if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        i++;
      }
      const str = src.slice(start, i);
      let j = i;
      while (j < len && /\s/.test(src[j])) j++;
      if (src[j] === ":") {
        out += '<span class="syn-key">' + escHtml(str) + "</span>";
      } else {
        out += '<span class="syn-str">' + escHtml(str) + "</span>";
      }
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const nStart = i;
      if (ch === "-") i++;
      while (i < len && /[0-9.eE+\-]/.test(src[i])) i++;
      out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + "</span>";
      continue;
    }
    if (src.slice(i, i + 4) === "true" || src.slice(i, i + 5) === "false") {
      const kw = src.slice(i, i + 4) === "true" ? "true" : "false";
      out += '<span class="syn-bool">' + kw + "</span>";
      i += kw.length;
      continue;
    }
    if (src.slice(i, i + 4) === "null") {
      out += '<span class="syn-null">null</span>';
      i += 4;
      continue;
    }
    if ("{}[],:".indexOf(ch) >= 0) {
      out += '<span class="syn-punct">' + escHtml(ch) + "</span>";
      i++;
      continue;
    }
    out += escHtml(ch);
    i++;
  }
  return out;
}

const JS_KEYWORDS = /^(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await|as|interface|type|enum|implements|public|private|protected|readonly|abstract)$/;
const JS_BUILTINS = /^(true|false|null|undefined|NaN|Infinity|console|Math|JSON|Object|Array|String|Number|Boolean|Promise|Date|RegExp|Error|window|document|globalThis)$/;

function highlightJs(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  while (i < len) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      const e = end === -1 ? len : end;
      out += '<span class="syn-comment">' + escHtml(src.slice(i, e)) + "</span>";
      i = e;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      let bend = src.indexOf("*/", i + 2);
      if (bend === -1) bend = len; else bend += 2;
      out += '<span class="syn-comment">' + escHtml(src.slice(i, bend)) + "</span>";
      i = bend;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const sStart = i;
      i++;
      while (i < len) {
        if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < len && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          continue;
        }
        i++;
      }
      out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + "</span>";
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const nStart = i;
      while (i < len && /[0-9._xXbBoOeE+\-a-fA-F]/.test(src[i])) i++;
      out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + "</span>";
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const idStart = i;
      while (i < len && /[A-Za-z0-9_$]/.test(src[i])) i++;
      const word = src.slice(idStart, i);
      if (JS_KEYWORDS.test(word)) {
        out += '<span class="syn-kw">' + word + "</span>";
      } else if (JS_BUILTINS.test(word)) {
        out += '<span class="syn-builtin">' + word + "</span>";
      } else if (src[i] === "(") {
        out += '<span class="syn-fn">' + word + "</span>";
      } else {
        out += escHtml(word);
      }
      continue;
    }
    out += escHtml(ch);
    i++;
  }
  return out;
}

const PY_KEYWORDS = /^(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case)$/;
const PY_BUILTINS = /^(abs|all|any|bool|bytes|callable|chr|dict|dir|enumerate|filter|float|format|frozenset|getattr|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|map|max|min|next|object|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|str|sum|super|tuple|type|vars|zip|self|cls)$/;

function highlightPy(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  while (i < len) {
    const ch = src[i];
    if (ch === "@" && /[A-Za-z_]/.test(src[i + 1] || "")) {
      const dStart = i;
      i++;
      while (i < len && /[A-Za-z0-9_.]/.test(src[i])) i++;
      out += '<span class="syn-decor">' + escHtml(src.slice(dStart, i)) + "</span>";
      continue;
    }
    if (ch === "#") {
      const end = src.indexOf("\n", i);
      const e = end === -1 ? len : end;
      out += '<span class="syn-comment">' + escHtml(src.slice(i, e)) + "</span>";
      i = e;
      continue;
    }
    if ((ch === '"' || ch === "'") && src[i + 1] === ch && src[i + 2] === ch) {
      const tq = ch + ch + ch;
      const tStart = i;
      i += 3;
      const tEnd = src.indexOf(tq, i);
      if (tEnd === -1) { i = len; } else { i = tEnd + 3; }
      out += '<span class="syn-str">' + escHtml(src.slice(tStart, i)) + "</span>";
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const sStart = i;
      i++;
      while (i < len) {
        if (src[i] === "\\" && i + 1 < len) { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (src[i] === "\n") break;
        i++;
      }
      out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + "</span>";
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const nStart = i;
      while (i < len && /[0-9._xXbBoOeE+\-a-fA-F]/.test(src[i])) i++;
      out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + "</span>";
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const idStart = i;
      while (i < len && /[A-Za-z0-9_]/.test(src[i])) i++;
      const word = src.slice(idStart, i);
      if (PY_KEYWORDS.test(word)) {
        out += '<span class="syn-kw">' + word + "</span>";
      } else if (PY_BUILTINS.test(word)) {
        out += '<span class="syn-builtin">' + word + "</span>";
      } else if (src[i] === "(") {
        out += '<span class="syn-fn">' + word + "</span>";
      } else {
        out += escHtml(word);
      }
      continue;
    }
    out += escHtml(ch);
    i++;
  }
  return out;
}

function highlightHtmlTag(tag: string): string {
  let out = "";
  const len = tag.length;
  if (len < 2) return escHtml(tag);
  out += '<span class="syn-punct">&lt;</span>';
  let i = 1;
  if (tag[i] === "/") { out += '<span class="syn-punct">/</span>'; i++; }
  const nameStart = i;
  while (i < len && /[a-zA-Z0-9\-]/.test(tag[i])) i++;
  if (i > nameStart) {
    out += '<span class="syn-tag">' + escHtml(tag.slice(nameStart, i)) + "</span>";
  }
  while (i < len && tag[i] !== ">") {
    if (/\s/.test(tag[i])) { out += tag[i]; i++; continue; }
    if (tag[i] === "/") { out += '<span class="syn-punct">/</span>'; i++; continue; }
    const aStart = i;
    while (i < len && /[a-zA-Z0-9:@\-._]/.test(tag[i])) i++;
    if (i > aStart) {
      out += '<span class="syn-attr">' + escHtml(tag.slice(aStart, i)) + "</span>";
    } else {
      out += escHtml(tag[i]); i++; continue;
    }
    if (tag[i] === "=") {
      out += '<span class="syn-punct">=</span>';
      i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const quote = tag[i];
        const vStart = i;
        i++;
        while (i < len && tag[i] !== quote) i++;
        if (i < len) i++;
        out += '<span class="syn-str">' + escHtml(tag.slice(vStart, i)) + "</span>";
      } else {
        const uStart = i;
        while (i < len && !/[\s>]/.test(tag[i])) i++;
        out += '<span class="syn-str">' + escHtml(tag.slice(uStart, i)) + "</span>";
      }
    }
  }
  if (i < len && tag[i] === ">") out += '<span class="syn-punct">&gt;</span>';
  return out;
}

function highlightHtml(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  while (i < len) {
    if (src.slice(i, i + 4) === "<!--") {
      let end = src.indexOf("-->", i + 4);
      end = end === -1 ? len : end + 3;
      out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + "</span>";
      i = end;
      continue;
    }
    if (src[i] === "<") {
      const tagEnd = src.indexOf(">", i);
      if (tagEnd === -1) { out += escHtml(src.slice(i)); break; }
      out += highlightHtmlTag(src.slice(i, tagEnd + 1));
      i = tagEnd + 1;
      continue;
    }
    if (src[i] === "{" && src[i + 1] === "{") {
      const iend = src.indexOf("}}", i + 2);
      if (iend === -1) { out += escHtml(src.slice(i)); break; }
      const end = iend + 2;
      out += '<span class="syn-interp">' + escHtml(src.slice(i, end)) + "</span>";
      i = end;
      continue;
    }
    out += escHtml(src[i]);
    i++;
  }
  return out;
}

function highlightCss(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  let depth = 0;
  while (i < len) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "*") {
      let end = src.indexOf("*/", i + 2);
      end = end === -1 ? len : end + 2;
      out += '<span class="syn-comment">' + escHtml(src.slice(i, end)) + "</span>";
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const sStart = i;
      i++;
      while (i < len && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < len) i++;
        i++;
      }
      if (i < len) i++;
      out += '<span class="syn-str">' + escHtml(src.slice(sStart, i)) + "</span>";
      continue;
    }
    if (ch === "{") { depth++; out += '<span class="syn-punct">{</span>'; i++; continue; }
    if (ch === "}") { if (depth > 0) depth--; out += '<span class="syn-punct">}</span>'; i++; continue; }
    if (ch === "@" && /[a-zA-Z]/.test(src[i + 1] || "")) {
      const aStart = i;
      i++;
      while (i < len && /[a-zA-Z\-]/.test(src[i])) i++;
      out += '<span class="syn-kw">' + escHtml(src.slice(aStart, i)) + "</span>";
      continue;
    }
    if (depth > 0 && /[a-zA-Z\-]/.test(ch)) {
      const pStart = i;
      while (i < len && /[a-zA-Z0-9\-]/.test(src[i])) i++;
      let j = i;
      while (j < len && /\s/.test(src[j])) j++;
      if (src[j] === ":") {
        out += '<span class="syn-key">' + escHtml(src.slice(pStart, i)) + "</span>";
      } else {
        out += escHtml(src.slice(pStart, i));
      }
      continue;
    }
    if (depth > 0 && ch >= "0" && ch <= "9") {
      const nStart = i;
      while (i < len && /[0-9.]/.test(src[i])) i++;
      while (i < len && /[a-zA-Z%]/.test(src[i])) i++;
      out += '<span class="syn-num">' + escHtml(src.slice(nStart, i)) + "</span>";
      continue;
    }
    if (ch === "#" && /[0-9a-fA-F]/.test(src[i + 1] || "")) {
      const hStart = i;
      i++;
      while (i < len && /[0-9a-fA-F]/.test(src[i])) i++;
      out += '<span class="syn-num">' + escHtml(src.slice(hStart, i)) + "</span>";
      continue;
    }
    out += escHtml(ch);
    i++;
  }
  return out;
}

function highlightVue(src: string): string {
  let out = "";
  let i = 0;
  const len = src.length;
  const blockRe = /<(template|script|style)(\s[^>]*?)?>/i;
  while (i < len) {
    const rest = src.slice(i);
    const m = blockRe.exec(rest);
    if (!m) { out += escHtml(rest); break; }
    out += escHtml(rest.slice(0, m.index));
    const blockName = m[1].toLowerCase();
    const openTag = m[0];
    out += highlightHtmlTag(openTag);
    const contentStart = m.index + openTag.length;
    const closeRe = new RegExp("</" + blockName + "\\s*>", "i");
    const close = closeRe.exec(rest.slice(contentStart));
    if (!close) {
      const tailContent = rest.slice(contentStart);
      out += highlightVueBlockContent(tailContent, blockName);
      break;
    }
    const content = rest.slice(contentStart, contentStart + close.index);
    out += highlightVueBlockContent(content, blockName);
    const closeTag = close[0];
    out += highlightHtmlTag(closeTag);
    i += contentStart + close.index + closeTag.length;
  }
  return out;
}

function highlightVueBlockContent(content: string, blockName: string): string {
  if (blockName === "script") return highlightJs(content);
  if (blockName === "style") return highlightCss(content);
  return highlightHtml(content);
}
