import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { Buffer } from 'buffer';
import chalk from 'chalk';

/**
 * ルートハンドラー。処理した場合は true、担当外のパスなら false を返す。
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  requestPath: string
) => Promise<boolean>;

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large');
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * リクエストボディを文字列として読み込む（上限付き）
 */
export async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        rejected = true;
        // 残りのボディは読み捨てて、レスポンスを返せるようにする
        req.resume();
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (error) => {
      if (!rejected) reject(error);
    });
  });
}

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

/**
 * ルートハンドラーを順に試すHTTPサーバーを作成する（listenはしない）
 */
export function createHttpServer(routes: RouteHandler[]): Server {
  return createServer(async (req, res) => {
    const requestPath = (req.url ?? '/').split('?')[0];

    try {
      for (const route of routes) {
        if (await route(req, res, requestPath)) {
          return;
        }
      }

      res.statusCode = 404;
      res.end('Not Found');
    } catch (error) {
      console.error(chalk.red('❌ HTTPリクエスト処理エラー:'), error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.end();
      }
    }
  });
}

export function startHttpServer(port: number, routes: RouteHandler[]): Server {
  const server = createHttpServer(routes);
  server.listen(port, () => {
    console.log(chalk.green(`✓ HTTPサーバー起動: http://0.0.0.0:${port}`));
  });
  return server;
}
