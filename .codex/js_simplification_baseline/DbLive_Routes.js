/**
 * DbLive_Routes.js
 * RESPONSIBILITY: Access control for MySQL live module.
 * Routes are registered directly in Code.js ROUTES object.
 * Independent — not tied to any company registry.
 */

function dbGuard_(user) {
  if (!user || !user.isSuperAdmin) throw new Error('غير مصرح — للمسؤول فقط');
}
