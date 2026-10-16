export async function logoutSession() {
  const response = await fetch('/api/auth/session', {method:'DELETE',credentials:'same-origin'});
  if(!response.ok) throw new Error('Sesi belum berhasil ditutup. Coba lagi.');
}
