// netlify/functions/stripe-webhook.js
// MTR YIN — Webhook de Stripe: envía entradas por email tras pago exitoso
//
// Variables de entorno necesarias:
//   STRIPE_SECRET_KEY        → clave secreta Stripe
//   STRIPE_WEBHOOK_SECRET    → secreto del webhook (desde Stripe Dashboard)
//   EMAIL_FROM               → email remitente (ej: entradas@mtryin.com)
//   EMAIL_HOST               → servidor SMTP (ej: smtp.gmail.com)
//   EMAIL_PORT               → puerto SMTP (ej: 587)
//   EMAIL_USER               → usuario SMTP
//   EMAIL_PASS               → contraseña SMTP / app password
//   BASE_URL                 → URL base para QR (ej: https://mtryin.com)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');

// Configurar transporte de email
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generar código único de entrada
function generateTicketCode(paymentIntentId, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`${paymentIntentId}-${index}-MTR-YIN-2026`)
    .digest('hex')
    .toUpperCase()
    .slice(0, 12);
  return `MTRYIN-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

// Generar QR como base64
async function generateQR(code) {
  return await QRCode.toDataURL(code, {
    errorCorrectionLevel: 'H',
    width: 300,
    margin: 2,
    color: { dark: '#0a0a0a', light: '#f0ede8' },
  });
}

// Enviar email con las entradas
async function sendTicketEmail({ email, name, ticketName, quantity, paymentIntentId }) {
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
    const code = generateTicketCode(paymentIntentId, i);
    const qr = await generateQR(code);
    tickets.push({ code, qr });
  }

  const ticketCards = tickets
    .map(
      (t, i) => `
      <div style="background:#1a1a18;border:1px solid rgba(240,237,232,0.15);padding:32px;margin-bottom:24px;text-align:center;">
        <p style="font-family:monospace;font-size:18px;font-weight:bold;color:#f0ede8;letter-spacing:0.15em;margin-bottom:16px;">${t.code}</p>
        <img src="${t.qr}" alt="QR Entrada ${i + 1}" style="width:200px;height:200px;display:block;margin:0 auto 16px;">
        <p style="color:#b0aca5;font-size:13px;margin:0;">Entrada ${i + 1} de ${quantity} · ${ticketName}</p>
      </div>
    `
    )
    .join('');

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
        ¡Tu entrada para <strong>MTR YIN</strong> está confirmada! 🥊<br>
        Aquí tienes ${quantity > 1 ? `tus ${quantity} entradas` : 'tu entrada'}. Guárdalas bien — las necesitarás para acceder al evento.
      </p>

      <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:32px;">
        <table style="width:100%;font-size:14px;">
          <tr><td style="color:#b0aca5;padding:6px 0;">Evento</td><td style="text-align:right;color:#f0ede8;font-weight:500;">MTR YIN</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">20 Junio 2026</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Lugar</td><td style="text-align:right;color:#f0ede8;">Madrid</td></tr>
          <tr><td style="color:#b0aca5;padding:6px 0;">Tipo</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${ticketName}</td></tr>
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

  await transporter.sendMail({
    from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject: `✅ Tu entrada para MTR YIN — ${ticketName}`,
    html,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi = stripeEvent.data.object;
    const { ticket_name, quantity, buyer_name, buyer_email } = pi.metadata;

    if (buyer_email) {
      try {
        await sendTicketEmail({
          email: buyer_email,
          name: buyer_name,
          ticketName: ticket_name || 'Entrada',
          quantity: parseInt(quantity || '1', 10),
          paymentIntentId: pi.id,
        });
        console.log(`Entradas enviadas a ${buyer_email}`);
      } catch (err) {
        console.error('Error enviando email:', err);
        // No fallar el webhook por un error de email
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
