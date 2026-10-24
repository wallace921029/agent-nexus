// 把 webui 的单文件构建产物内嵌进 CLI 源码（src/page.generated.ts）
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../webui/dist/index.html', import.meta.url), 'utf8');
const out = `// 由 npm run build:web 生成（webui/dist/index.html 内嵌），请勿手改
export const PAGE_HTML = ${JSON.stringify(html)};
`;
writeFileSync(new URL('../src/page.generated.ts', import.meta.url), out);
console.log(`已内嵌面板：${(html.length / 1024).toFixed(0)} KiB → src/page.generated.ts`);
