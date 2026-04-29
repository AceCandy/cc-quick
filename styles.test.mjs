import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('styles.css 包含 sticky 顶部、版本徽标和新的字号契约', () => {
  assert.match(styles, /\.header\s*\{[\s\S]*position:\s*sticky;/);
  assert.match(styles, /\.page-sidebar\s*\{[\s\S]*top:\s*var\(--sticky-shell-top,\s*1rem\);/);
  assert.match(styles, /\.section-switcher\s*\{[\s\S]*top:\s*var\(--sticky-shell-top,\s*1rem\);/);
  assert.match(styles, /\.section-title\s*\{[\s\S]*scroll-margin-top:\s*var\(--sticky-scroll-margin,\s*6rem\);/);
  assert.match(styles, /\.group-title\s*\{[\s\S]*scroll-margin-top:\s*var\(--sticky-scroll-margin,\s*6rem\);/);
  assert.match(styles, /\.version-badge\s*\{/);
  assert.match(styles, /--section-title-size:\s*0\.96rem;/);
  assert.match(styles, /--group-title-size:\s*0\.68rem;/);
  assert.match(styles, /--key-font-size:\s*0\.72rem;/);
  assert.match(styles, /--desc-font-size:\s*0\.84rem;/);
  assert.match(styles, /--appendix-title-size:\s*0\.88rem;/);
  assert.match(styles, /--footer-font-size:\s*0\.78rem;/);
});

test('styles.css 包含 GitHub Star 入口和手机端响应式契约', () => {
  assert.match(styles, /\.github-star-link\s*\{/);
  assert.match(styles, /\.github-star-link\s*\{[\s\S]*min-height:\s*44px;/);
  assert.match(styles, /@media \(max-width:\s*680px\) \{[\s\S]*\.header\s*\{[\s\S]*position:\s*static;/);
  assert.match(styles, /@media \(max-width:\s*680px\) \{[\s\S]*\.github-star-link\s*\{[\s\S]*width:\s*100%;/);
  assert.match(styles, /\.page-sidebar\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(styles, /@media \(max-width:\s*680px\) \{[\s\S]*\.page-shell\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(styles, /@media \(max-width:\s*680px\) \{[\s\S]*\.section-switcher-list\s*\{[\s\S]*max-width:\s*100%;/);
  assert.match(styles, /@media \(max-width:\s*420px\) \{[\s\S]*\.section-switcher-btn\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
});
