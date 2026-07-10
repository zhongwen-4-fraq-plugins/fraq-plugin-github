import type { Browser } from 'playwright';
import { chromium } from 'playwright';

import type { GitHubPluginOptions } from './types.js';

export class ScreenshotService {
  private browser?: Browser;

  constructor(private readonly options: GitHubPluginOptions['screenshot']) {}

  async capture(url: string): Promise<Buffer> {
    this.browser ??= await chromium.launch({
      headless: true,
      executablePath: this.options?.executablePath,
    });
    const page = await this.browser.newPage({
      viewport: {
        width: this.options?.width ?? 1440,
        height: this.options?.height ?? 1000,
      },
      deviceScaleFactor: 1,
    });
    try {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: this.options?.timeoutMs ?? 30000,
        });
      } catch (error) {
        throw new Error(`无法打开 GitHub 页面：${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      await page.locator('body').waitFor({ state: 'visible', timeout: this.options?.timeoutMs ?? 30000 });
      return await page.screenshot({ fullPage: true, type: 'png' });
    } finally {
      await page.close();
    }
  }

  async dispose(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}
