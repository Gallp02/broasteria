# Broastería

Sistema POS local para una broastería: pedidos por mesa o delivery, cocina, caja, inventario, administración y reportes.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Base de datos: SQLite (`node:sqlite`)
- Reportes: PDFKit y ExcelJS

## Funcionalidades

- Mozo: toma de pedidos por mesa, delivery y seguimiento de estado.
- Cocina: cola de preparación por categorías.
- Caja: cobro, comprobantes y anulaciones.
- Inventario: insumos, recetas y descuento automático de stock.
- Administración: usuarios, roles, categorías, productos y configuración.
- Reportes: ventas, movimientos y exportación a PDF/Excel.

## Seguridad

La API solo acepta tráfico de loopback o redes privadas (`127.0.0.1`, `10.x`, `192.168.x` y `172.16-31.x`). Las contraseñas se guardan con hash + salt.

## Ejecutar localmente

```bash
npm install
npm run seed
npm run build
npm start
```

Servidor: `http://localhost:3000`.

Para desarrollo con recarga automática:

```bash
npm run dev:server
npm run dev:client
```

## Scripts

| Script | Descripción |
| --- | --- |
| `npm start` | Inicia la API y sirve `client/dist` |
| `npm run dev:server` | API con recarga automática |
| `npm run dev:client` | Frontend Vite |
| `npm run build` | Compila el frontend |
| `npm run seed` | Carga catálogo y usuarios iniciales |
