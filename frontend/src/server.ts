import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import landingManifest from '../public/landing-routes.json';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();

const angularApp = new AngularNodeAppEngine();

const SUPPORTED_LANGUAGES = ['en', 'no', 'nl', 'de', 'fr', 'es', 'sv', 'da'];

app.get('/', (req: Request, res: Response) => {
  const cookieMatch = (req.headers.cookie || '').match(/hopladay_lang=(\w+)/);
  const lang = cookieMatch?.[1] && SUPPORTED_LANGUAGES.includes(cookieMatch[1])
    ? cookieMatch[1]
    : 'en';
  res.redirect(302, `/${lang}`);
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const parts=req.path.split('/').filter(Boolean);
  if (SUPPORTED_LANGUAGES.includes(parts[0]) && parts[1]==='plans') res.set('X-Robots-Tag','noindex');
  if (Object.keys(req.query).length && SUPPORTED_LANGUAGES.includes(parts[0]) && (parts.length===1 || (parts.length===2 && parts[1]==='optimize'))) res.set('X-Robots-Tag','noindex');
  next();
});

app.use(express.static(browserDistFolder, {
  maxAge: 0,
  setHeaders(res, path) {
    if (/[-.][A-Z0-9]{8}\.(js|css)$/.test(path)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
  index: false,
  redirect: false,
}));

const landingRoutes: unknown = landingManifest;
if (!Array.isArray(landingRoutes)) throw new Error('Invalid landing route manifest');
for (const value of landingRoutes) {
  const entry: unknown = value;
  if (!entry || typeof entry !== 'object' || !('path' in entry) || !('file' in entry) || typeof entry.path !== 'string' || typeof entry.file !== 'string' || !/^\/[a-z]{2}\/[a-z]+\/\d{4}$/.test(entry.path) || entry.file !== `${entry.path.slice(1)}/index.html`) throw new Error('Invalid landing route');
  const file = resolve(browserDistFolder, entry.file);
  app.get(entry.path, (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=0, must-revalidate').sendFile(file);
  });
}

app.get('*', (req: Request, res: Response, next: NextFunction) => {
  angularApp
    .handle(req)
    .then((response: any) => {
      if (!response) {
        return next();
      }
      writeResponseToNodeResponse(response, res);
    })
    .catch((err: any) => next(err));
});

const port = process.env['PORT'] || 4000;

if (isMainModule(import.meta.url)) {
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}


export const reqHandler = createNodeRequestHandler(app);
