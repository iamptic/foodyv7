(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const state = {
    api: (window.__FOODY__ && window.__FOODY__.FOODY_API) || "https://foodyback-production.up.railway.app",
    rid: localStorage.getItem('foody_restaurant_id') || '',
    key: localStorage.getItem('foody_key') || '',
  };

  const toastBox = $('#toast');
  function toast(msg, type='ok'){ 
    const el = document.createElement('div');
    el.className='toast';
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // Tabs
  $$('#tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'logoutBtn') { doLogout(); return; }
      $$('#tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === tab));
      if (tab === 'dashboard') refreshDashboard();
      if (tab === 'offers') loadOffers();
      if (tab === 'profile') loadProfile();
      if (tab === 'export') showCreds();
    });
  });

  function requireAuth() {
    if (!state.rid || !state.key) {
      // Show auth tab
      $$('#tabs .tab').forEach(b => b.classList.remove('active'));
      $$('#tabs .tab')[0].classList.add('active');
      $$('.tabpane').forEach(p => p.classList.remove('active'));
      $('#auth').classList.add('active');
      return false;
    }
    // Switch to dashboard by default
    $$('#tabs .tab').forEach(b => b.classList.remove('active'));
    $$('#tabs .tab')[1].classList.add('active'); // dashboard
    $$('.tabpane').forEach(p => p.classList.remove('active'));
    $('#dashboard').classList.add('active');
    refreshDashboard();
    return true;
  }

  function doLogout() {
    localStorage.removeItem('foody_restaurant_id');
    localStorage.removeItem('foody_key');
    state.rid = ''; state.key = '';
    toast('Вы вышли из аккаунта');
    requireAuth();
  }

  // API helper
  async function api(path, {method='GET', headers={}, body=null, raw=false}={}) {
    const url = `${state.api}${path}`;
    const h = {'Content-Type':'application/json', ...headers};
    if (state.key) h['X-Foody-Key'] = state.key;
    const res = await fetch(url, {method, headers:h, body});
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      throw new Error(`${res.status} ${res.statusText} — ${txt}`);
    }
    if (raw) return res;
    const ct = res.headers.get('content-type')||'';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // AUTH: register & login
  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name')?.trim(),
      phone: fd.get('phone')?.trim(),
    };
    try {
      const resp = await api('/api/v1/merchant/register_public', {method:'POST', body: JSON.stringify(payload)});
      if (!resp || !resp.restaurant_id || !resp.api_key) throw new Error('Неожиданный ответ API');
      state.rid = resp.restaurant_id;
      state.key = resp.api_key;
      localStorage.setItem('foody_restaurant_id', state.rid);
      localStorage.setItem('foody_key', state.key);
      toast('Ресторан создан ✅');
      requireAuth();
    } catch (err) {
      console.error(err);
      toast('Ошибка регистрации: ' + err.message);
    }
  });

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.rid = fd.get('restaurant_id')?.trim();
    state.key = fd.get('api_key')?.trim();
    if (!state.rid || !state.key) { toast('Введите ID и ключ'); return; }
    localStorage.setItem('foody_restaurant_id', state.rid);
    localStorage.setItem('foody_key', state.key);
    toast('Вход выполнен ✅');
    requireAuth();
  });

  // PROFILE
  async function loadProfile() {
    if (!state.rid || !state.key) return;
    try {
      const prof = await api(`/api/v1/merchant/profile?restaurant_id=${encodeURIComponent(state.rid)}`);
      fillProfileForm(prof || {});
      $('#profileDump').textContent = JSON.stringify(prof, null, 2);
    } catch (err) {
      console.warn('Profile load error:', err);
      toast('Не удалось загрузить профиль: ' + err.message);
    }
  }
  function fillProfileForm(p={}) {
    const f = $('#profileForm');
    f.name.value = p.name || '';
    f.phone.value = p.phone || '';
    f.address.value = p.address || '';
    f.lat.value = p.lat ?? '';
    f.lng.value = p.lng ?? '';
    // close_time as "HH:MM"
    f.close_time.value = (p.close_time || '').slice(0,5);
  }
  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) { toast('Сначала войдите'); return; }
    const fd = new FormData(e.currentTarget);
    const payload = {
      restaurant_id: state.rid,
      name: fd.get('name')?.trim(),
      phone: fd.get('phone')?.trim(),
      address: fd.get('address')?.trim(),
      lat: parseFloat(fd.get('lat')) || null,
      lng: parseFloat(fd.get('lng')) || null,
      close_time: fd.get('close_time') || null,
    };
    try {
      const resp = await api('/api/v1/merchant/profile', {method:'POST', body: JSON.stringify(payload)});
      toast('Профиль сохранён ✅');
      $('#profileDump').textContent = JSON.stringify(resp || payload, null, 2);
    } catch (err) {
      console.error(err);
      toast('Ошибка сохранения профиля: ' + err.message);
    }
  });

  // OFFERS
  function moneyToCents(rub) { return Math.round((Number(rub)||0) * 100); }
  function dtLocalToIso(dt) {
    // input type="datetime-local" returns "YYYY-MM-DDTHH:mm"
    const s = String(dt||'').trim();
    if (!s) return null;
    return new Date(s).toISOString();
  }

  $('#offerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.rid || !state.key) { toast('Сначала войдите'); return; }
    const fd = new FormData(e.currentTarget);
    const payload = {
      restaurant_id: state.rid,
      title: fd.get('title')?.trim(),
      price_cents: moneyToCents(fd.get('price')),
      original_price_cents: moneyToCents(fd.get('original_price')),
      qty_total: Number(fd.get('qty_total')) || 1,
      qty_left: Number(fd.get('qty_total')) || 1,
      expires_at: dtLocalToIso(fd.get('expires_at')),
      image_url: fd.get('image_url')?.trim() || null,
      description: fd.get('description')?.trim() || null,
    };
    try {
      await api('/api/v1/merchant/offers', {method:'POST', body: JSON.stringify(payload)});
      toast('Оффер создан ✅');
      e.currentTarget.reset();
      loadOffers();
    } catch (err) {
      console.error(err);
      toast('Ошибка создания оффера: ' + err.message);
    }
  });

  async function loadOffers() {
    if (!state.rid || !state.key) return;
    const root = $('#offerList');
    root.innerHTML = '<div class="muted">Загрузка…</div>';
    try {
      // 1) Пробуем приватный список
      let list = [];
      try {
        list = await api(`/api/v1/merchant/offers?restaurant_id=${encodeURIComponent(state.rid)}`);
      } catch (_) {
        // 2) Fallback: публичная витрина с фильтром (если поддерживается на сервере)
        const all = await api(`/api/v1/offers`);
        list = Array.isArray(all) ? all.filter(x => x.restaurant_id === state.rid) : [];
      }
      renderOffers(list);
      // Обновим дашбордные статсы
      updateStats(list);
    } catch (err) {
      console.error(err);
      root.innerHTML = '<div class="muted">Не удалось загрузить офферы</div>';
      toast('Ошибка загрузки офферов: ' + err.message);
    }
  }

  function renderOffers(items) {
    const root = $('#offerList');
    if (!Array.isArray(items) || items.length === 0) {
      root.innerHTML = '<div class="muted">Пока нет офферов</div>';
      return;
    }
    const rows = items.map(o => {
      const price = (o.price_cents||0)/100;
      const old = (o.original_price_cents||0)/100;
      const disc = old>0 ? Math.round((1 - price/old)*100) : 0;
      const exp = o.expires_at ? new Date(o.expires_at).toLocaleString() : '—';
      return `<tr>
        <td>${o.title||'—'}</td>
        <td>${price.toFixed(0)} ₽</td>
        <td>${old?old.toFixed(0)+' ₽':'—'}</td>
        <td>${disc?`-${disc}%`:'—'}</td>
        <td>${o.qty_left ?? '—'} / ${o.qty_total ?? '—'}</td>
        <td>${exp}</td>
        <td>${o.status || 'active'}</td>
      </tr>`;
    }).join('');
    root.innerHTML = `<div class="table">
      <table>
        <thead><tr>
          <th>Название</th><th>Цена</th><th>Старая</th><th>Скидка</th><th>Остаток</th><th>До</th><th>Статус</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function updateStats(list) {
    const items = Array.isArray(list) ? list : [];
    const active = items.length;
    const qty = items.reduce((s,x)=> s + (Number(x.qty_left)||0), 0);
    const discs = items.map(o => {
      const price = (o.price_cents||0)/100;
      const old = (o.original_price_cents||0)/100;
      return old>0 ? (1 - price/old) : 0;
    }).filter(x=>x>0);
    const avg = discs.length ? Math.round((discs.reduce((a,b)=>a+b,0)/discs.length)*100) : 0;
    $('#statOffers').textContent = String(active);
    $('#statQty').textContent = String(qty);
    $('#statDisc').textContent = avg ? `-${avg}%` : '—';
  }

  async function refreshDashboard() {
    // Для первого релиза просто переиспользуем список офферов
    await loadOffers();
    const box = $('#dashboardOffers');
    const list = $('#offerList').querySelectorAll('tbody tr');
    if (list.length === 0) { box.innerHTML = '<div class="muted">Нет активных офферов</div>'; return; }
    box.innerHTML = '';
    list.forEach(tr => {
      const name = tr.children[0]?.textContent || '—';
      const price = tr.children[1]?.textContent || '—';
      const till = tr.children[5]?.textContent || '—';
      const div = document.createElement('div');
      div.className = 'card item';
      div.innerHTML = `<b>${name}</b> · <span class="muted">${price}</span> · до ${till}`;
      box.appendChild(div);
    });
  }

  // EXPORT CSV (с заголовком X-Foody-Key)
  $('#downloadCsv').addEventListener('click', async () => {
    if (!state.rid || !state.key) { toast('Сначала войдите'); return; }
    try {
      const res = await fetch(`${state.api}/api/v1/merchant/offers/csv?restaurant_id=${encodeURIComponent(state.rid)}`, {
        headers: {'X-Foody-Key': state.key}
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `foody_offers_${state.rid}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('CSV скачан ✅');
    } catch (err) {
      console.error(err);
      toast('Ошибка экспорта: ' + err.message);
    }
  });

  function showCreds(){
    $('#creds').textContent = JSON.stringify({ restaurant_id: state.rid, api_key: state.key, api: state.api }, null, 2);
  }

  // Init
  if (!requireAuth()) {
    // stay on auth
  }
})();