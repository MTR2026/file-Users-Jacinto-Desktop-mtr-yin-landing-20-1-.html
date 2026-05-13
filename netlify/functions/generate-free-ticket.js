// netlify/functions/generate-free-ticket.js
// MTR YIN — Generador de entradas PDF para escuelas

const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

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
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function generateTicketCode(seed, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`FREE-${seed}-${index}-MTR-YIN-2026-${Date.now()}`)
    .digest('hex').toUpperCase();
  return `MTRYIN-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}`;
}

async function generateQRDataURL(code) {
  return await QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H', width: 250, margin: 1,
    color: { dark: '#0a0a0a', light: '#f0ede8' },
  });
}

function buildTicketHTML(ticket, label, pvp, school, name, quantity) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a0a; color:#f0ede8; font-family:Arial,sans-serif; width:595px; height:842px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px; }
.badge { font-size:10px; letter-spacing:0.4em; text-transform:uppercase; color:#b0aca5; margin-bottom:10px; text-align:center; }
.title { font-size:52px; font-weight:900; line-height:0.9; text-align:center; }
.sep { width:100%; height:4px; background:#f0ede8; margin:5px 0; }
.sub { font-size:11px; letter-spacing:0.3em; text-transform:uppercase; color:#b0aca5; text-align:center; margin-bottom:32px; }
.ticket-box { border:1px solid rgba(240,237,232,0.2); padding:28px; width:100%; display:flex; gap:28px; align-items:center; margin-bottom:20px; }
.ticket-left { flex:1; }
.entry-num { font-size:10px; letter-spacing:0.3em; text-transform:uppercase; color:#b0aca5; margin-bottom:6px; }
.ticket-type { font-size:26px; font-weight:900; margin-bottom:8px; }
.pvp { font-size:13px; color:#b0aca5; }
.pvp strong { color:#f0ede8; font-size:20px; }
.number { font-size:11px; color:#b0aca5; margin-top:8px; }
.ticket-right img { width:160px; height:160px; display:block; }
.info-table { width:100%; border-top:1px solid rgba(240,237,232,0.1); padding-top:14px; }
.info-row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(240,237,232,0.06); font-size:12px; }
.info-row:last-child { border:none; }
.info-lbl { color:#b0aca5; }
.info-val { color:#f0ede8; font-weight:500; }
.code { font-family:monospace; font-size:12px; color:rgba(240,237,232,0.45); text-align:center; margin-top:16px; letter-spacing:0.1em; }
.notice { font-size:10px; color:#b0aca5; text-align:center; margin-top:10px; }
.footer { font-size:10px; color:rgba(176,172,165,0.3); text-align:center; margin-top:auto; padding-top:20px; }
</style></head>
<body>
  <p class="badge">Muay Thai Revolution</p>
  <p class="title">MTR</p>
  <div class="sep"></div>
  <p class="title">YIN</p>
  <p class="sub">20 Junio 2026 · Madrid</p>
  <div class="ticket-box">
    <div class="ticket-left">
      <p class="entry-num">Entrada ${ticket.number} de ${quantity}</p>
      <p class="ticket-type">${label}</p>
      <p class="pvp">PVP: <strong>${pvp}€</strong></p>
      <p class="number">#${String(ticket.number).padStart(4,'0')}</p>
      ${school ? `<p style="font-size:11px;color:#b0aca5;margin-top:6px;">${school}</p>` : ''}
      ${name ? `<p style="font-size:11px;color:#b0aca5;margin-top:2px;">${name}</p>` : ''}
    </div>
    <div class="ticket-right"><img src="${ticket.qr}" alt="QR"></div>
  </div>
  <div class="info-table">
    <div class="info-row"><span class="info-lbl">Evento</span><span class="info-val">MTR YIN — Primera Velada Femenina Profesional</span></div>
    <div class="info-row"><span class="info-lbl">Fecha</span><span class="info-val">Viernes, 20 de Junio de 2026</span></div>
    <div class="info-row"><span class="info-lbl">Lugar</span><span class="info-val">Madrid</span></div>
    <div class="info-row"><span class="info-lbl">Acceso</span><span class="info-val">${label}</span></div>
  </div>
  <p class="code">${ticket.code}</p>
  <p class="notice">Presenta este QR en la entrada · Uso único · No transferible</p>
  <p class="footer">© 2026 MTR YIN — Muay Thai Revolution · contacto@muaythairevolution.es</p>
</body></html>`;
}

async function generatePDF(html) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ width: '595px', height: '842px', printBackground: true });
  await browser.close();
  return pdf;
}

async function registerTicket(code, ticketType, ticketName, buyerName, buyerEmail, entryNumber, totalEntries, school, pvp) {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/validate-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
      body: JSON.stringify({
        action: 'register', code,
        ticketData: { ticket_type: ticketType, ticket_name: ticketName, buyer_name: buyerName, buyer_email: buyerEmail, entry_number: entryNumber, total_entries: totalEntries, school, pvp, is_free: true },
      }),
    });
  } catch (e) { console.warn('No se pudo registrar en BD:', e.message); }
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
  if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET)
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { email, name, ticketType, qty, school, note } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };
  if (!ticketType || !TICKET_LABELS[ticketType])
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ticketType inválido' }) };

  const quantity = Math.min(parseInt(qty || '1', 10), 10);
  const label = TICKET_LABELS[ticketType];
  const pvp = TICKET_PVP[ticketType];
  const seed = `${email}-${school || 'escuela'}-${ticketType}-${Date.now()}`;

  // Generar entradas + PDFs
  const tickets = [];
  const pdfAttachments = [];

  for (let i = 0; i < quantity; i++) {
    const code = generateTicketCode(seed, i);
    const qr = await generateQRDataURL(code);
    tickets.push({ code, qr, number: i + 1 });
    await registerTicket(code, ticketType, label, name, email, i + 1, quantity, school, pvp);
    const html = buildTicketHTML({ code, qr, number: i + 1 }, label, pvp, school, name, quantity);
    const pdfBuffer = await generatePDF(html);
    pdfAttachments.push({
      filename: `MTR-YIN-entrada-${String(i+1).padStart(4,'0')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const noteLine = note ? `<p style="font-size:13px;color:#b0aca5;margin-bottom:20px;font-style:italic;">${note}</p>` : '';

  const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
  <body style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
      <h1 style="font-size:52px;font-weight:900;line-height:0.9;margin:0;">MTR<br><span style="display:block;height:4px;background:#f0ede8;margin:5px 0;"></span>YIN</h1>
      <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">20 JUNIO 2026 · MADRID</p>
    </div>
    <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:20px;">
      Hola <strong>${name || 'campeón/a'}</strong>,<br><br>
      Adjunto encontrarás ${quantity > 1 ? `tus <strong>${quantity} entradas</strong>` : 'tu <strong>entrada</strong>'} en PDF para <strong>MTR YIN</strong>. 🥊<br>
      Cada PDF incluye el código QR para acceder al evento.
    </p>
    ${noteLine}
    <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:20px;">
      <table style="width:100%;font-size:14px;">
        <tr><td style="color:#b0aca5;padding:5px 0;">Evento</td><td style="text-align:right;color:#f0ede8;">MTR YIN</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">20 Junio 2026 · Madrid</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
        <tr><td style="color:#b0aca5;padding:5px 0;">PVP</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${pvp}€</td></tr>
        ${school ? `<tr><td style="color:#b0aca5;padding:5px 0;">Escuela</td><td style="text-align:right;color:#f0ede8;">${school}</td></tr>` : ''}
        <tr><td style="color:#b0aca5;padding:5px 0;">Entradas</td><td style="text-align:right;color:#f0ede8;">${quantity}</td></tr>
      </table>
    </div>
    <p style="font-size:13px;color:#b0aca5;line-height:1.7;border-top:1px solid rgba(240,237,232,0.08);padding-top:20px;">
      Presenta el PDF con el QR en la entrada. Cada entrada es de uso único y no transferible.<br>
      Contacto: <a href="mailto:contacto@muaythairevolution.es" style="color:#f0ede8;">contacto@muaythairevolution.es</a>
    </p>
    <p style="font-size:11px;color:rgba(176,172,165,0.3);margin-top:20px;text-align:center;">© 2026 MTR YIN — Muay Thai Revolution</p>
  </body></html>`;

  try {
    await transporter.sendMail({
      from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: `🎟️ Tu entrada PDF para MTR YIN — ${label}`,
      html: emailHtml,
      attachments: pdfAttachments,
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, message: `${quantity} entrada(s) PDF enviada(s) a ${email}`, codes: tickets.map(t => t.code) }),
    };
  } catch (err) {
    console.error('Error email:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error enviando email: ' + err.message }) };
  }
};
