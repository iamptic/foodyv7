(() => {
  const $ = (s,r=document)=>r.querySelector(s);
  const tg = window.Telegram?.WebApp; if (tg){ tg.expand(); const apply=()=>{const s=tg.colorScheme||'dark';document.documentElement.dataset.theme=s;}; apply(); tg.onEvent?.('themeChanged',apply); }
  const state = { api: (window.__FOODY__&&window.__FOODY__.FOODY_API)||"https://foodyback-production.up.railway.app", lang: localStorage.getItem('foody_buyer_lang') || (tg?.initDataUnsafe?.user?.language_code||'ru').slice(0,2) };
  const dict={ ru:{ reserve:'Забронировать', left:'Осталось', until:'До', price:'Цена', old:'Старая', no:'Нет офферов', booked:'Забронировано ✅', fail:'Не удалось забронировать', search:'Поиск / Search' },
               en:{ reserve:'Reserve', left:'Left', until:'Until', price:'Price', old:'Old', no:'No offers', booked:'Reserved ✅', fail:'Reservation failed', search:'Search' } };
  const t=k=>(dict[state.lang]&&dict[state.lang][k])||dict.ru[k]||k;
  $('#langBtn')?.addEventListener('click',()=>{ state.lang=state.lang==='ru'?'en':'ru'; localStorage.setItem('foody_buyer_lang',state.lang); render(); });

  async function api(path){ const r = await fetch(state.api+path); if(!r.ok) throw new Error(r.statusText); return r.json(); }
  let offers=[];

  const grid = $('#grid'), q = $('#q');
  function render(){
    q.placeholder = dict[state.lang].search;
    grid.innerHTML = '';
    const qs = (q.value||'').toLowerCase();
    const list = offers.filter(o => !qs || (o.title||'').toLowerCase().includes(qs));
    if (!list.length){ grid.innerHTML = '<div class="card"><div class="p">'+t('no')+'</div></div>'; return; }
    list.forEach(o=>{
      const price = (o.price_cents||0)/100, old = (o.original_price_cents||0)/100;
      const disc = old>0? Math.round((1-price/old)*100):0;
      const el = document.createElement('div'); el.className='card';
      el.innerHTML = '<img src="'+(o.image_url||'')+'" alt="">' +
        '<div class="p"><div class="price">'+price.toFixed(0)+' ₽'+(old?'<span class="badge">-'+disc+'%</span>':'')+'</div>' +
        '<div>'+(o.title||'—')+'</div>' +
        '<div class="meta"><span>'+t('left')+': '+(o.qty_left??'—')+'</span></div></div>';
      el.onclick = ()=>open(o); grid.appendChild(el);
    });
  }

  function open(o){
    $('#sTitle').textContent = o.title||'—';
    $('#sImg').src = o.image_url||'';
    $('#sPrice').textContent = ((o.price_cents||0)/100).toFixed(0)+' ₽';
    const old=(o.original_price_cents||0)/100; $('#sOld').textContent = old? (old.toFixed(0)+' ₽') : '—';
    $('#sQty').textContent = (o.qty_left??'—') + ' / ' + (o.qty_total??'—');
    $('#sExp').textContent = o.expires_at? new Date(o.expires_at).toLocaleString() : '—';
    $('#sDesc').textContent = o.description||'';
    $('#sheet').classList.remove('hidden');
    $('#reserveBtn').onclick = async ()=>{
      try{
        const resp = await fetch(state.api+'/api/v1/public/reserve',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ offer_id: o.id||o.offer_id, name:'TG', phone:'' }) });
        if(!resp.ok) throw new Error('reserve');
        toast(''+t('booked'));
      }catch(_){ toast(''+t('fail')); }
    };
  }
  $('#sheetClose').onclick = ()=>$('#sheet').classList.add('hidden');
  $('#refresh').onclick = load;
  q.oninput = render;

  const toastBox = document.getElementById('toast');
  const toast = (m)=>{ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),3200); };

  async function load(){ offers = await api('/api/v1/offers').catch(()=>[]); render(); }
  load();
})();