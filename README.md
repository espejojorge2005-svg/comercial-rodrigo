# Comercial Rodrigo - Sistema POS, Inventario & Control de Caja

Sistema integral para **Comercial Rodrigo**, diseñado para operar simultáneamente con **dos cajas físicas de cobro** sin inconsistencias de stock ni descuadres de caja, brindando trazabilidad completa sobre ganancias, costos y movimientos de mercadería (Kardex).

---

## 🏗️ Arquitectura y Stack Tecnológico

### Frontend (`/frontend`)
* **Framework:** React 19 + Vite (TypeScript)
* **Estilos & UI:** Tailwind CSS v4 + shadcn/ui + Lucide React
* **Estado Local:** Zustand (Carrito de compras y sesión de turno activa)
* **Gestión de Datos:** TanStack Query v5 (Caché reactiva)
* **Tablas de Alto Volumen:** TanStack Table (Kardex y ventas)

### Backend (`/backend`)
* **Framework:** NestJS 12 (TypeScript)
* **ORM:** Prisma v6
* **Seguridad:** Passport + JWT + bcrypt (Roles estrictos: `ADMIN`, `CAJERO` + PIN de anulación)
* **Validación:** class-validator + class-transformer
* **Manejo de Fechas:** date-fns (Control de turnos y arqueos)
* **Monitoreo:** Endpoint `@Get('health')` para UptimeRobot (evita hibernación en Render)

### Base de Datos
* **Motor:** PostgreSQL (Supabase Free Tier)
* **Conexión:** Transaction Pooling en puerto 6543 (`DATABASE_URL`) y conexión directa para migraciones (`DIRECT_URL`).
* **Precisión:** Tipos `DECIMAL` exactos para dinero y cantidades.

---

## ⚙️ Configuración y Ejecución Local

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd "Comercial Rodrigo"
```

### 2. Configurar el Backend
```bash
cd backend
# Copia el archivo de variables de entorno y ajusta tus credenciales de Supabase
cp .env.example .env

# Instalar dependencias (si es primera vez)
npm install --legacy-peer-deps

# Generar cliente de Prisma
npx prisma generate

# Aplicar migraciones a la base de datos (cuando tengas tu URL de Supabase)
npx prisma migrate dev --name init

# Iniciar servidor de desarrollo (puerto 4000)
npm run start:dev
```

### 3. Configurar el Frontend
```bash
cd ../frontend
# Instalar dependencias
npm install --legacy-peer-deps

# Iniciar servidor Vite (puerto 5173)
npm run dev
```

---

## 🚀 Despliegue en Producción ($0 USD)

| Componente | Plataforma | Configuración |
| :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Root Directory: `frontend`<br>Framework Preset: `Vite`<br>Build Command: `npm run build`<br>Output Directory: `dist` |
| **Backend** | [Render](https://render.com) | Root Directory: `backend`<br>Environment: `Node`<br>Build Command: `npm install --legacy-peer-deps && npx prisma generate && npm run build`<br>Start Command: `node dist/main.js`<br>Variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT=10000` |
| **Base de Datos** | [Supabase](https://supabase.com) | Proyecto PostgreSQL gratuito. Usar URI del pooler (puerto 6543) para `DATABASE_URL` y puerto 5432 para `DIRECT_URL`. |
| **Keep-Alive** | [UptimeRobot](https://uptimerobot.com) | Monitor HTTP con ping cada 10 min a `https://<tu-backend-en-render>.onrender.com/health` para evitar hibernación (*cold starts*). |

---

## 🔒 Reglas de Negocio Implementadas
1. **Concurrencia ACID en 2 Cajas:** Descuento de stock en `prisma.$transaction` atómico para prevenir sobreventas.
2. **Anulaciones de Venta Protegidas:** Solo pueden realizarse ingresando el PIN de un Administrador, retornando el stock a Kardex y descontando el dinero de caja.
3. **Precios Duales:** Soporte automático para precio por mayor al alcanzar la cantidad mínima configurada, o manual por selección del cajero.
4. **Pagos Mixtos:** Permite dividir un pago entre efectivo y medios digitales (Transferencia/Tarjeta).
5. **Arqueo Ciego:** El cajero ingresa el dinero físico contado sin ver el monto esperado del sistema para máxima transparencia.
