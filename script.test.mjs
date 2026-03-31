import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const scriptSource = await readFile(new URL('./script.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
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
  }

  querySelectorAll(selector) {
    if (selector === '.os-btn') {
      return this.children.filter((child) => child.classList.contains('os-btn'));
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
  storage = {}
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

  const keyElements = keyTexts.map((text) => new FakeElement({ textContent: text }));
  const keycapElements = keycaps.map((text) => new FakeElement({ textContent: text }));
  const badges = [];
  const localStorage = createLocalStorage(storage);

  const document = {
    getElementById(id) {
      return id === 'osToggle' ? toggle : null;
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
    Date,
    console
  });

  return {
    context,
    keyElements,
    keycapElements,
    macButton,
    winButton,
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
