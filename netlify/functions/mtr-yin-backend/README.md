# MTR YIN — Backend de entradas

Sistema completo de venta y gestión de entradas para **MTR YIN** (20 Jun 2026, Madrid).

---

## Estructura

```
mtr-yin-backend/
├── netlify/
│   └── functions/
│       ├── create-payment-intent.js   ← Crea el pago en Stripe (llamado desde la landing)
│       ├── stripe-webhook.js          ← Recibe confirmación de Stripe y envía entradas
│       └── generate-free-ticket.js   ← Genera entradas para escuelas (uso interno)
├── admin/
│   └── escuelas.html                  ← Panel interno para generar entradas de escuelas
├── netlify.toml
├── package.json
└── README.md
```

---

## 1. Instalación

```bash
npm install
npm install -g netlify-cli
netlify login
netlify init   # vincular a tu sitio en Netlify
```

---

## 2. Variables de entorno

En Netlify Dashboard → Site Settings → Environment Variables, añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `STRIPE_SECRET_KEY` | Clave secreta Stripe | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook | `whsec_...` |
| `ALLOWED_ORIGIN` | Dominio de la landing | `https://mtryin.com` |
| `ADMIN_SECRET` | Clave para panel de escuelas | Genera una aleatoria |
| `EMAIL_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `EMAIL_PORT` | Puerto SMTP | `587` |
| `EMAIL_USER` | Usuario SMTP | `entradas@mtryin.com` |
| `EMAIL_PASS` | Contraseña / App Password | |
| `EMAIL_FROM` | Remitente del email | `entradas@mtryin.com` |

### Generar ADMIN_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Configurar Stripe

### 3.1 Webhook

En [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks):

1. **Endpoint URL**: `https://TU-SITIO.netlify.app/.netlify/functions/stripe-webhook`
2. **Eventos a escuchar**: `payment_intent.succeeded`
3. Copia el **Signing secret** → ponlo en `STRIPE_WEBHOOK_SECRET`

### 3.2 Publishable Key en la landing

Abre `mtr-yin-landing.html` y reemplaza:

```js
const STRIPE_PUBLIC_KEY = 'pk_test_51XXXXXXXXXXXXXXXXXXXXXXXXX';
```

por tu clave pública real (empieza por `pk_live_...` en producción).

### 3.3 Descomentar llamada al backend en la landing

En el modal de pago del HTML, busca el bloque comentado y descoméntalo:

```js
// En producción: llama a tu backend para crear el PaymentIntent
const res = await fetch('/.netlify/functions/create-payment-intent', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ ticket: currentTicket.type, qty, email, name })
});
const { clientSecret } = await res.json();
const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: { card: cardElement, billing_details: { name, email } }
});
```

---

## 4. Despliegue

```bash
netlify deploy --prod
```

O simplemente hace push a tu rama principal — Netlify despliega automáticamente.

---

## 5. Entradas para escuelas (uso interno)

### Desde el panel web

1. Abre `/admin/escuelas.html` en tu sitio (o localmente)
2. Introduce tu `ADMIN_SECRET`
3. Rellena: nombre, email, tipo de acceso, cantidad, escuela
4. Pulsa **Generar y enviar entradas**

Las entradas se envían por email **sin mostrar ningún precio** — solo el tipo de acceso y el código QR.

### Desde la línea de comandos (curl)

```bash
curl -X POST https://TU-SITIO.netlify.app/.netlify/functions/generate-free-ticket \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: TU_ADMIN_SECRET" \
  -d '{
    "email": "contacto@gimnasiomadrid.com",
    "name": "Carlos Rodríguez",
    "ticketType": "general",
    "qty": 4,
    "school": "Gimnasio Madrid Centro",
    "note": "Entradas para equipo técnico"
  }'
```

### Tipos de ticketType

| Valor | Acceso |
|---|---|
| `general` | Acceso General |
| `primera_fila` | Acceso Primera Fila |
| `vip_cena` | Acceso VIP + Cena |

---

## 6. Test en local

```bash
netlify dev   # levanta el servidor en http://localhost:8888
```

Para probar Stripe localmente:
```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

---

## 7. Seguridad

- El panel `/admin/escuelas.html` está protegido por `ADMIN_SECRET` — **no lo compartas**
- El webhook verifica la firma de Stripe antes de procesar
- Las entradas de escuelas no pasan por Stripe, no tienen rastro de precio
- Guarda `ADMIN_SECRET` en un gestor de contraseñas

---

## Soporte

Para dudas técnicas: revisa los logs en Netlify Dashboard → Functions.
