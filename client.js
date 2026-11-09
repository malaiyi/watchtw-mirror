// 全民監督（CivicLens Taiwan）—— 前端互動
// 掛在每個 entity 頁面的表單上。
//
// 設計原則：
//   ★ 一定要顯示「你送出的東西會被標記成什麼」
//   ★ 絕不假成功：失敗就明說失敗
//   ★ 只輸出「已經收到的內容」：清單從 API 動態載入，不靠靜態 HTML
//   ★ XSS：所有內容都用 textContent 塞進 DOM；連結只允許 http/https

(() => {
  // 靜態鏡像（GitHub Pages）沒有 API：攔截所有表單送出，明確引導回主站，
  // 而不是讓使用者看到 BAD_RESPONSE／405。
  const MAIN_SITE = 'https://watchtw.pages.dev';
  const IS_MIRROR = document.body && document.body.dataset.mirror === '1';
  if (IS_MIRROR) {
    document.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const out = ev.target.querySelector('.result') || document.querySelector('.result');
      if (out) {
        out.hidden = false;
        out.dataset.ok = '0';
        out.textContent = '這是靜態備援鏡像，投稿與回應請回主站：';
        const a = document.createElement('a');
        a.href = MAIN_SITE;
        a.textContent = MAIN_SITE;
        out.append(a);
      } else {
        alert('這是靜態備援鏡像，投稿請回主站：' + MAIN_SITE);
      }
    }, true);
  }

  const api = (path, body) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => {
      const d = await r.json().catch(() => ({ ok: false, error: 'BAD_RESPONSE' }));
      return { httpStatus: r.status, ...d };
    });

  // 檔案上傳（照片／影片）：multipart → /api/upload → { ok, url }
  const upload = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/upload', { method: 'POST', body: fd }).then(async (r) => {
      const d = await r.json().catch(() => ({ ok: false, error: 'BAD_RESPONSE' }));
      return { httpStatus: r.status, ...d };
    });
  };

  const show = (el, ok, text) => {
    el.textContent = text;
    el.className = ok ? 'result ok' : 'result bad';
    el.hidden = false;
  };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const safeHref = (u) => {
    try {
      const x = new URL(String(u));
      return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
    } catch {
      return null;
    }
  };

  const fmtTime = (iso) => {
    const d = new Date(String(iso));
    return Number.isNaN(d.getTime()) ? String(iso) :
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ---- 動態載入：民眾觀察 / 機關回應 ----
  const entityId = document.body && document.body.dataset
    ? document.body.dataset.entityId : null;

  function loadObs() {
    const list = document.querySelector('#obs-list');
    const count = document.querySelector('#obs-count');
    if (!list || !entityId) return;
    fetch(`/api/observations?entity_id=${encodeURIComponent(entityId)}`, {
      headers: { Accept: 'application/json' },
    }).then((r) => r.json()).then((d) => {
      const items = (d.items || []).filter((o) => o.status !== 'REMOVED');
      if (count) count.textContent = String(items.length);
      list.textContent = '';
      if (!items.length) {
        list.append(el('p', 'empty', '尚無民眾觀察。看到任何狀況都可以用下方表單補充。'));
        return;
      }
      for (const o of items) {
        const li = el('li', 'obs-item');
        li.append(el('time', null, fmtTime(o.created_at)));
        li.append(el('p', null, o.body || ''));
        // 媒體：本站上傳的照片／影片直接顯示，外部連結則給連結
        const media = String(o.media_url || '');
        const isLocal = /^\/uploads\/[\w.-]+$/.test(media);
        if (isLocal && /\.(jpe?g|png|gif|webp)$/i.test(media)) {
          const img = el('img', 'obs-media');
          img.src = media;
          img.alt = '民眾提供的照片';
          img.loading = 'lazy';
          li.append(img);
        } else if (isLocal && /\.(mp4|webm)$/i.test(media)) {
          const v = el('video', 'obs-media');
          v.src = media;
          v.controls = true;
          v.preload = 'metadata';
          li.append(v);
        }
        const meta = el('p', 'meta', `${o.location || ''}　·　${o.submitter || '匿名'}　·　${o.status || 'UNVERIFIED'}`);
        const href = safeHref(media);
        if (href && !isLocal) {
          const a = el('a', null, o.kind === 'LINK' ? '相關連結' : '附件連結');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noreferrer noopener';
          meta.append('　·　', a);
        }
        // 座標 → Google 地圖（衛星）
        if (o.lat != null && o.lng != null) {
          const maplink = el('a', null, '地圖定位');
          maplink.href = `https://www.google.com/maps?q=${encodeURIComponent(`${o.lat},${o.lng}`)}&t=k`;
          maplink.target = '_blank';
          maplink.rel = 'noreferrer noopener';
          meta.append('　·　',
            `座標 ${Number(o.lat).toFixed(4)},${Number(o.lng).toFixed(4)}　`, maplink);
        }
        li.append(meta);
        list.append(li);
      }
    }).catch(() => {
      list.textContent = '';
      list.append(el('p', 'empty', '（載入失敗，稍後重新整理頁面再試）'));
    });
  }

  function loadRes() {
    const list = document.querySelector('#res-list');
    const count = document.querySelector('#res-count');
    if (!list || !entityId) return;
    fetch(`/api/responses?entity_id=${encodeURIComponent(entityId)}`, {
      headers: { Accept: 'application/json' },
    }).then((r) => r.json()).then((d) => {
      const items = d.items || [];
      if (count) count.textContent = String(items.length);
      list.textContent = '';
      if (!items.length) {
        list.append(el('p', 'empty', '尚無機關回應。'));
        return;
      }
      for (const r of items) {
        const li = el('li', 'res-item');
        const head = el('p', 'res-head');
        head.append(el('b', null, r.agency || ''));
        head.append(' ', el('time', null, fmtTime(r.created_at)));
        if (r.verified) head.append(' ', el('span', 'badge ok', '已驗證機關'));
        else head.append(' ', el('span', 'badge', '自稱機關，未驗證'));
        li.append(head);
        li.append(el('p', null, r.body || ''));
        if (r.verified_note) li.append(el('p', 'meta', r.verified_note));
        list.append(li);
      }
    }).catch(() => {
      list.textContent = '';
      list.append(el('p', 'empty', '（載入失敗，稍後重新整理頁面再試）'));
    });
  }

  if (entityId) {
    loadObs();
    loadRes();
  }

  // ---- 全站搜尋 + 行政層級篩選（首頁，純前端過濾）----
  const LEVEL_NAME = { central: '中央', local_gov: '縣市政府', local_council: '縣市議會' };
  const searchInput = document.querySelector('#search-input');
  if (searchInput) {
    const countEl = document.querySelector('#search-count');
    const levelFilter = document.querySelector('#level-filter');
    const cards = Array.from(document.querySelectorAll('main.cards section.card'));
    const allItems = Array.from(document.querySelectorAll('li.entity-item'));
    let activeLevel = '';

    const applyFilter = () => {
      const q = searchInput.value.trim().toLowerCase();
      let visible = 0;
      for (const li of allItems) {
        const hitQ = !q || (li.dataset.search || '').toLowerCase().includes(q);
        const hitL = !activeLevel || (li.dataset.level || '') === activeLevel;
        const hit = hitQ && hitL;
        li.hidden = !hit;
        if (hit) visible += 1;
      }
      for (const card of cards) {
        const shown = Array.from(card.querySelectorAll('li.entity-item'))
          .filter((li) => !li.hidden).length;
        card.hidden = shown === 0;
      }
      if (countEl) {
        const parts = [];
        if (q) parts.push(`關鍵字「${searchInput.value.trim()}」`);
        if (activeLevel) parts.push(`層級「${LEVEL_NAME[activeLevel] || activeLevel}」`);
        if (parts.length) {
          countEl.hidden = false;
          countEl.textContent = visible
            ? `找到 ${visible} 筆（${parts.join('、')}）。`
            : `沒有符合（${parts.join('、')}）的條目。`;
        } else {
          countEl.hidden = true;
        }
      }
    };

    searchInput.addEventListener('input', applyFilter);
    if (levelFilter) {
      const buttons = Array.from(levelFilter.querySelectorAll('button'));
      for (const b of buttons) {
        b.addEventListener('click', () => {
          activeLevel = b.dataset.level || '';
          for (const x of buttons) x.classList.toggle('active', x === b);
          applyFilter();
        });
      }
    }
  }

  // ---- 給站長的建議 ----
  const sugForm = document.querySelector('#form-suggest');
  if (sugForm) {
    sugForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const out = document.querySelector('#suggest-result');
      const fd = new FormData(sugForm);
      const btn = sugForm.querySelector('button');
      btn.disabled = true;
      show(out, true, '送出中…');
      try {
        const res = await api('/api/suggest', {
          body: fd.get('body'),
          contact: fd.get('contact'),
        });
        if (res.ok) {
          show(out, true, `✓ ${res.message}`);
          sugForm.reset();
        } else {
          show(out, false, `✗ 送出失敗：${res.error}` +
            (res.limit ? `（每小時上限 ${res.limit} 筆）` : ''));
        }
      } catch (e) {
        show(out, false, `✗ 網路錯誤：${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- 民眾觀察（可附照片／影片、地址、座標）----
  const obsForm = document.querySelector('#form-observe');
  if (obsForm) {
    // 「取用目前位置」：填入緯度／經度
    const geoBtn = document.querySelector('#btn-geo');
    if (geoBtn) {
      geoBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          show(document.querySelector('#observe-result'), false, '✗ 此瀏覽器不支援定位');
          return;
        }
        geoBtn.disabled = true;
        geoBtn.textContent = '定位中…';
        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = obsForm.querySelector('input[name=lat]');
          const lng = obsForm.querySelector('input[name=lng]');
          if (lat) lat.value = pos.coords.latitude.toFixed(6);
          if (lng) lng.value = pos.coords.longitude.toFixed(6);
          geoBtn.disabled = false;
          geoBtn.textContent = '已取得位置';
        }, () => {
          geoBtn.disabled = false;
          geoBtn.textContent = '取用目前位置';
          show(document.querySelector('#observe-result'), false,
            '✗ 無法取得位置（請允許定位權限，或手動輸入座標）');
        }, { enableHighAccuracy: true, timeout: 10000 });
      });
    }

    obsForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const out = document.querySelector('#observe-result');
      const fd = new FormData(obsForm);
      const btn = obsForm.querySelector('button[type=submit]');
      btn.disabled = true;
      show(out, true, '送出中…');
      try {
        // ① 有檔案就先上傳
        const fileInput = obsForm.querySelector('input[name=file]');
        const file = fileInput && fileInput.files && fileInput.files[0]
          ? fileInput.files[0] : null;
        let mediaUrl = null;
        let kind = String(fd.get('kind') || 'TEXT');
        if (file) {
          show(out, true, '上傳中…');
          const up = await upload(file);
          if (!up.ok) {
            show(out, false, `✗ 上傳失敗：${up.error}`);
            btn.disabled = false;
            return;
          }
          mediaUrl = up.url;
          kind = String(up.mime || '').startsWith('video') ? 'VIDEO' : 'PHOTO';
        }
        // ② 送出觀察（含地址與座標）
        const res = await api('/api/submit', {
          entity_id: fd.get('entity_id'),
          body: fd.get('body'),
          location: fd.get('location'),
          lat: fd.get('lat') || null,
          lng: fd.get('lng') || null,
          kind,
          media_url: mediaUrl,
        });
        if (res.ok) {
          show(out, true, `✓ ${res.message}（狀態：${res.status}）`);
          obsForm.reset();
          loadObs();
        } else {
          show(out, false, `✗ 送出失敗：${res.error}` +
            (res.limit ? `（每小時上限 ${res.limit} 筆）` : ''));
        }
      } catch (e) {
        show(out, false, `✗ 網路錯誤：${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- 機關回應 ----
  const resForm = document.querySelector('#form-respond');
  if (resForm) {
    resForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const out = document.querySelector('#respond-result');
      const fd = new FormData(resForm);
      const btn = resForm.querySelector('button');
      btn.disabled = true;
      show(out, true, '送出中…');
      try {
        const res = await api('/api/respond', {
          entity_id: fd.get('entity_id'),
          agency: fd.get('agency'),
          body: fd.get('body'),
          contact_email: fd.get('contact_email'),
        });
        if (res.ok) {
          show(out, true, `✓ ${res.message}`);
          resForm.reset();
          loadRes();
        } else {
          show(out, false, `✗ 送出失敗：${res.error}`);
        }
      } catch (e) {
        show(out, false, `✗ 網路錯誤：${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
