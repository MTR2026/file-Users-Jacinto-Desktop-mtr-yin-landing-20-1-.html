// netlify/functions/manage-discounts.js
// MTR YIN — Gestión de códigos de descuento en base de datos

const { neon } = require('@neondatabase/serverless');

function getDb() {
  return neon(process.env.NETLIFY_DATABASE_URL);
}

async function initTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS mtryin_discounts (
      code VARCHAR(50) PRIMARY KEY,
      pct INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  // Insertar códigos por defecto si la tabla está vacía
  const existing = await sql`SELECT COUNT(*) as n FROM mtryin_discounts`;
  if (parseInt(existing[0].n) === 0) {
    await sql`INSERT INTO mtryin_discounts (code, pct) VALUES ('PRENSA2026', 100), ('PATROCINADOR', 50), ('MTRYIN10', 10) ON CONFLICT DO NOTHING`;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const sql = getDb();
  await initTable(sql);

  // GET público — la landing lo llama para obtener los códigos
  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT code, pct FROM mtryin_discounts ORDER BY created_at`;
    const discounts = {};
    rows.forEach(r => { discounts[r.code] = r.pct; });
    return { statusCode: 200, headers, body: JSON.stringify({ discounts }) };
  }

  // POST — requiere ADMIN_SECRET
  if (event.httpMethod === 'POST') {
    const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret'];
    if (!process.env.ADMIN_SECRET || adminSecret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };
    }

    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const { action, code, pct } = body;

    if (action === 'add') {
      if (!code || !pct || pct < 1 || pct > 100)
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Datos inválidos' }) };
      await sql`INSERT INTO mtryin_discounts (code, pct) VALUES (${code.toUpperCase()}, ${pct}) ON CONFLICT (code) DO UPDATE SET pct = ${pct}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'delete') {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Código requerido' }) };
      await sql`DELETE FROM mtryin_discounts WHERE code = ${code.toUpperCase()}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'list') {
      const rows = await sql`SELECT code, pct FROM mtryin_discounts ORDER BY created_at`;
      const discounts = {};
      rows.forEach(r => { discounts[r.code] = r.pct; });
      return { statusCode: 200, headers, body: JSON.stringify({ discounts }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
};
