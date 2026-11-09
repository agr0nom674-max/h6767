/* Клиент школьного дневника («Сетевой Город»). Работает внутри приложения.
   Построен по описанию внутреннего API, которым пользуется сам сайт; сверяйте с диагностикой при ошибках. */
(function (root) {
  function cp1251(str) {            // пароль хэшируется в кодировке windows-1251
    const out = [];
    for (const ch of str) {
      const c = ch.codePointAt(0);
      if (c < 128) out.push(c);
      else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
      else if (c === 0x401) out.push(0xa8);
      else if (c === 0x451) out.push(0xb8);
      else out.push(63);
    }
    return out;
  }
  function ascii(str) { return Array.from(str, ch => ch.charCodeAt(0) & 255); }

  function md5(bytes) {
    const K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    const p = bytes.slice(); p.push(0x80);
    while (p.length % 64 !== 56) p.push(0);
    const bits = bytes.length * 8;
    for (let i = 0; i < 8; i++) p.push(i < 4 ? (bits >>> (8 * i)) & 255 : 0);
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let o = 0; o < p.length; o += 64) {
      const M = [];
      for (let i = 0; i < 16; i++) M[i] = p[o + i * 4] | p[o + i * 4 + 1] << 8 | p[o + i * 4 + 2] << 16 | p[o + i * 4 + 3] << 24;
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        const s = S[(i >> 4) * 4 + (i % 4)];
        B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    let hex = "";
    for (const v of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) hex += ((v >>> (8 * i)) & 255).toString(16).padStart(2, "0");
    return hex;
  }

  async function defaultHttp(method, url, opt) {
    const r = await fetch(url, { method, headers: opt.headers, body: opt.body, credentials: "include" });
    return { status: r.status, text: await r.text() };
  }

  class NetSchool {
    constructor(baseUrl, http) {
      const u = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : "https://" + baseUrl);
      this.origin = u.origin;
      this.base = u.origin + "/webapi/";
      this.http = http || defaultHttp;
      this.at = null; this.studentId = null; this.yearId = null;
      this.log = [];
    }
    async req(method, path, o = {}) {
      let url = this.base + path;
      if (o.query) url += "?" + new URLSearchParams(o.query).toString();
      const headers = { Referer: this.origin + "/", Accept: "application/json, text/plain, */*" };
      let body;
      if (o.form) { headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"; body = new URLSearchParams(o.form).toString(); }
      if (this.at && o.auth !== false) headers.at = this.at;
      const res = await this.http(method, url, { headers, body });
      const ok = res.status >= 200 && res.status < 300;
      // в журнал попадают только путь и статус; текст ответа только при ошибке и без секретов
      this.log.push(`${method} ${path} → ${res.status}` + (ok ? "" : " " + String(res.text).slice(0, 120).replace(/"at":"[^"]*"/g, '"at":"…"')));
      if (!ok) { const e = new Error(`Сервер ответил ${res.status} на ${path}`); e.status = res.status; throw e; }
      try { return JSON.parse(res.text); } catch { throw new Error(`Ответ на ${path} не похож на данные дневника (проверьте адрес)`); }
    }
    async searchSchools(name) {
      const norm = x => String(x).toLowerCase().replace(/[«»"“”]/g, "").replace(/\s+/g, " ").trim();
      const q = String(name || "").trim();
      // варианты запроса: целиком, текст внутри кавычек, «№ 132», «№132»
      const variants = [q];
      const inner = (q.match(/[«"“]([^»"”]+)[»"”]/) || [])[1];
      if (inner) variants.push(inner.trim());
      const num = (q.match(/№\s*(\d+)/) || q.match(/(\d+)/) || [])[1];
      if (num) variants.push("№ " + num, "№" + num);
      let sawList = false, lastErr = null;
      for (const v of [...new Set(variants)].filter(Boolean)) {
        let rows = null;
        const tries = [["schools/search", { name: v }], ["addresses/schools", { funcType: 2 }]];
        for (const [path, query] of tries) {
          if (path === "schools/search" && this.noSearch) continue;
          try { const r = await this.req("GET", path, { query, auth: false }); if (Array.isArray(r)) { rows = r; break; } }
          catch (e) { lastErr = e; if (path === "schools/search" && e.status === 404) this.noSearch = true; }
        }
        if (!rows) continue;
        sawList = true;
        const res = rows
          .filter(r => r && typeof r.id === "number" && r.name && norm(r.name).includes(norm(v)))
          .map(r => {
            const row = { id: r.id, name: String(r.name), address: String(r.address || r.addressString || "") };
            for (const k of ["cid", "sid", "pid", "cn", "sft"]) if (r[k] !== undefined && r[k] !== null) row[k] = r[k];
            return row;
          });
        if (res.length) return res;
      }
      if (!sawList) throw lastErr || new Error("Сервер не отдал список школ");
      return [];
    }
    async login(user, pass, school, row) {
      this.at = null;
      await this.req("GET", "logindata", { auth: false });
      const meta = await this.req("POST", "auth/getdata", { auth: false });
      const { salt, ...rest } = meta;
      if (!row) {
        const found = await this.searchSchools(school);
        const norm = x => String(x).toLowerCase().replace(/[«»"“”]/g, "").replace(/\s+/g, " ").trim();
        const exact = found.filter(r => norm(r.name) === norm(school));
        const pool = exact.length ? exact : found;
        if (pool.length === 0) throw new Error("Школа не найдена. Нажмите «Найти школу» и выберите её из списка.");
        if (pool.length > 1) throw new Error("Найдено несколько школ, выберите нужную кнопкой «Найти школу»:\n" + pool.slice(0, 5).map(r => r.name + (r.address ? " (" + r.address + ")" : "")).join("\n"));
        row = pool[0];
      }
      const { id, name, address, ...extra } = row;
      const pw2 = md5(ascii(salt + md5(cp1251(pass))));
      const pw = pw2.slice(0, pass.length);
      const res = await this.req("POST", "login", { auth: false, form: { loginType: 1, scid: id, un: user, pw, pw2, ...extra, ...rest } });
      if (!res.at) throw new Error(res.message || "Не удалось войти: проверьте логин, пароль и школу");
      this.at = res.at;
      const init = await this.req("GET", "student/diary/init");
      this.studentId = init.students[init.currentStudentId].studentId;
      this.yearId = (await this.req("GET", "years/current")).id;
    }
    async diary(startISO, endISO) {
      const d = await this.req("GET", "student/diary", { query: { studentId: this.studentId, yearId: this.yearId, weekStart: startISO, weekEnd: endISO } });
      const byDate = {};
      for (const day of d.weekDays || []) {
        byDate[String(day.date).slice(0, 10)] = (day.lessons || []).map(l => ({
          number: l.number, start: l.startTime, end: l.endTime, subject: l.subjectName, room: l.room || "",
          assignments: (l.assignments || []).map(a => ({ text: a.assignmentName || "", mark: a.mark && a.mark.mark ? +a.mark.mark : null, type: "" }))
        }));
      }
      const days = [];
      const s = new Date(startISO + "T00:00:00");
      for (let i = 0; i < 6; i++) {            // Пн–Сб; пустые дни тоже показываем
        const x = new Date(s); x.setDate(s.getDate() + i);
        const iso = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
        days.push({ date: iso, lessons: byDate[iso] || [] });
      }
      return { days };
    }
  }
  root.NS = { NetSchool, md5, cp1251, ascii };
  if (typeof module !== "undefined") module.exports = root.NS;
})(typeof window !== "undefined" ? window : globalThis);
