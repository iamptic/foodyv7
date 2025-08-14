// Use this helper instead of fetch to avoid logout on server 5xx
export async function apiFetch(url, opts={}){
  const res = await fetch(url, opts);
  if (res.ok) return res;
  if (res.status === 401){
    localStorage.removeItem('rid'); localStorage.removeItem('key');
    alert('Нужно войти');
    throw new Error('401 Unauthorized');
  }
  console.error('API error', res.status, await res.text().catch(()=>''));
  alert('Ошибка сервера. Попробуйте ещё раз');
  throw new Error('API ' + res.status);
}
