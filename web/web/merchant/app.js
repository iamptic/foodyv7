(() => {
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const tg = window.Telegram?.WebApp; if (tg){ tg.expand(); const apply=()=>{const s=tg.colorScheme||'dark';document.documentElement.dataset.theme=s;}; apply(); tg.onEvent?.('themeChanged',apply); }
  const cfg = window.__FOODY__ || {}; const FOODY_API = cfg.FOODY_API || "https://foodyback-production.up.railway.app";

  // --- auth state (query param OR localStorage OR demo) ---
  const url = new URL(location.href);
  const state = {
    restaurant_id: url.searchParams.get('rid') || localStorage.getItem('rid') || 'RID_TEST',
    api_key:       url.searchParams.get('key') || localStorage.getItem('key') || 'KEY_TEST',
    lang: localStorage.getItem('foody_lang') || (tg?.initDataUnsafe?.user?.language_code||'ru').slice(0,2)
  };
  localStorage.setItem('rid', state.restaurant_id);
  localStorage.setItem('key', state.api_key);

  const dict={ ru:{
      dashboard:'Дашборд', create:'+ Создать', edit:'Ред.', archive:'В архив', activate:'Активировать', del:'Удалить',
      saved:'Сохранено ✅', removed:'Удалено', failed:'Ошибка', uploaded:'Фото загружено', uploading:'Загружаем...',
      search:'Поиск'
    },
    en:{
      dashboard:'Dashboard', create:'+ Create', edit:'Edit', archive:'Archive', activate:'Activate', del:'Delete',
      saved:'Saved ✅', removed:'Deleted', failed:'Error', uploaded:'Image uploaded', uploading:'Uploading...',
      search:'Search'
    }
  };
  const t=k=>(dict[state.lang]&&dict[state.lang][k])||dict.ru[k]||k;

  $('#langBtn').addEventListener('click',()=>{ state.lang=state.lang==='ru'?'en':'ru'; localStorage.setItem('foody_lang',state.lang); renderOffers(); });

  const toastBox = $('#toast'); const toast=(m)=>{ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),3200); };

  // ---- API helpers ----
  const jget  = (p)=> fetch(FOODY_API+p,{ headers:{'X-Foody-Key': state.api_key } }).then(r=>r.json());
  const jpost = (p,b)=> fetch(FOODY_API+p,{ method:'POST',headers:{'Content-Type':'application/json','X-Foody-Key': state.api_key}, body: JSON.stringify(b)}).then(r=>{ if(!r.ok) throw new Error(r.statusText); return r.json(); });
  const jput  = (p,b)=> fetch(FOODY_API+p,{ method:'PUT', headers:{'Content-Type':'application/json','X-Foody-Key': state.api_key}, body: JSON.stringify(b)}).then(r=>{ if(!r.ok) throw new Error(r.statusText); return r.json(); });

  // ---- Stats chart ----
  const metricSel = $('#metric'); const chartCanvas = $('#chart'); const ctx = chartCanvas.getContext('2d');
  function drawChart(points){
    ctx.clearRect(0,0,chartCanvas.width,chartCanvas.height);
    // simple autoscale
    const W = chartCanvas.clientWidth; const H = chartCanvas.height; chartCanvas.width=W;
    const xs = points.map(p=>new Date(p.x).getTime()); const ys = points.map(p=>p.y);
    const minX = Math.min(...xs, Date.now()-7*864e5), maxX = Math.max(...xs, Date.now());
    const minY = 0, maxY = Math.max(1, ...ys);
    const px = (t)=> (W-32) * ( (t - minX) / (maxX - minX || 1) ) + 16;
    const py = (v)=> H-24 - (H-48) * ( (v - minY) / (maxY - minY || 1) );
    // grid
    ctx.strokeStyle = 'rgba(180,200,220,.15)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(16, H-24); ctx.lineTo(W-16, H-24); ctx.stroke();
    // line
    ctx.strokeStyle = '#4ab5f1'; ctx.lineWidth=2; ctx.beginPath();
    points.forEach((p,i)=>{ const x=px(new Date(p.x).getTime()), y=py(p.y); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
    // dots
    ctx.fillStyle = '#61d39f';
    points.forEach(p=>{ const x=px(new Date(p.x).getTime()), y=py(p.y); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  }
  async function loadStats(){
    const metric = metricSel.value;
    const data = await jget(`/api/v1/merchant/stats?restaurant_id=${state.restaurant_id}&metric=${metric}`).catch(()=>({points:[]}));
    drawChart(data.points||[]);
  }
  metricSel.addEventListener('change', loadStats);

  // ---- Offers ----
  const offersBox = $('#offers'); const search = $('#search');
  let offers = [];
  function renderOffers(){
    const q = (search.value||'').toLowerCase();
    offersBox.innerHTML = '';
    const list = offers.filter(o => !q || (o.title||'').toLowerCase().includes(q));
    if(!list.length){ offersBox.innerHTML = '<div class="sub">Нет офферов</div>'; return; }
    list.forEach(o=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `
        <img src="${o.image_url||''}" alt="">
        <div>
          <div class="title">${o.title||'—'} ${o.status!=='active'?'<span class="badge">'+o.status+'</span>':''}</div>
          <div class="sub">₽ ${(o.price_cents||0)/100} • осталось ${o.qty_left??'—'} / ${o.qty_total??'—'}</div>
        </div>
        <div class="actions">
          <button class="btn" data-act="edit">`+t('edit')+`</button>
          <button class="btn" data-act="${o.status==='active'?'archive':'activate'}">${o.status==='active'?t('archive'):t('activate')}</button>
          <button class="btn" data-act="delete">`+t('del')+`</button>
        </div>
      `;
      el.querySelector('[data-act="edit"]').onclick = ()=> openEdit(o);
      el.querySelector('[data-act="archive"]').onclick = ()=> changeStatus(o,'archive');
      el.querySelector('[data-act="activate"]').onclick = ()=> changeStatus(o,'activate');
      el.querySelector('[data-act="delete"]').onclick = ()=> removeOffer(o);
      offersBox.appendChild(el);
    });
  }
  async function loadOffers(){
    offers = await jget(`/api/v1/merchant/offers?restaurant_id=${state.restaurant_id}`).catch(()=>[]);
    renderOffers();
  }
  search.addEventListener('input', renderOffers);

  async function changeStatus(o, action){
    await jpost('/api/v1/merchant/offers/status',{ restaurant_id: state.restaurant_id, offer_id:o.id, action }).catch(()=>toast(t('failed')));
    await loadOffers();
  }
  async function removeOffer(o){
    await jpost('/api/v1/merchant/offers/delete',{ restaurant_id: state.restaurant_id, offer_id:o.id }).catch(()=>toast(t('failed')));
    toast(t('removed')); await loadOffers();
  }

  // ---- Create ----
  $('#createBtn').addEventListener('click', ()=> $('#offerForm').scrollIntoView({behavior:'smooth'}));
  $('#offerForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const payload = {
      restaurant_id: state.restaurant_id,
      title: f.title.value,
      price_cents: Math.round((+f.price.value||0)*100),
      original_price_cents: Math.round((+f.price_old.value||0)*100) || null,
      qty_total: +f.qty_total.value||0,
      qty_left: +f.qty_left.value||0,
      expires_at: f.expires_at.value || null,
      description: f.description.value || '',
      image_url: f.image_url.value || ''
    };
    try{
      await jpost('/api/v1/merchant/offers', payload);
      toast(t('saved')); f.reset(); $('#preview').style.display='none'; await loadOffers();
    }catch{ toast(t('failed')); }
  });

  // ---- Edit modal ----
  const modal = $('#modal'); $('#modalClose').onclick = ()=> modal.classList.add('hidden');
  function openEdit(o){
    modal.classList.remove('hidden');
    const f = $('#editForm');
    f.offer_id.value = o.id;
    f.title.value = o.title||'';
    f.price.value = (o.price_cents||0)/100;
    f.price_old.value = (o.original_price_cents||0)/100;
    f.qty_total.value = o.qty_total||0;
    f.qty_left.value = o.qty_left||0;
    f.expires_at.value = o.expires_at||'';
    f.image_url.value = o.image_url||'';
    f.description.value = o.description||'';
  }
  $('#editForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const id = +f.offer_id.value;
    const payload = {
      restaurant_id: state.restaurant_id,
      title: f.title.value,
      price_cents: Math.round((+f.price.value||0)*100),
      original_price_cents: Math.round((+f.price_old.value||0)*100) || null,
      qty_total: +f.qty_total.value||0,
      qty_left: +f.qty_left.value||0,
      expires_at: f.expires_at.value || null,
      image_url: f.image_url.value || '',
      description: f.description.value || ''
    };
    try{
      await jput(`/api/v1/merchant/offers/${id}`, payload);
      toast(t('saved')); modal.classList.add('hidden'); await loadOffers();
    }catch{ toast(t('failed')); }
  });

  // ---- CSV export ----
  $('#exportBtn').addEventListener('click', ()=>{
    const url = `${FOODY_API}/api/v1/merchant/offers/csv?restaurant_id=${state.restaurant_id}`;
    const a = document.createElement('a'); a.href = url; a.target = '_blank';
    a.download = `offers_${state.restaurant_id}.csv`;
    a.rel = 'noopener'; a.click();
  });

  // ---- DnD + resize + R2 presign ----
  const dz = $('#dropzone'); const fileInput = $('#fileInput'); const preview = $('#preview'); const uploadBtn = $('#uploadBtn');
  let chosenFile = null;
  const pickFile = ()=> fileInput.click();
  dz.addEventListener('click', pickFile);
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { chosenFile = (e.dataTransfer.files||[])[0]||null; showPreview(); });
  fileInput.addEventListener('change', e => { chosenFile = (e.target.files||[])[0]||null; showPreview(); });
  function showPreview(){ if(!chosenFile){ preview.style.display='none'; preview.src=''; return; } const url = URL.createObjectURL(chosenFile); preview.src=url; preview.style.display='block'; }

  async function resizeImage(file, maxSide=1600, quality=0.85){
    if (!file?.type?.startsWith('image/')) return file;
    const img = document.createElement('img');
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=URL.createObjectURL(file); });
    const ratio = img.width/img.height; let w=img.width, h=img.height;
    if (Math.max(w,h)>maxSide){ if(w>=h){ w=maxSide; h=Math.round(maxSide/ratio); } else { h=maxSide; w=Math.round(maxSide*ratio); } }
    const canvas = document.createElement('canvas'); canvas.width=w; canvas.height=h;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
    const blob = await new Promise(res=> canvas.toBlob(res, file.type || 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.(\w+)$/i,'.jpg'), { type: file.type || 'image/jpeg' });
  }
  async function uploadWithPresign(file){
    const presign = await jpost('/api/v1/merchant/uploads/presign', { filename:file.name, content_type:file.type, restaurant_id: state.restaurant_id });
    const form = new FormData();
    Object.entries(presign.fields||{}).forEach(([k,v])=> form.append(k,v));
    form.append('Content-Type', file.type); form.append('file', file);
    const s3 = await fetch(presign.upload_url, { method:'POST', body: form });
    if(!s3.ok) throw new Error('upload');
    return presign.public_url;
  }
  uploadBtn.addEventListener('click', async ()=>{
    if(!chosenFile){ return alert('Выбери файл'); }
    try{
      toast(t('uploading'));
      const resized = await resizeImage(chosenFile, 1600, 0.85);
      const url = await uploadWithPresign(resized);
      document.querySelector('input[name="image_url"]').value = url;
      preview.src = url;
      toast(t('uploaded'));
    }catch(e){ console.error(e); toast('Ошибка загрузки'); }
  });

  // ---- Kickoff ----
  (async function init(){
    await Promise.all([loadOffers(), loadStats()]);
  })();
})();