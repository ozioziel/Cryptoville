// Service worker de WorkVille: solo muestra las notificaciones del navegador (Web Push).
// No guarda nada en caché. Al tocar una notificación se abre (o se enfoca) la app en el pedido o «Se busca».
self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { texto: evento.data ? evento.data.text() : '' };
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'WorkVille', {
      body: datos.texto || 'Tienes un aviso nuevo',
      icon: '/assets/brand/workville-logo-cropped.png',
      badge: '/assets/brand/workville-logo-cropped.png',
      data: { url: datos.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = (evento.notification.data && evento.notification.data.url) || '/';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          if ('navigate' in v) v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
