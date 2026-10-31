// Clean first-run setup for Rishu Kirana Store.
// NO fake/demo data: only real store profile + login accounts are created.
// Products, customers, bills etc. start EMPTY — owner adds real items from the app.
import bcrypt from 'bcryptjs';
import { connectDB, db, getSettings } from './db/index.js';

export async function seedIfEmpty() {
  await getSettings();
  if ((await db.users.count()) > 0) return false;
  console.log('[seed] First run — creating Rishu Kirana Store account (empty inventory, no demo data)...');

  await db.stores.create({
    _id: 'main', name: 'Rishu Kirana Store', address: 'Gaya Road, Nawada, Jharkhand',
    phone: '9608087035', email: '', isMain: true, isActive: true,
  });

  const mkUser = (name, username, password, role, pin) => db.users.create({
    name, username, password: bcrypt.hashSync(password, 10), pin: pin ? bcrypt.hashSync(pin, 10) : null,
    role, phone: '9608087035', storeId: 'main', isActive: true,
  });
  await mkUser('Rishu Kumar (Owner)', 'owner', 'owner123', 'admin', '1111');
  await mkUser('Manager', 'manager', 'manager123', 'manager', '2222');
  await mkUser('Cashier', 'cashier', 'cashier123', 'cashier', '4321');

  console.log('[seed] Done. Logins: owner/owner123 (PIN 1111), manager/manager123 (PIN 2222), cashier/cashier123 (PIN 4321)');
  console.log('[seed] Inventory is EMPTY — add your real products from Products screen (or Excel import).');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDB();
  await seedIfEmpty();
  process.exit(0);
}
