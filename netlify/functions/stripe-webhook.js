// netlify/functions/stripe-webhook.js
// MTR YIN — Webhook de Stripe: genera PDF y envía entrada por email

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587', 10),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function generateTicketCode(paymentIntentId, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`${paymentIntentId}-${index}-MTR-YIN-2026`)
    .digest('hex').toUpperCase();
  return `MTRYIN-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}`;
}

async function generateQRBuffer(code) {
  return await QRCode.toBuffer(code, {
    errorCorrectionLevel: 'H', width: 200, margin: 1,
    color: { dark: '#000000', light: '#f0ede8' },
  });
}

async function generatePDF(ticket, label, pvp, name, entryNumber, quantity) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'MTR YIN — Entrada', Author: 'Muay Thai Revolution' } });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const W = 595.28, H = 841.89, pad = 48;

    doc.rect(0, 0, W, H).fill('#0a0a0a');

    doc.fontSize(8).fillColor('#b0aca5').font('Helvetica')
      .text('MUAY THAI REVOLUTION', pad, pad, { align: 'center', width: W - pad*2, characterSpacing: 3 });

    doc.fontSize(56).fillColor('#f0ede8').font('Helvetica-Bold')
      .text('MTR', pad, pad + 20, { align: 'center', width: W - pad*2 });

    const sepY = pad + 90;
    doc.rect(pad, sepY, W - pad*2, 4).fill('#f0ede8');

    doc.fontSize(56).fillColor('#f0ede8').font('Helvetica-Bold')
      .text('YIN', pad, sepY + 8, { align: 'center', width: W - pad*2 });

    doc.fontSize(9).fillColor('#b0aca5').font('Helvetica')
      .text('20 JUNIO 2026 · MAD FIGHT STADIUM · SAN SEBASTIÁN DE LOS REYES', pad, sepY + 72, { align: 'center', width: W - pad*2, characterSpacing: 1 });

    const boxY = sepY + 100;
    const boxH = 180;
    doc.rect(pad, boxY, W - pad*2, boxH).stroke('#444444');

    doc.fontSize(8).fillColor('#b0aca5').font('Helvetica')
      .text(`ENTRADA ${entryNumber} DE ${quantity}`, pad + 20, boxY + 18, { characterSpacing: 2 });

    doc.fontSize(22).fillColor('#f0ede8').font('Helvetica-Bold')
      .text(label, pad + 20, boxY + 34);

    doc.fontSize(11).fillColor('#b0aca5').font('Helvetica')
      .text('PVP: ', pad + 20, boxY + 68, { continued: true })
      .fontSize(18).fillColor('#f0ede8').font('Helvetica-Bold')
      .text(`${pvp}€`);

    doc.fontSize(10).fillColor('#b0aca5').font('Helvetica')
      .text(`#${String(entryNumber).padStart(4,'0')}`, pad + 20, boxY + 96);

    if (name) {
      doc.fontSize(10).fillColor('#b0aca5').font('Helvetica')
        .text(name, pad + 20, boxY + 116);
    }

    const qrBuf = await generateQRBuffer(ticket.code);
    const qrSize = 140;
    doc.image(qrBuf, W - pad - qrSize - 10, boxY + (boxH - qrSize) / 2, { width: qrSize, height: qrSize });

    const tableY = boxY + boxH + 24;
    const rows = [
      ['Evento', 'MTR YIN — Primera Velada Femenina Profesional'],
      ['Fecha', 'Viernes, 20 de Junio de 2026'],
      ['Lugar', 'Mad Fight Stadium, San Sebastián de los Reyes'],
      ['Acceso', label],
    ];

    doc.rect(pad, tableY - 8, W - pad*2, 1).fill('#2a2a2a');
    rows.forEach((row, i) => {
      const rowY = tableY + i * 26;
      doc.fontSize(11).fillColor('#b0aca5').font('Helvetica').text(row[0], pad, rowY);
      doc.fontSize(11).fillColor('#f0ede8').font('Helvetica-Bold').text(row[1], W/2, rowY, { width: W/2 - pad, align: 'right' });
      doc.rect(pad, rowY + 18, W - pad*2, 1).fill('#1a1a1a');
    });

    const codeY = tableY + rows.length * 26 + 16;
    doc.fontSize(11).fillColor('#555555').font('Helvetica')
      .text(ticket.code, pad, codeY, { align: 'center', width: W - pad*2, characterSpacing: 1 });

    // Instrucciones
    const infoY = codeY + 28;
    doc.rect(pad, infoY, W - pad*2, 1).fill('#2a2a2a');

    const infoLines = [
      '📍 CÓMO LLEGAR: Mad Fight Stadium — Av. de los Gavilanes, San Sebastián de los Reyes, Madrid.',
      '   Metro: Línea 10, estación Baunatal. Bus: 151, 153 desde Plaza de Castilla.',
      '',
      label.includes('VIP') ? '⭐ ACCESO VIP: Acceso preferente por entrada exclusiva VIP. Incluye cena.' : '',
      label.includes('Primera') ? '💺 PRIMERA FILA: Asientos numerados asignados el día del evento en taquilla.' : '',
      '🚪 PUERTAS: Se abren 30 minutos antes del evento. El evento es PUNTUAL — no llegues tarde.',
      '🚫 NO se permite la devolución de entradas bajo ningún concepto.',
      '📱 Presenta este QR en la entrada. Uso único y no transferible.',
    ].filter(l => l !== '');

    let lineY = infoY + 12;
    infoLines.forEach(line => {
      if (line) {
        doc.fontSize(9).fillColor('#b0aca5').font('Helvetica')
          .text(line, pad, lineY, { width: W - pad*2 });
        lineY += 16;
      }
    });

    doc.fontSize(8).fillColor('#333333').font('Helvetica')
      .text('© 2026 MTR YIN — Muay Thai Revolution · contacto@muaythairevolution.es', pad, H - 32, { align: 'center', width: W - pad*2 });

    doc.end();
  });
}

async function registerTicket(code, ticketType, ticketName, buyerName, buyerEmail, entryNumber, totalEntries, pvp) {
  try {
    await fetch(`${process.env.URL}/.netlify/functions/validate-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.ADMIN_SECRET },
      body: JSON.stringify({
        action: 'register', code,
        ticketData: { ticket_type: ticketType, ticket_name: ticketName, buyer_name: buyerName, buyer_email: buyerEmail, entry_number: entryNumber, total_entries: totalEntries, pvp, is_free: false },
      }),
    });
  } catch(e) { console.warn('No se pudo registrar en BD:', e.message); }
}

const TICKET_NAMES = { general: 'Acceso General', primera_fila: 'Acceso Primera Fila', vip_cena: 'Acceso VIP + Cena' };
const TICKET_PVP = { general: 35, primera_fila: 50, vip_cena: 75 };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'payment_intent.succeeded') {
    const pi = stripeEvent.data.object;
    const { ticket_type, ticket_name, quantity, buyer_name, buyer_email, discount_pct } = pi.metadata;
    const qty = parseInt(quantity || '1', 10);
    const label = ticket_name || TICKET_NAMES[ticket_type] || 'Entrada';
    const pvp = TICKET_PVP[ticket_type] || 0;
    const discountPct = parseInt(discount_pct || '0', 10);
    const finalPvp = discountPct > 0 ? Math.round(pvp * (100 - discountPct) / 100) : pvp;

    if (buyer_email) {
      try {
        // Generar entradas y PDFs
        const tickets = [];
        const pdfAttachments = [];

        for (let i = 0; i < qty; i++) {
          const code = generateTicketCode(pi.id, i);
          tickets.push({ code, number: i + 1 });
          await registerTicket(code, ticket_type, label, buyer_name, buyer_email, i + 1, qty, finalPvp);
          const pdfBuffer = await generatePDF({ code }, label, finalPvp, buyer_name, i + 1, qty);
          pdfAttachments.push({
            filename: `MTR-YIN-entrada-${String(i+1).padStart(4,'0')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          });
        }

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
        <body style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:40px;">
            <p style="font-size:11px;letter-spacing:0.4em;text-transform:uppercase;color:#b0aca5;margin-bottom:8px;">MUAY THAI REVOLUTION</p>
            <h1 style="font-size:52px;font-weight:900;line-height:0.9;margin:0;">MTR<br><span style="display:block;height:4px;background:#f0ede8;margin:5px 0;"></span>YIN</h1>
            <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b0aca5;margin-top:8px;">20 JUNIO 2026 · MADRID</p>
          </div>
          <p style="font-size:16px;font-weight:300;line-height:1.7;margin-bottom:20px;">
            Hola <strong>${buyer_name || 'campeón/a'}</strong>,<br><br>
            ¡Tu compra está confirmada! 🥊 Adjunto encontrarás ${qty > 1 ? `tus <strong>${qty} entradas</strong>` : 'tu <strong>entrada</strong>'} en PDF.<br>
            Presenta el QR en la entrada del recinto.
          </p>
          <div style="background:rgba(240,237,232,0.05);border:1px solid rgba(240,237,232,0.1);padding:20px;margin-bottom:20px;">
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#b0aca5;padding:5px 0;">Evento</td><td style="text-align:right;color:#f0ede8;">MTR YIN</td></tr>
              <tr><td style="color:#b0aca5;padding:5px 0;">Fecha</td><td style="text-align:right;color:#f0ede8;">20 Junio 2026</td></tr>
              <tr><td style="color:#b0aca5;padding:5px 0;">Lugar</td><td style="text-align:right;color:#f0ede8;">Mad Fight Stadium, San Sebastián de los Reyes</td></tr>
              <tr><td style="color:#b0aca5;padding:5px 0;">Acceso</td><td style="text-align:right;color:#f0ede8;font-weight:600;">${label}</td></tr>
              <tr><td style="color:#b0aca5;padding:5px 0;">Entradas</td><td style="text-align:right;color:#f0ede8;">${qty}</td></tr>
            </table>
          </div>
          <div style="background:rgba(240,237,232,0.03);border:1px solid rgba(240,237,232,0.08);padding:20px;margin-bottom:20px;font-size:13px;line-height:1.8;color:#b0aca5;">
            <p>📍 <strong style="color:#f0ede8;">Cómo llegar:</strong> Mad Fight Stadium — Av. de los Gavilanes, San Sebastián de los Reyes. Metro L10 estación Baunatal. Bus 151/153 desde Plaza de Castilla.</p>
            ${label.includes('VIP') ? '<p>⭐ <strong style="color:#f0ede8;">Acceso VIP:</strong> Entrada exclusiva VIP con acceso preferente. Incluye cena.</p>' : ''}
            ${label.includes('Primera') ? '<p>💺 <strong style="color:#f0ede8;">Primera Fila:</strong> Asientos numerados asignados el día del evento en taquilla.</p>' : ''}
            <p>🚪 <strong style="color:#f0ede8;">Puertas:</strong> Se abren 30 minutos antes. El evento es puntual — ¡no llegues tarde!</p>
            <p>🚫 <strong style="color:#f0ede8;">Sin devoluciones.</strong> Las entradas no son reembolsables bajo ningún concepto.</p>
          </div>
          <p style="font-size:13px;color:#b0aca5;line-height:1.7;border-top:1px solid rgba(240,237,232,0.08);padding-top:20px;">
            Contacto: <a href="mailto:contacto@muaythairevolution.es" style="color:#f0ede8;">contacto@muaythairevolution.es</a>
          </p>
          <p style="font-size:11px;color:rgba(176,172,165,0.3);margin-top:20px;text-align:center;">© 2026 MTR YIN — Muay Thai Revolution</p>
        </body></html>`;

        await transporter.sendMail({
          from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to: buyer_email,
          subject: `🎟️ Tu entrada PDF para MTR YIN — ${label}`,
          html: emailHtml,
          attachments: pdfAttachments,
        });

        // Email de control interno
        await transporter.sendMail({
          from: `"MTR YIN Entradas" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to: 'entradas@muaythairevolution.com',
          subject: `[CONTROL] Venta Stripe — ${label} x${qty} — ${buyer_name}`,
          html: `<p style="font-family:Arial;font-size:14px;line-height:1.8;">
            <strong>Nueva venta confirmada por Stripe</strong><br><br>
            <strong>Nombre:</strong> ${buyer_name || '—'}<br>
            <strong>Email:</strong> ${buyer_email}<br>
            <strong>Tipo:</strong> ${label}<br>
            <strong>Cantidad:</strong> ${qty}<br>
            <strong>PVP unitario:</strong> ${finalPvp}€<br>
            <strong>Total cobrado:</strong> ${(finalPvp * qty)}€<br>
            ${discountPct > 0 ? `<strong>Descuento aplicado:</strong> ${discountPct}%<br>` : ''}
            <strong>Payment Intent:</strong> ${pi.id}<br>
            <strong>Códigos generados:</strong><br>
            ${tickets.map(t => `&nbsp;&nbsp;${t.code}`).join('<br>')}
          </p>`,
        }).catch(e => console.warn('Error email control:', e));

        console.log(`Entradas PDF enviadas a ${buyer_email}`);
      } catch (err) {
        console.error('Error generando/enviando entradas:', err);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
