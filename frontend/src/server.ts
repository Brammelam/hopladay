import {
  AngularNodeAppEngine,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false,
}));

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

