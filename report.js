// 全民監督 —— 公民小蜜蜂回報頁（report.html）專用腳本
// 安全：只用 createElement／textContent，不碰 innerHTML。
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const show = (node, ok, msg) => {
    if (!node) return;
    node.hidden = false;
    node.textContent = msg;
    node.dataset.ok = ok ? '1' : '0';
  };
  const CAT_LABEL = {
    procurement: '公共工程／採購', environment: '環境／廢棄物',
    food_drug: '食藥／衛生', expense: '公職費用／支出',
    judicial: '司法／執法', other: '其他',
  };

  const upload = (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/upload', { method: 'POST', body: fd })
      .then(async (r) => ({ httpStatus: r.status, ...(await r.json().catch(() => ({ ok: false }))) }));
  };

  // ---- 表單 ----
  const form = $('#form-report');
  if (form) {
    const geo = $('#btn-report-geo');
    if (geo) {
      geo.addEventListener('click', () => {
        if (!navigator.geolocation) { show($('#report-result'), false, '此瀏覽器不支援定位'); return; }
        geo.disabled = true;
        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = form.querySelector('input[name=lat]');
          const lng = form.querySelector('input[name=lng]');
          if (lat) lat.value = pos.coords.latitude.toFixed(6);
          if (lng) lng.value = pos.coords.longitude.toFixed(6);
          geo.disabled = false;
          geo.textContent = '已取得位置';
        }, () => { geo.disabled = false; show($('#report-result'), false, '無法取得位置，請手動輸入'); });
      });
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const out = $('#report-result');
      const btn = form.querySelector('button[type=submit]');
      const fd = new FormData(form);
      btn.disabled = true;
      show(out, true, '送出中…');
      try {
        const fileInput = form.querySelector('input[name=file]');
        const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        let mediaUrl = null;
        if (file) {
          show(out, true, '上傳檔案中…');
          const up = await upload(file);
          if (!up.ok) { show(out, false, `上傳失敗：${up.error}`); btn.disabled = false; return; }
          mediaUrl = up.url;
        }
        const res = await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            county: fd.get('county'), district: fd.get('district'),
            category: fd.get('category'), title: fd.get('title'),
            body: fd.get('body'), location: fd.get('location'),
            lat: fd.get('lat') || null, lng: fd.get('lng') || null,
            submitter: fd.get('submitter'), contact: fd.get('contact'),
            media_url: mediaUrl,
          }),
        }).then(async (r) => ({ httpStatus: r.status, ...(await r.json().catch(() => ({ ok: false, error: 'BAD_RESPONSE' }))) }));
        if (res.ok) {
          show(out, true, `✓ ${res.message}`);
          form.reset();
          loadReports();
        } else {
          show(out, false, `✗ ${res.error}${res.limit ? `（每小時上限 ${res.limit} 則）` : ''}`);
        }
      } catch (e) {
        show(out, false, `✗ 網路錯誤：${e.message}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- 列表 ----
  const list = $('#reports-list');
  const board = $('#county-board');
  const countEl = $('#reports-count');
  const filter = $('#report-filter');
  if (!list) return;

  function item(r) {
    const box = el('article', 'report-item');
    box.append(el('h3', null, r.title));
    const meta = el('p', 'meta',
      `${r.county || '未指定' }${r.district ? '·' + r.district : ''}　·　${CAT_LABEL[r.category] || r.category}　·　${r.submitter || '匿名'}　·　${r.created_at.slice(0, 10)}`);
    box.append(meta);
    box.append(el('p', null, r.body));
    if (r.location) box.append(el('p', 'meta', `地點：${r.location}`));
    if (r.lat != null && r.lng != null) {
      const a = el('a', null, '地圖定位');
      a.href = `https://www.google.com/maps?q=${encodeURIComponent(`${r.lat},${r.lng}`)}&t=k`;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      box.append(el('p', 'meta', `座標 ${Number(r.lat).toFixed(4)},${Number(r.lng).toFixed(4)}　`, a));
    }
    if (r.media_url && /\.(jpe?g|png|gif|webp)$/i.test(r.media_url)) {
      const img = el('img', 'obs-media');
      img.src = r.media_url; img.loading = 'lazy'; img.alt = '民眾提供的照片';
      box.append(img);
    } else if (r.media_url && /\.(mp4|webm)$/i.test(r.media_url)) {
      const v = el('video', 'obs-media');
      v.src = r.media_url; v.controls = true; v.preload = 'metadata';
      box.append(v);
    }
    box.append(el('p', 'meta', '狀態：未經查證（民眾陳述）'));
    return box;
  }

  function render(d) {
    const items = d.items || [];
    if (countEl) countEl.textContent = String(d.total || items.length);
    if (board) {
      board.textContent = '';
      const counties = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
        '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣',
        '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
      for (const c of counties) {
        const n = (d.by_county || {})[c] || 0;
        const chip = el('span', 'chip', `${c} ${n}`);
        if (n > 0) chip.classList.add('chip-on');
        board.append(chip);
      }
    }
    list.textContent = '';
    if (!items.length) { list.append(el('p', 'empty', '目前還沒有回報。你可以是第一個。')); return; }
    for (const r of items) list.append(item(r));
  }

  function loadReports() {
    const county = filter ? filter.value : '';
    const url = '/api/reports' + (county ? `?county=${encodeURIComponent(county)}` : '');
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then(render)
      .catch(() => { list.textContent = ''; list.append(el('p', 'empty', '（載入失敗，稍後重整）')); });
  }

  if (filter) filter.addEventListener('change', loadReports);
  loadReports();
})();
