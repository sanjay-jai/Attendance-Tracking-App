import app from '../server';

export default function handler(req: any, res: any) {
  // Normalize path if Vercel passes path without /api prefix
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  return app(req, res);
}
