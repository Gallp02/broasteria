// Contrasenas hasheadas con scrypt + salt por usuario.
// Nunca se guarda la contrasena en texto plano, ni en la base de datos ni en logs.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function nuevoSalt() {
  return randomBytes(16).toString('hex');
}

export function hashClave(clave, salt) {
  return scryptSync(String(clave), salt, 32).toString('hex');
}

export function verificarClave(clave, hash, salt) {
  if (!hash || !salt) return false;
  const a = Buffer.from(hashClave(clave, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Alias antiguos, por si algun modulo viejo los sigue usando
export const hashPin = hashClave;
export const verificarPin = verificarClave;

// Normaliza el nombre de usuario: sin espacios, sin acentos, en minusculas
export function normalizarUsuario(txt) {
  return String(txt || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}
