import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIO } from 'socket.io';
import { connectDB } from './db/index.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import posRoutes from './routes/pos.js';
import customerRoutes from './routes/customers.js';
import supplierRoutes from './routes/suppliers.js';
import offerRoutes from './routes/offers.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import miscRoutes from './routes/misc.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' }));

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, mode: process.env.MONGODB_URI ? 'mongodb' : 'local', store: 'Rishu Kirana Store' }));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', miscRoutes);

// Serve built frontend in production (single-port deploy)
const dist = path.join(process.cwd(), '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Not found: ' + req.path }));
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const server = http.createServer(app);
const io = new SocketIO(server, { cors: { origin: true } });
app.set('io', io);
io.on('connection', (s) => s.emit('hello', { store: 'Rishu Kirana Store' }));

server.listen(PORT, '0.0.0.0', async () => {
  await connectDB();
  await seedIfEmpty();
  console.log(`🏪 Rishu Kirana Store API ready on http://0.0.0.0:${PORT} (db: ${process.env.MONGODB_URI ? 'MongoDB' : 'embedded'})`);
});
