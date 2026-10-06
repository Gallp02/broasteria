import { db } from './db.js';
import { hashClave, nuevoSalt } from './clave.js';

// ── Categorías y catálogo extraídos del menú (OCR) ───────────────
// revisar=1 marca los ítems con precio dudoso del menú original.
// ── Categorías del menú, cortas para que quepan en el celular ──
//   Brasas  : pollos a la brasa, broaster, mostros
//   Parrilla: parrillas, carnes sueltas, anticuchos
//   Platos  : criollos y chifa
//   Extras  : guarniciones, salchipapas, dulces
//   Bebidas : bebidas e infusiones
//   Combos  : ofertas
const CATEGORIAS = ['Brasas', 'Parrilla', 'Platos', 'Extras', 'Bebidas', 'Combos'];

const PRODUCTOS = [
  // Pollos a la Brasa
  ['Brasas', 'Pollo a la Brasa Entero', 62.0, 'Pollo + papas + ensaladas + cremas'],
  ['Brasas', 'Pollo a la Brasa 1/2', 31.0, 'Pollo + papas + ensaladas + cremas'],
  ['Brasas', 'Pollo a la Brasa 1/4', 16.0, 'Pollo + papas + ensaladas + cremas'],
  ['Brasas', 'Pollo a la Brasa 1/4 con Chaufa', 19.0, 'Pollo + chaufa + papas + ensaladas + cremas', 1],

  // Parrillas
  ['Parrilla', 'Parrilla Familiar', 120.0, '1/4 de pollo + lomo 170gr + bistec 170gr'],
  ['Parrilla', 'Parrilla Para Dos', 78.0, 'Bistec 170gr + churrasco 200gr'],
  ['Parrilla', 'Parrilla Personal', 58.0, 'Opciones: lomo 170gr + anticucho, o molleja + chorizo', 1],

  // Broaster
  ['Brasas', 'Broaster Alitas', 11.0, 'Papas y ensalada'],
  ['Brasas', 'Broaster Pierna', 12.0, 'Papas y ensalada'],
  ['Brasas', 'Broaster Encuentro', 14.0, 'Papas y ensalada'],
  ['Brasas', 'Broaster Pecho', 15.0, 'Papas y ensalada'],
  ['Brasas', 'Broaster Chicharrón', 16.0, 'Papas y ensalada'],

  // Mostros
  ['Brasas', 'Mostros Alitas', 16.0, 'Con papas, ensalada y chaufa'],
  ['Brasas', 'Mostros Pierna', 16.0, 'Con papas, ensalada y chaufa'],
  ['Brasas', 'Mostros Encuentro', 18.0, 'Con papas, ensalada y chaufa'],
  ['Brasas', 'Mostros Pecho', 18.0, 'Con papas, ensalada y chaufa'],
  ['Brasas', 'Mostros Chicharrón', 19.0, 'Con papas, ensalada y chaufa'],
  ['Brasas', 'Mostros Molleja', 18.0, 'Con papas, ensalada y chaufa'],

  // Carnes a la Parrilla
  ['Parrilla', 'Anticuchos', 21.0, '3 palitos con papas y ensalada'],
  ['Parrilla', 'Anticuchos Mixtos', 21.0, '2 palitos, 120gr de mollejitas, papas y ensalada'],
  ['Parrilla', 'Mollejitas', 15.0, 'Con papas y ensalada'],
  ['Parrilla', 'Mollejitas con Queso', 17.0, 'Con papas y ensalada'],
  ['Parrilla', 'Pecho a la Parrilla Especial', 20.0, 'Queso danbo, chorizo, papas y ensalada'],
  ['Parrilla', 'Pecho Parrilla', 15.0, 'Con papas y ensalada'],
  ['Parrilla', 'Encuentro Parrilla', 15.0, 'Con papas y ensalada'],
  ['Parrilla', 'Brocheta de Pollo', 18.0, 'Con papas y ensalada'],
  ['Parrilla', 'Bife 200gr', 35.0, 'Con papas y ensalada'],
  ['Parrilla', 'Lomo 200gr', 37.0, 'Con papas y ensalada'],
  ['Parrilla', 'Churrasco 200gr', 30.0, 'Con papas y ensaladas'],
  ['Parrilla', 'Chuletras 300gr', 30.0, 'Con papas y ensalada'],
  ['Parrilla', 'Chorizo Parrillero', 18.0, 'Con papas y ensalada'],

  // Platos Criollos
  ['Platos', 'Lomo Saltado', 18.0, ''],
  ['Platos', 'Lomo Saltado a lo Pobre', 22.0, ''],
  ['Platos', 'Pollo Saltado', 16.0, ''],
  ['Platos', 'Pollo Saltado a lo Pobre', 20.0, ''],
  ['Platos', 'Tallarín de Carne', 18.0, ''],
  ['Platos', 'Tallarín de Pollo', 16.0, ''],
  ['Platos', 'Pollo con Verduras', 16.0, 'Chaufa o arroz blanco, holantao, brócoli, col china, cebolla china, pimentón y frijol chino'],

  // Chifa
  ['Platos', 'Aeropuerto de Pollo', 15.0, ''],
  ['Platos', 'Aeropuerto de Carne', 20.0, ''],
  ['Platos', 'Chaufa de Pollo', 13.0, ''],
  ['Platos', 'Chaufa de Carne', 18.0, ''],
  ['Platos', 'Chaufa Mixta', 16.0, ''],
  ['Platos', 'Chijaukay', 18.0, 'Chaufa, chicharrón de pollo con salsa saladada'],
  ['Platos', 'Tallarín Chino', 16.0, 'Pollo en trozos, verduras y fideo chino'],

  // Dulces
  ['Extras', 'Tipakay', 18.0, 'Chaufa, pollo en trozos y salsa dulce'],
  ['Extras', 'Pollo con Piña', 18.0, 'Chaufa, chicharrón de pollo en trozos y piña en cubos'],
  ['Extras', 'Pollo con Piña y Durazno', 20.0, 'Chaufa, chicharrón de pollo, piña y durazno en cubos'],

  // Salchipapas
  ['Extras', 'Salchipapa Clásica', 11.0, 'Hotdog ahumado'],
  ['Extras', 'Salchipapa Royal', 16.0, 'Hot dog ahumado, queso y huevo'],
  ['Extras', 'Salchipapa Especial', 18.0, 'Hotdog ahumado, chorizo, queso y huevo'],

  // Guarniciones
  ['Extras', 'Papas Fritas', 9.0, ''],
  ['Extras', 'Arroz Blanco', 3.5, ''],
  ['Extras', 'Arroz Chaufa', 5.0, ''],
  ['Extras', 'Ensalada Fresca con Palta', 6.0, ''],
  ['Extras', 'Palito de Anticucho', 7.0, ''],
  ['Extras', 'Porción de Mollejitas', 7.0, ''],

  // Bebidas
  ['Bebidas', 'Chicha 1Lt', 12.0, ''],
  ['Bebidas', 'Chicha 1/2 Lt', 6.0, ''],
  ['Bebidas', 'Limonada 1Lt', 10.0, ''],
  ['Bebidas', 'Maracuyá 1Lt', 10.0, ''],
  ['Bebidas', 'Mango 1Lt', 12.0, ''],
  ['Bebidas', 'Limonada Frozen 1Lt', 12.0, ''],
  ['Bebidas', 'Maracuyá Frozen 1Lt', 12.0, ''],
  ['Bebidas', 'Mango Frozen 1Lt', 14.0, ''],
  ['Bebidas', 'Limonada 1/2 Lt', 5.0, ''],
  ['Bebidas', 'Maracuyá 1/2 Lt', 5.0, ''],
  ['Bebidas', 'Mango 1/2 Lt', 6.0, ''],
  ['Bebidas', 'Gaseosa 1Lt', 10.0, '', 1],
  ['Bebidas', 'Gaseosa 1/2 Lt', 10.0, '', 1],
  ['Bebidas', 'Gordita', 5.0, ''],
  ['Bebidas', 'Inca Kola 600ml', 4.5, ''],
  ['Bebidas', 'Agua Mineral 600ml', 3.0, ''],
  ['Bebidas', 'Café Pasado', 3.5, ''],

  // Ofertas
  ['Combos', 'Combo 1', 72.0, '1 Pollo + 1/4 pollo + papas + ensaladas'],
  ['Combos', 'Combo 2', 70.0, '1 Pollo + Gaseosa 1/2 Lt + papas + ensaladas', 1],
];

// Insumos base. Cantidades aproximadas por porción.
const INSUMOS = [
  ['Pollo entero', 'kg', 0],
  ['Pollo 1/2', 'kg', 0],
  ['Pollo 1/4', 'kg', 0],
  ['Bife', 'kg', 0],
  ['Lomo', 'kg', 0],
  ['Churrasco', 'kg', 0],
  ['Chuletra', 'kg', 0],
  ['Molleja', 'kg', 0],
  ['Chorizo', 'kg', 0],
  ['Pechuga', 'kg', 0],
  ['Anticucho de pollo', 'kg', 0],
  ['Chicharrón de pollo', 'kg', 0],
  ['Hotdog ahumado', 'und', 0],
  ['Queso danbo', 'kg', 0],
  ['Huevo', 'und', 0],
  ['Papas', 'kg', 0],
  ['Arroz', 'kg', 0],
  ['Fideos chinos', 'kg', 0],
  ['Verduras (brócoli, col china)', 'kg', 0],
  ['Lechuga', 'kg', 0],
  ['Palta', 'und', 0],
  ['Gaseosa 1Lt', 'und', 0],
  ['Gaseosa 1/2 Lt', 'und', 0],
  ['Chicha 1Lt', 'und', 0],
  ['Chicha 1/2 Lt', 'und', 0],
  ['Agua mineral 600ml', 'und', 0],
  ['Inca Kola 600ml', 'und', 0],
  ['Pan', 'und', 0],
  ['Aceite', 'Lt', 0],
  ['Sal', 'kg', 0],
  ['Especias', 'kg', 0],
];

// Receitas por producto (id insumo, cantidad por unidad vendida).
const RECETAS = {
  'Pollo a la Brasa Entero':    [['Pollo entero', 1.0]],
  'Pollo a la Brasa 1/2':       [['Pollo 1/2', 1.0]],
  'Pollo a la Brasa 1/4':       [['Pollo 1/4', 1.0]],
  'Pollo a la Brasa 1/4 con Chaufa': [['Pollo 1/4', 1.0], ['Arroz', 0.15]],

  'Parrilla Familiar':  [['Pollo 1/4', 0.25], ['Lomo', 0.17], ['Bife', 0.17]],
  'Parrilla Para Dos':  [['Bife', 0.17], ['Churrasco', 0.20]],
  'Parrilla Personal':  [['Lomo', 0.17], ['Anticucho de pollo', 0.15], ['Molleja', 0.10], ['Chorizo', 0.05]],

  'Broaster Alitas':     [['Pollo 1/4', 0.15]],
  'Broaster Pierna':     [['Pollo 1/4', 0.18]],
  'Broaster Encuentro':  [['Pollo 1/4', 0.16]],
  'Broaster Pecho':      [['Pollo 1/4', 0.17]],
  'Broaster Chicharrón':  [['Pollo 1/4', 0.16]],

  'Mostros Alitas':     [['Pollo 1/4', 0.15], ['Arroz', 0.12]],
  'Mostros Pierna':     [['Pollo 1/4', 0.18], ['Arroz', 0.12]],
  'Mostros Encuentro':  [['Pollo 1/4', 0.16], ['Arroz', 0.12]],
  'Mostros Pecho':      [['Pollo 1/4', 0.17], ['Arroz', 0.12]],
  'Mostros Chicharrón': [['Pollo 1/4', 0.16], ['Arroz', 0.12]],
  'Mostros Molleja':    [['Molleja', 0.12], ['Arroz', 0.12]],

  'Anticuchos':                [['Anticucho de pollo', 0.20]],
  'Anticuchos Mixtos':         [['Anticucho de pollo', 0.13], ['Molleja', 0.12]],
  'Mollejitas':                [['Molleja', 0.12]],
  'Mollejitas con Queso':      [['Molleja', 0.12], ['Queso danbo', 0.03]],
  'Pecho a la Parrilla Especial': [['Pechuga', 0.17], ['Queso danbo', 0.03], ['Chorizo', 0.04]],
  'Pecho Parrilla':            [['Pechuga', 0.17]],
  'Encuentro Parrilla':        [['Pechuga', 0.17]],
  'Brocheta de Pollo':         [['Pollo 1/4', 0.18]],
  'Bife 200gr':                [['Bife', 0.20]],
  'Lomo 200gr':                [['Lomo', 0.20]],
  'Churrasco 200gr':           [['Churrasco', 0.20]],
  'Chuletras 300gr':           [['Chuletra', 0.30]],
  'Chorizo Parrillero':        [['Chorizo', 0.15]],

  'Lomo Saltado':                [['Lomo', 0.18], ['Arroz', 0.15], ['Papas', 0.10]],
  'Lomo Saltado a lo Pobre':     [['Lomo', 0.18], ['Arroz', 0.15], ['Papas', 0.10], ['Chuletra', 0.15]],
  'Pollo Saltado':               [['Pollo 1/4', 0.20], ['Arroz', 0.15], ['Papas', 0.10]],
  'Pollo Saltado a lo Pobre':    [['Pollo 1/4', 0.20], ['Arroz', 0.15], ['Papas', 0.10], ['Chuletra', 0.15]],
  'Tallarín de Carne':           [['Lomo', 0.15], ['Fideos chinos', 0.15]],
  'Tallarín de Pollo':           [['Pollo 1/4', 0.15], ['Fideos chinos', 0.15]],
  'Pollo con Verduras':          [['Pollo 1/4', 0.15], ['Arroz', 0.15], ['Verduras (brócoli, col china)', 0.12]],

  'Aeropuerto de Pollo':  [['Pollo 1/4', 0.18], ['Arroz', 0.15]],
  'Aeropuerto de Carne':  [['Lomo', 0.18], ['Arroz', 0.15]],
  'Chaufa de Pollo':      [['Pollo 1/4', 0.18], ['Arroz', 0.15]],
  'Chaufa de Carne':      [['Lomo', 0.18], ['Arroz', 0.15]],
  'Chaufa Mixta':         [['Pollo 1/4', 0.10], ['Lomo', 0.10], ['Arroz', 0.15]],
  'Chijaukay':            [['Pollo 1/4', 0.18], ['Arroz', 0.12], ['Chicharrón de pollo', 0.05]],
  'Tallarín Chino':       [['Pollo 1/4', 0.15], ['Fideos chinos', 0.15], ['Verduras (brócoli, col china)', 0.08]],

  'Tipakay':                     [['Pollo 1/4', 0.18], ['Arroz', 0.15]],
  'Pollo con Piña':              [['Pollo 1/4', 0.15], ['Chicharrón de pollo', 0.04], ['Arroz', 0.15]],
  'Pollo con Piña y Durazno':    [['Pollo 1/4', 0.15], ['Chicharrón de pollo', 0.04], ['Arroz', 0.15]],

  'Salchipapa Clásica':    [['Hotdog ahumado', 1]],
  'Salchipapa Royal':      [['Hotdog ahumado', 1], ['Queso danbo', 0.03], ['Huevo', 1]],
  'Salchipapa Especial':   [['Hotdog ahumado', 1], ['Chorizo', 0.04], ['Queso danbo', 0.03], ['Huevo', 1]],

  'Chicha 1Lt':             [['Chicha 1Lt', 1]],
  'Chicha 1/2 Lt':          [['Chicha 1/2 Lt', 1]],
  'Limonada 1Lt':          [['Pan', 0]],
  'Maracuyá 1Lt':          [['Pan', 0]],
  'Mango 1Lt':             [['Pan', 0]],
  'Limonada Frozen 1Lt':   [['Pan', 0]],
  'Maracuyá Frozen 1Lt':   [['Pan', 0]],
  'Mango Frozen 1Lt':      [['Pan', 0]],
  'Limonada 1/2 Lt':       [['Pan', 0]],
  'Maracuyá 1/2 Lt':       [['Pan', 0]],
  'Mango 1/2 Lt':          [['Pan', 0]],
  'Gaseosa 1Lt':           [['Gaseosa 1Lt', 1]],
  'Gaseosa 1/2 Lt':        [['Gaseosa 1/2 Lt', 1]],
  'Agua Mineral 600ml':    [['Agua mineral 600ml', 1]],
  'Inca Kola 600ml':       [['Inca Kola 600ml', 1]],

  'Combo 1': [['Pollo entero', 1], ['Pollo 1/4', 0.25]],
  'Combo 2': [['Pollo entero', 1], ['Gaseosa 1/2 Lt', 1]],
};

// Guarniciones que acompañan a platos principales (1 porción c/u).
const GUARNICIONES = [
  ['Papas a la Parrilla', 0.20],
  ['Ensalada Fresca', 0.15],
  ['Arroz Chaufaextra', 0.12],
];

function seed() {
  const catCount = db.prepare('SELECT COUNT(*) c FROM categorias').get().c;
  if (catCount > 0) {
    console.log('Base de datos ya tiene datos. Usa --reset para recargar.');
    return;
  }

  const insCat = db.prepare('INSERT INTO categorias (nombre, orden) VALUES (?, ?)');
  const catIds = {};
  CATEGORIAS.forEach((n, i) => {
    catIds[n] = insCat.run(n, i).lastInsertRowid;
  });

  const insIns = db.prepare('INSERT INTO insumos (nombre, unidad) VALUES (?, ?)');
  const insIds = {};
  for (const n of INSUMOS) insIds[n[0]] = insIns.run(n[0], n[1]).lastInsertRowid;
  for (const n of GUARNICIONES) insIds[n[0]] = insIns.run(n[0], 'porcion').lastInsertRowid;

  const insProd = db.prepare(
    'INSERT INTO productos (categoria_id, nombre, precio, descripcion, revisar, orden) VALUES (?,?,?,?,?,?)'
  );
  const prodIds = {};
  PRODUCTOS.forEach(([cat, nombre, precio, desc, revisar], i) => {
    prodIds[nombre] = insProd.run(catIds[cat], nombre, precio, desc ?? '', revisar ?? 0, i).lastInsertRowid;
  });

  const insRec = db.prepare(
    'INSERT OR REPLACE INTO recetas (producto_id, insumo_id, cantidad) VALUES (?,?,?)'
  );
  for (const [prod, receta] of Object.entries(RECETAS)) {
    const pid = prodIds[prod];
    if (!pid) continue;
    for (const [insumo, cant] of receta) {
      if (!insIds[insumo] || cant <= 0) continue;
      insRec.run(pid, insIds[insumo], cant);
    }
  }

  // Mesas: salón de 10 +Delivery
  const insMesa = db.prepare('INSERT INTO mesas (nombre, zona) VALUES (?, ?)');
  for (let i = 1; i <= 10; i++) insMesa.run(`Mesa ${i}`, 'Salon');
  insMesa.run('Delivery', 'Delivery');

  // Usuarios iniciales (PIN hasheado, nunca en texto plano)
  const insUsu = db.prepare(
    'INSERT INTO usuarios (nombre, pin_hash, pin_salt, rol) VALUES (?,?,?,?)'
  );
  const usuario = (nombre, pin, rol) => {
    const salt = nuevoSalt();
    insUsu.run(nombre, hashClave(pin, salt), salt, rol);
  };
  usuario('Jefe', '0000', 'jefe');
  usuario('Caja', '1111', 'caja');
  usuario('Mozo 1', '2222', 'mozo');

  console.log(`Categorías: ${CATEGORIAS.length}`);
  console.log(`Productos:   ${PRODUCTOS.length}`);
  console.log(`Insumos:     ${INSUMOS.length + GUARNICIONES.length}`);
  console.log('Mesas:       11 (10 salón + Delivery)');
  console.log('Usuarios:    Jefe(0000) Caja(1111) Mozo1(2222)');
  console.log('PINs cambiables desde el panel del jefe.');
}

seed();
