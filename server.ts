import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import * as taskController from './src/backend/taskController.js';
import dotenv from 'dotenv';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/tasks', taskController.listTasks);
  app.post('/api/tasks', upload.single('file'), taskController.createTask);
  app.patch('/api/tasks/:id/status', taskController.updateTaskStatus);
  app.post('/api/tasks/:id/attachment', upload.single('file'), taskController.uploadAttachment);
  app.delete('/api/tasks/:id/attachment', taskController.deleteAttachment);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
