// netlify/functions/generate-free-ticket.js
// MTR YIN — Generador de entradas gratuitas para escuelas participantes
//
// ⚠️  ACCESO RESTRINGIDO: solo accesible con ADMIN_SECRET en cabecera
//
// Variables de entorno necesarias:
//   ADMIN_SECRET    → clave secreta de administración (genera una aleatoria y guárdala)
//   EMAIL_FROM, EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS  → igual que webhook
//
// Uso:
//   POST /.netlify/functions/generate-free-ticket
//   Header: x-admin-secret: TU_ADMIN_SECRET
//   Body: { "email": "...", "name": "...", "ticketType": "general|primera_fila|vip_cena", "qty": 1, "school": "Nombre del gimnasio", "note": "Opcional" }
//
// La entrada generada NO muestra precio alguno — solo el tipo de acceso.

const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');

const TICKET_LABELS = {
  general:      'Acceso General',
  primera_fila: 'Acceso Primera Fila',
  vip_cena:     'Acceso VIP + Cena',
};

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function generateTicketCode(seed, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`FREE-${seed}-${index}-MTR-YIN-2026-${Date.now()}`)
    .digest('hex')
    .toUpperCase();
  return `MTRYIN-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

async function generateQR(code) {
  return await QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: { dark: '#0a0a0a', light: '#f0ede8' },
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  // Verificar secret de administración
  const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'];
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { email, name, ticketType, qty, school, note } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };
  }
  if (!ticketType || !TICKET_LABELS[ticketType]) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticketType inválido (general|primera_fila|vip_cena)' }) };
  }
  const quantity = Math.min(parseInt(qty || '1', 10), 20);
  const label = TICKET_LABELS[ticketType];
  const seed = `${email}-${school || 'escuela'}-${ticketType}`;

  // Generar entradas
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
    const code = generateTicketCode(seed, i);
    const qr = await generateQR(code);
    tickets.push({ code, qr });
  }

  // Construir email SIN precio
  const ticketCards = tickets
    .map(
      (t, i) => `
      <div style="background:#1a1a18;border:1px solid rgba(240,237,232,0.15);padding:32px;margin-bottom:24px;text-align:center;">
        <p style="font-family:monospace;font-size:18px;font-weight:bold;color:#f0ede8;letter-spacing:0.15em;margin-bottom:16px;">${t.code}</p>
        <img src="${t.qr}" alt="QR Entrada ${i + 1}" style="width:200px;height:200px;display:block;margin:0 auto 16px;">
        <p style="color:#b0aca5;font-size:13px;margin:0;">Entrada ${i + 1} de ${quantity}</p>
      </div>
    `
    )
    .join('');

  const schoolLine = school
    ? `<tr><td style="color:#b0aca5;padding:6px 0;">Escuela</td><td style="text-align:right;color:#f0ede8;">${school}</td></tr>`
    : '';
  const noteLine = note
    ? `<p style="font-size:13px;color:#b0aca5;margin-bottom:24px;font-style:italic;">${note}</p>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="background:#0a0a0a;color:#f0ede8;font-family:'Barlow',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
      <div style="text-align:center;margin-bottom:48px;">
        <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
        <h1 style="font-size:56px;font-weight:900;letter-spacing:0.02em;line-height:0.9;margin:0;">MTR<br><span style="display:block;width:100%;height:4px;background:#f0ede8;margin:6px 0;"></span>YIN</h1>
        <p style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">ROMPIENDO LAS NORMAS</p>
      </div>

      <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:32px;">
        Hola <strong>${name || 'campeón/a'}</strong>,<br><br>
        ¡Bienvenida/o a <strong>MTR YIN</strong>! 🥊<br>
        Aquí tienes ${quantity > 1 ? `tus ${quantity} entradas` : 'tu entrada'} de acceso al evento.
      </p>

      ${noteLine}

      <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:32px;">
        <table style="width:100%;font-size:14px;">
          <tr><td style="color:#b0aca5;padding:6px 0;">Evento</td><td style="text-align:right;color:#f0ede8;font-weight:500;">MTR YIN</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">20 Junio 2026</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Lugar</td><td style="text-align:right;color:#f0ede8;">Madrid</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
          ${schoolLine}
          <tr><td style="color:#b0aca5;padding:6px 0;">Entradas</td><td style="text-align:right;color:#f0ede8;">${quantity}</td></tr>
        </table>
      </div>

      ${ticketCards}

      <p style="font-size:13px;color:#b0aca5;line-height:1.7;margin-top:32px;border-top:1px solid rgba(240,237,232,0.08);padding-top:24px;">
        Presenta el código QR en la entrada del recinto. Cada código es válido para una única persona.<br>
        Para cualquier consulta: <a href="mailto:info@mtryin.com" style="color:#f0ede8;">info@mtryin.com</a>
      </p>
      <p style="font-size:11px;color:rgba(176,172,165,0.4);margin-top:24px;text-align:center;">© 2026 MTR YIN — Muay Thai Revolution</p>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎟️ Tu entrada para MTR YIN — ${label}`,
      html,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: `${quantity} entrada(s) enviada(s) a ${email}`,
        codes: tickets.map(t => t.code),
      }),
    };
  } catch (err) {
    console.error('Error enviando email:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error enviando el email: ' + err.message }),
    };
  }
};
