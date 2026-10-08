// Las pruebas no usan los servicios externos del .env de quien las corre (Didit, Mux, Pollar…):
// así dan lo mismo en cualquier PC y en CI. La prueba que necesite uno lo enciende ella misma.
for (const variable of [
  'POLLAR_API_KEY',
  'WALLETCONNECT_PROJECT_ID',
  'DIDIT_API_KEY',
  'DIDIT_WORKFLOW_ID',
  'DIDIT_WEBHOOK_SECRET',
  'KYC_HMAC_SECRET',
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
  'MUX_WEBHOOK_SECRET',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_KEY_PRIVATE',
  'RESEND_API_KEY',
  'CORREO_REMITENTE',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_CONTACTO',
  'RAMPA_SIMULADA',
  'RAMPA_SIMULADA_LLAVE',
]) {
  process.env[variable] = '';
}
