// Notificaciones del navegador (Web Push): se activan por dispositivo, con permiso de la persona.
// Solo funcionan si el servidor tiene las llaves VAPID (la pública llega en /api/config).
import { api } from '../../lib/api';

function bytesDeBase64Url(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(b64);
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

export function pushDisponible(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registro(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

/** ¿Este navegador ya tiene las notificaciones activas? */
export async function pushActivo(): Promise<boolean> {
  if (!pushDisponible()) return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return Boolean(await reg?.pushManager.getSubscription());
}

export async function activarPush(llavePublica: string): Promise<void> {
  if (!pushDisponible()) throw new Error('Tu navegador no permite notificaciones (en iPhone, primero agrega WorkVille a la pantalla de inicio).');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones. Puedes darlo desde la configuración del navegador.');
  const reg = await registro();
  const suscripcion =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeBase64Url(llavePublica) }));
  const json = suscripcion.toJSON();
  await api('/notificaciones/push', { cuerpo: { endpoint: json.endpoint, keys: json.keys } });
}

export async function desactivarPush(): Promise<void> {
  if (!pushDisponible()) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const suscripcion = await reg?.pushManager.getSubscription();
  if (!suscripcion) return;
  await api('/notificaciones/push/quitar', { cuerpo: { endpoint: suscripcion.endpoint } });
  await suscripcion.unsubscribe();
}
