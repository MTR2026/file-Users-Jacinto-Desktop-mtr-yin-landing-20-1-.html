// netlify/functions/generate-free-ticket.js
// MTR YIN — Generador de entradas para escuelas (con QR, número y PVP)

const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');

const TICKET_LABELS = {
  general:      'Acceso General',
  primera_fila: 'Acceso Primera Fila',
  vip_cena:     'Acceso VIP + Cena',
};

const TICKET_PVP = {
  general:      35,
  primera_fila: 50,
  vip_cena:     75,
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

async function registerTicket(code, ticketType, ticketName, buyerName, buyerEmail, entryNumber, totalEntries, school, pvp) {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/validate-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_SECRET,
      },
      body: JSON.stringify({
        action: 'register',
        code,
        ticketData: {
          ticket_type: ticketType,
          ticket_name: ticketName,
          buyer_name: buyerName,
          buyer_email: buyerEmail,
          entry_number: entryNumber,
          total_entries: totalEntries,
          school,
          pvp,
          is_free: true,
        },
      }),
    });
  } catch (e) {
    console.warn('No se pudo registrar la entrada en BD:', e.message);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };

  const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'];
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { email, name, ticketType, qty, school, note } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };
  if (!ticketType || !TICKET_LABELS[ticketType])
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticketType inválido' }) };

  const quantity = Math.min(parseInt(qty || '1', 10), 20);
  const label = TICKET_LABELS[ticketType];
  const pvp = TICKET_PVP[ticketType];
  const seed = `${email}-${school || 'escuela'}-${ticketType}-${Date.now()}`;

  // Generar entradas
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
    const code = generateTicketCode(seed, i);
    const qr = await generateQR(code);
    tickets.push({ code, qr, number: i + 1 });

    // Registrar en BD
    await registerTicket(code, ticketType, label, name, email, i + 1, quantity, school, pvp);
  }

  // Construir email
  const schoolLine = school
    ? `<tr><td style="color:#b0aca5;padding:6px 0;">Escuela</td><td style="text-align:right;color:#f0ede8;">${school}</td></tr>`
    : '';
  const noteLine = note
    ? `<p style="font-size:13px;color:#b0aca5;margin-bottom:24px;font-style:italic;">${note}</p>`
    : '';

  const ticketCards = tickets.map((t) => `
    <div style="background:#1a1a18;border:1px solid rgba(240,237,232,0.15);padding:32px;margin-bottom:24px;text-align:center;">
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">ENTRADA ${t.number} DE ${quantity}</p>
      <p style="font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;font-weight:900;color:#f0ede8;letter-spacing:0.05em;margin-bottom:4px;">${label}</p>
      <p style="font-size:13px;color:#b0aca5;margin-bottom:4px;">PVP: <strong style="color:#f0ede8;">${pvp}€</strong></p>
      <p style="font-size:11px;color:#b0aca5;margin-bottom:20px;">#${String(t.number).padStart(4,'0')}</p>
      <img src="${t.qr}" alt="QR" style="width:200px;height:200px;display:block;margin:0 auto 16px;">
      <p style="font-family:monospace;font-size:14px;font-weight:bold;color:#f0ede8;letter-spacing:0.12em;">${t.code}</p>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
      <div style="text-align:center;margin-bottom:48px;">
        <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
        <h1 style="font-size:56px;font-weight:900;line-height:0.9;margin:0;">MTR<br><span style="display:block;width:100%;height:4px;background:#f0ede8;margin:6px 0;"></span>YIN</h1>
        <p style="font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">20 JUNIO 2026 · MADRID</p>
      </div>
      <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:32px;">
        Hola <strong>${name || 'campeón/a'}</strong>,<br><br>
        Aquí tienes ${quantity > 1 ? `tus ${quantity} entradas` : 'tu entrada'} para <strong>MTR YIN</strong>. 🥊
      </p>
      ${noteLine}
      <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:32px;">
        <table style="width:100%;font-size:14px;">
          <tr><td style="color:#b0aca5;padding:6px 0;">Evento</td><td style="text-align:right;color:#f0ede8;font-weight:500;">MTR YIN</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">20 Junio 2026</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Lugar</td><td style="text-align:right;color:#f0ede8;">Madrid</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">PVP</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${pvp}€</td></tr>
          ${schoolLine}
          <tr><td style="color:#b0aca5;padding:6px 0;">Entradas</td><td style="text-align:right;color:#f0ede8;">${quantity}</td></tr>
        </table>
      </div>
      ${ticketCards}
      <p style="font-size:13px;color:#b0aca5;line-height:1.7;margin-top:32px;border-top:1px solid rgba(240,237,232,0.08);padding-top:24px;">
        Presenta el código QR en la entrada. Cada código es de uso único.<br>
        Contacto: <a href="mailto:contacto@muaythairevolution.es" style="color:#f0ede8;">contacto@muaythairevolution.es</a>
      </p>
      <p style="font-size:11px;color:rgba(176,172,165,0.4);margin-top:24px;text-align:center;">© 2026 MTR YIN — Muay Thai Revolution</p>
    </body></html>
  `;

  try {
    await transporter.sendMail({
      from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎟️ Tu entrada para MTR YIN — ${label}`,
      html,
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        message: `${quantity} entrada(s) enviada(s) a ${email}`,
        codes: tickets.map(t => t.code),
      }),
    };
  } catch (err) {
    console.error('Error email:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error enviando email: ' + err.message }) };
  }
};
