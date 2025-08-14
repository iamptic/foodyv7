(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const tg = window.Telegram?.WebApp; if (tg){ tg.expand(); const apply=()=>{const s=tg.colorScheme||'dark';document.documentElement.dataset.theme=s;}; apply(); tg.onEvent?.('themeChanged',apply); }
  const API = (window.__FOODY__&&window.__FOODY__.FOODY_API)||"https://foodyback-production.up.railway.app";

  const toastBox = $('#toast'); const toast=(m)=>{ const el=document.createElement('div'); el.className='toast'; el.textContent=m; toastBox.appendChild(el); setTimeout(()=>el.remove(),3200); };

  $('#regForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const f = e.target;
    const payload = { name: f.name.value, phone: f.phone.value };
    try{
      const r = await fetch(API+'/api/v1/merchant/register_public', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      if(!r.ok) throw new Error('register');
      const data = await r.json();
      $('#rid').textContent = data.restaurant_id;
      $('#key').textContent = data.api_key;
      document.getElementById('result').classList.remove('hidden');
      toast('Ресторан зарегистрирован');
    }catch(_){ toast('Не удалось зарегистрировать'); }
  });

  $('#copyBtn').addEventListener('click', async ()=>{
    const txt = 'Restaurant ID: '+$('#rid').textContent+'\nAPI Key: '+$('#key').textContent;
    try{ await navigator.clipboard.writeText(txt); toast('Скопировано'); }catch{ toast('Не удалось скопировать'); }
  });

  $('#openBtn').addEventListener('click', ()=>{
    const rid = $('#rid').textContent, key = $('#key').textContent;
    localStorage.setItem('rid', rid); localStorage.setItem('key', key);
    location.href = '/web/merchant/?rid='+encodeURIComponent(rid)+'&key='+encodeURIComponent(key);
  });
})();