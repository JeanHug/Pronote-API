import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { runPronotePuppeteerScrape } from './server/puppeteerScraper.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Simple API health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'pronote-docs-server', timestamp: new Date().toISOString() });
  });

  // POST /api/scrape-pronote (Mode JSON)
  app.post('/api/scrape-pronote', async (req, res) => {
    try {
      const { username, password, url, pronoteUrl } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'username et password obligatoires' });
      }

      const result = await runPronotePuppeteerScrape(
        username,
        password,
        pronoteUrl || 'https://0771068t.index-education.net/pronote/eleve.html',
        url || 'https://ent.seine-et-marne.fr/'
      );

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erreur lors du scraping' });
    }
  });

  // POST /api/scrape-pronote/html (Mode HTML)
  app.post('/api/scrape-pronote/html', async (req, res) => {
    try {
      const { username, password, url, pronoteUrl } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'username et password obligatoires' });
      }

      const result = await runPronotePuppeteerScrape(
        username,
        password,
        pronoteUrl || 'https://0771068t.index-education.net/pronote/eleve.html',
        url || 'https://ent.seine-et-marne.fr/'
      );

      return res.json({
        success: result.success,
        mode: 'html',
        data: result.data
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erreur lors du scraping HTML' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
