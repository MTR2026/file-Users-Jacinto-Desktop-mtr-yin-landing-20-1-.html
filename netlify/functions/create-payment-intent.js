// netlify/functions/create-payment-intent.js
// MTR YIN — Crear PaymentIntent en Stripe
//
// Variables de entorno necesarias en Netlify:
//   STRIPE_SECRET_KEY   → tu clave secreta de Stripe (sk_live_... o sk_test_...)
//   ALLOWED_ORIGIN      → dominio de tu landing (ej: https://mtryin.com)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const TICKET_PRICES = {
  general:      3500,   // 35€ en céntimos
  primera_fila: 5000,   // 50€
  vip_cena:     7500,   // 75€
};

const TICKET_NAMES = {
  general:      'General',
  primera_fila: 'Primera Fila',
  vip_cena:     'VIP + Cena',
};

exports.handler = async (event) => {
  // CORS
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const { ticket, qty, email, name } = JSON.parse(event.body);

    // Validaciones
    if (!ticket || !TICKET_PRICES[ticket]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tipo de entrada inválido' }) };
    }
    const quantity = parseInt(qty, 10);
    if (!quantity || quantity < 1 || quantity > 10) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Cantidad inválida (1-10)' }) };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email inválido' }) };
    }

    const amount = TICKET_PRICES[ticket] * quantity;

    // Crear PaymentIntent en Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      receipt_email: email,
      metadata: {
        ticket_type: ticket,
        ticket_name: TICKET_NAMES[ticket],
        quantity: String(quantity),
        buyer_name: name || '',
        buyer_email: email,
        event: 'MTR YIN — 20 Junio 2026 Madrid',
      },
      description: `MTR YIN — ${quantity}x ${TICKET_NAMES[ticket]}`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: 'eur',
      }),
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Error interno del servidor' }),
    };
  }
};
