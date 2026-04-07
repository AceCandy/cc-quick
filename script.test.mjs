import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const scriptSource = await readFile(new URL('./script.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }

  add(name) {
    this.classes.add(name);
  }

  remove(name) {
    this.classes.delete(name);
  }

  toggle(name, force) {
    if (force) {
      this.classes.add(name);
      return true;
    }

    this.classes.delete(name);
    return false;
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement {
  constructor({
    textContent = '',
    dataset = {},
    classNames = [],
    attributes = {},
    style = {}
  } = {}) {
    this.textContent = textContent;
    this.dataset = dataset;
    this.classList = new FakeClassList(classNames);
    this.attributes = attributes;
    this.style = style;
    this.listeners = new Map();
    this.children = [];
    this.removed = false;
  }

  querySelectorAll(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return this.children.filter((child) => child.classList.contains(className));
    }

    return [];
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  click() {
    const handlers = this.listeners.get('click') || [];
    handlers.forEach((handler) => handler.call(this));
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  remove() {
    this.removed = true;
  }
}

function createLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function createEnvironment({
  keyTexts = [],
  keycaps = [],
  platform = 'Win32',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  storage = {},
  prefersDark = false
} = {}) {
  const macButton = new FakeElement({
    dataset: { os: 'mac' },
    classNames: ['os-btn', 'active']
  });
  const winButton = new FakeElement({
    dataset: { os: 'win' },
    classNames: ['os-btn']
  });
  const toggle = new FakeElement();
  toggle.children = [macButton, winButton];

  const lightThemeButton = new FakeElement({
    dataset: { theme: 'light' },
    classNames: ['theme-btn', 'active']
  });
  const darkThemeButton = new FakeElement({
    dataset: { theme: 'dark' },
    classNames: ['theme-btn']
  });
  const themeToggle = new FakeElement();
  themeToggle.children = [lightThemeButton, darkThemeButton];

  const changelog = new FakeElement();
  const dismissChangelog = new FakeElement();
  dismissChangelog.closest = function (selector) {
    return selector === '.changelog' ? changelog : null;
  };

  const keyElements = keyTexts.map((text) => new FakeElement({ textContent: text }));
  const keycapElements = keycaps.map((text) => new FakeElement({ textContent: text }));
  const badges = [];
  const localStorage = createLocalStorage(storage);
  const documentElement = { dataset: {} };

  const document = {
    documentElement,
    getElementById(id) {
      if (id === 'osToggle') {
        return toggle;
      }
      if (id === 'themeToggle') {
        return themeToggle;
      }
      if (id === 'changelogPanel') {
        return changelog;
      }
      if (id === 'dismissChangelog') {
        return dismissChangelog;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.keycap') {
        return keycapElements;
      }
      if (selector === '.key') {
        return keyElements;
      }
      if (selector === '.badge-new[data-added]') {
        return badges;
      }
      return [];
    }
  };

  const context = vm.createContext({
    document,
    localStorage,
    navigator: { platform, userAgent },
    matchMedia(query) {
      return {
        matches: prefersDark && query === '(prefers-color-scheme: dark)'
      };
    },
    Date,
    console
  });

  return {
    context,
    documentElement,
    keyElements,
    keycapElements,
    macButton,
    winButton,
    lightThemeButton,
    darkThemeButton,
    changelog,
    dismissChangelog,
    localStorage
  };
}

function executeScript(context) {
  vm.runInContext(scriptSource, context);
}

test('点击 mac 按钮时，纯文本快捷键也会切换到 Mac 写法', () => {
  const env = createEnvironment({
    keyTexts: ['ShiftTab', 'AltP'],
    platform: 'Win32'
  });

  executeScript(env.context);
  env.macButton.click();

  assert.deepEqual(
    env.keyElements.map((element) => element.textContent),
    ['⇧Tab', '⌥P']
  );
  assert.equal(env.localStorage.getItem('cc-os'), 'mac');
  assert.equal(env.localStorage.getItem('cc-os-manual'), '1');
});

test('原有 keycap 结构继续按上游规则切换', () => {
  const env = createEnvironment({
    keycaps: ['Alt', 'Shift'],
    platform: 'MacIntel',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  });

  executeScript(env.context);
  env.winButton.click();

  assert.deepEqual(
    env.keycapElements.map((element) => element.textContent),
    ['Alt', 'Shift']
  );
  assert.equal(env.localStorage.getItem('cc-os'), 'win');
});

test('点击主题按钮时，会同步 data-theme 和 localStorage', () => {
  const env = createEnvironment();

  executeScript(env.context);
  env.darkThemeButton.click();

  assert.equal(env.documentElement.dataset.theme, 'dark');
  assert.equal(env.localStorage.getItem('cc-theme'), 'dark');
  assert.equal(env.darkThemeButton.classList.contains('active'), true);
  assert.equal(env.lightThemeButton.classList.contains('active'), false);
});

test('没有手动主题时，会回退到系统主题', () => {
  const env = createEnvironment({ prefersDark: true });

  executeScript(env.context);

  assert.equal(env.documentElement.dataset.theme, 'dark');
  assert.equal(env.localStorage.getItem('cc-theme'), 'dark');
});

test('点击 changelog 关闭按钮时，会移除 changelog 容器', () => {
  const env = createEnvironment();

  executeScript(env.context);
  env.dismissChangelog.click();

  assert.equal(env.changelog.removed, true);
});
