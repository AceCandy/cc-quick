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

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) || [];

    event.currentTarget = this;
    for (const handler of handlers) {
      handler.call(this, event);
      if (event.propagationStopped) {
        break;
      }
    }

    return !event.defaultPrevented;
  }
}

class FakeElement extends FakeEventTarget {
  constructor({
    textContent = '',
    dataset = {},
    classNames = [],
    attributes = {},
    style = {},
    hidden = false,
    rectTop = 0,
    rectLeft = 0,
    rectWidth = 0,
    rectHeight = 0
  } = {}) {
    super();
    this.textContent = textContent;
    this.dataset = dataset;
    this.classList = new FakeClassList(classNames);
    this.attributes = attributes;
    this.style = style;
    this.children = [];
    this.removed = false;
    this.hidden = hidden;
    this.closestHandlers = new Map();
    this.rectTop = rectTop;
    this.rectLeft = rectLeft;
    this.rectWidth = rectWidth;
    this.rectHeight = rectHeight;
  }

  querySelectorAll(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return this.children.filter((child) => child.classList.contains(className));
    }

    return [];
  }

  setClosest(selector, value) {
    this.closestHandlers.set(selector, value);
  }

  closest(selector) {
    return this.closestHandlers.get(selector) || null;
  }

  contains(target) {
    return this.children.includes(target);
  }

  click() {
    const event = createEvent('click', { target: this });
    super.dispatchEvent(event);
    if (!event.propagationStopped && this.ownerDocument) {
      this.ownerDocument.dispatchEvent(event);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  remove() {
    this.removed = true;
  }

  getBoundingClientRect() {
    return {
      top: this.rectTop,
      left: this.rectLeft,
      width: this.rectWidth,
      height: this.rectHeight,
      right: this.rectLeft + this.rectWidth,
      bottom: this.rectTop + this.rectHeight
    };
  }
}

function createEvent(type, init = {}) {
  return {
    type,
    target: init.target || null,
    key: init.key,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
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
  sections = [],
  initialHash = '',
  platform = 'Win32',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  storage = {},
  prefersDark = false,
  headerTop = 16,
  headerHeight = 108,
  sidebarTop = 72,
  panelTop = 140
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

  const changelogTrigger = new FakeElement({
    classNames: ['changelog-trigger'],
    attributes: { 'aria-expanded': 'false' }
  });
  const changelog = new FakeElement({
    classNames: ['changelog-panel'],
    attributes: { id: 'changelogPanel' },
    hidden: true
  });
  const changelogPanelInner = new FakeElement();
  changelogPanelInner.setClosest('.changelog-panel', changelog);
  changelog.children = [changelogPanelInner];

  const sectionButtons = sections.map(({ target, active = false }) => new FakeElement({
    dataset: { sectionTarget: target },
    classNames: ['section-switcher-btn'].concat(active ? ['active'] : []),
    attributes: {
      'data-section-target': target,
      'aria-pressed': active ? 'true' : 'false'
    }
  }));
  const sectionPanels = sections.map(({ target, hidden = true }) => new FakeElement({
    dataset: { sectionPanel: target },
    attributes: { 'data-section-panel': target },
    hidden,
    rectTop: panelTop,
    rectHeight: 320
  }));
  const pageSidebar = new FakeElement({
    classNames: ['page-sidebar'],
    rectTop: sidebarTop,
    rectHeight: 480
  });
  const header = new FakeElement({
    classNames: ['header'],
    rectTop: headerTop,
    rectHeight: headerHeight
  });
  const sectionHeadings = sections.map(({ target }) => new FakeElement({
    attributes: { id: target }
  }));

  const panelByTarget = new Map(sectionPanels.map((panel, index) => [sections[index].target, panel]));
  const headingById = new Map(sectionHeadings.map((heading, index) => [sections[index].target, heading]));

  sections.forEach((section, index) => {
    const button = sectionButtons[index];
    const panel = sectionPanels[index];
    const heading = sectionHeadings[index];

    button.dataset.sectionTarget = section.target;
    heading.setClosest('[data-section-panel]', panel);
    panel.children = [heading];
  });

  const groupHeading = new FakeElement({
    attributes: { id: 'section-keyboard-group-general-controls' }
  });
  groupHeading.setClosest('[data-section-panel]', sectionPanels[0] || null);
  groupHeading.setClosest('.section-group', sectionPanels[0] || null);

  const keyElements = keyTexts.map((text) => new FakeElement({ textContent: text }));
  const keycapElements = keycaps.map((text) => new FakeElement({ textContent: text }));
  const badges = [];
  const localStorage = createLocalStorage(storage);
  const rootStyleValues = new Map();
  const documentElement = {
    dataset: {},
    style: {
      setProperty(name, value) {
        rootStyleValues.set(name, String(value));
      },
      getPropertyValue(name) {
        return rootStyleValues.get(name) || '';
      }
    }
  };
  const documentTarget = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  const documentBody = new FakeElement();
  documentBody.ownerDocument = null;
  const outsideClickTarget = new FakeElement();
  outsideClickTarget.ownerDocument = null;

  const location = {};
  const historyCalls = [];
  let hashchangeCount = 0;
  let hashValue = initialHash;
  Object.defineProperty(location, 'hash', {
    get() {
      return hashValue;
    },
    set(value) {
      const next = String(value);
      if (next === hashValue) {
        hashValue = next;
        return;
      }
      hashValue = next;
      hashchangeCount += 1;
      windowTarget.dispatchEvent(createEvent('hashchange'));
    }
  });

  const history = {
    replaceState(_state, _title, url) {
      historyCalls.push(url);
      if (typeof url === 'string') {
        const hashIndex = url.indexOf('#');
        hashValue = hashIndex === -1 ? '' : url.slice(hashIndex);
      }
    }
  };
  const scrollByCalls = [];

  const document = {
    documentElement,
    body: documentBody,
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
      if (id === 'changelogTrigger') {
        return changelogTrigger;
      }
      const heading = headingById.get(id);
      if (heading) {
        return heading;
      }
      if (id === 'section-keyboard-group-general-controls') {
        return groupHeading;
      }
      return null;
    },
    querySelector(selector) {
      if (selector === '.changelog-trigger') {
        return changelogTrigger;
      }
      if (selector === '.header') {
        return header;
      }
      if (selector === '.page-sidebar') {
        return pageSidebar;
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
      if (selector === '.section-switcher-btn') {
        return sectionButtons;
      }
      if (selector === '[data-section-panel]') {
        return sectionPanels;
      }
      return [];
    },
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    dispatchEvent(event) {
      if (!event.target) {
        event.target = documentBody;
      }
      return documentTarget.dispatchEvent(event);
    }
  };

  documentBody.ownerDocument = document;
  outsideClickTarget.ownerDocument = document;
  changelog.ownerDocument = document;
  changelogPanelInner.ownerDocument = document;
  changelogTrigger.ownerDocument = document;
  groupHeading.ownerDocument = document;
  sectionButtons.forEach((button) => {
    button.ownerDocument = document;
  });
  sectionPanels.forEach((panel) => {
    panel.ownerDocument = document;
  });
  sectionHeadings.forEach((heading) => {
    heading.ownerDocument = document;
  });
  header.ownerDocument = document;
  for (const [target, panel] of panelByTarget.entries()) {
    panel.setClosest('[data-section-panel]', panel);
    panel.setClosest(`[data-section-panel="${target}"]`, panel);
  }

  const window = {
    location,
    history,
    scrollBy(options) {
      scrollByCalls.push(options);
    },
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    dispatchEvent(event) {
      return windowTarget.dispatchEvent(event);
    }
  };
  window.window = window;
  window.document = document;

  const context = vm.createContext({
    document,
    window,
    localStorage,
    history,
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
    window,
    document,
    documentElement,
    header,
    keyElements,
    keycapElements,
    macButton,
    winButton,
    lightThemeButton,
    darkThemeButton,
    sectionButtons,
    sectionPanels,
    sectionHeadings,
    changelogTrigger,
    changelog,
    changelogPanelInner,
    groupHeading,
    outsideClickTarget,
    localStorage,
    historyCalls,
    scrollByCalls,
    getCssVar(name) {
      return rootStyleValues.get(name) || '';
    },
    getHashchangeCount() {
      return hashchangeCount;
    }
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

test('初始化时会根据 header 高度写入 sticky 偏移变量', () => {
  const env = createEnvironment({
    headerTop: 16,
    headerHeight: 108
  });

  executeScript(env.context);

  assert.equal(env.getCssVar('--sticky-shell-top'), '136px');
  assert.equal(env.getCssVar('--sticky-scroll-margin'), '160px');
});

test('初始化时会默认激活第一个 section', () => {
  const env = createEnvironment({
    sections: [
      { target: 'section-keyboard', active: true, hidden: false },
      { target: 'section-mcp', hidden: true }
    ]
  });

  executeScript(env.context);

  assert.equal(env.sectionButtons[0].classList.contains('active'), true);
  assert.equal(env.sectionButtons[0].attributes['aria-pressed'], 'true');
  assert.equal(env.sectionPanels[0].hidden, false);
  assert.equal(env.sectionButtons[1].classList.contains('active'), false);
  assert.equal(env.sectionPanels[1].hidden, true);
});

test('点击 section 按钮时，激活态和可见面板同步切换', () => {
  const env = createEnvironment({
    sections: [
      { target: 'section-keyboard', active: true, hidden: false },
      { target: 'section-mcp', hidden: true }
    ]
  });

  executeScript(env.context);
  env.sectionButtons[1].click();

  assert.equal(env.sectionButtons[0].classList.contains('active'), false);
  assert.equal(env.sectionButtons[0].attributes['aria-pressed'], 'false');
  assert.equal(env.sectionPanels[0].hidden, true);
  assert.equal(env.sectionButtons[1].classList.contains('active'), true);
  assert.equal(env.sectionButtons[1].attributes['aria-pressed'], 'true');
  assert.equal(env.sectionPanels[1].hidden, false);
  assert.equal(env.window.location.hash, '#section-mcp');
  assert.deepEqual(env.historyCalls, ['#section-mcp']);
  assert.equal(env.getHashchangeCount(), 0);
});

test('点击 section 按钮时，会把激活面板顶部对齐到左侧导航顶部', () => {
  const env = createEnvironment({
    sections: [
      { target: 'section-keyboard', active: true, hidden: false },
      { target: 'section-cli', hidden: true }
    ],
    sidebarTop: 80,
    panelTop: 164
  });

  executeScript(env.context);
  env.sectionButtons[1].click();

  assert.equal(env.scrollByCalls.length, 1);
  assert.equal(env.scrollByCalls[0].top, 84);
  assert.equal(env.scrollByCalls[0].left, 0);
  assert.equal(env.scrollByCalls[0].behavior, 'auto');
});

test('初始 hash 指向 group 时，会激活其父 section', () => {
  const env = createEnvironment({
    sections: [
      { target: 'section-keyboard', hidden: true },
      { target: 'section-mcp', active: true, hidden: false }
    ],
    initialHash: '#section-keyboard-group-general-controls'
  });

  executeScript(env.context);

  assert.equal(env.groupHeading.closest('[data-section-panel]'), env.sectionPanels[0]);

  assert.equal(env.sectionButtons[0].classList.contains('active'), true);
  assert.equal(env.sectionButtons[0].attributes['aria-pressed'], 'true');
  assert.equal(env.sectionPanels[0].hidden, false);
  assert.equal(env.sectionButtons[1].classList.contains('active'), false);
  assert.equal(env.sectionPanels[1].hidden, true);
});

test('section 切换应按 data-section-panel 选中面板而不是标题 id', () => {
  const env = createEnvironment({
    sections: [
      { target: 'section-keyboard', hidden: true },
      { target: 'section-mcp', hidden: true }
    ]
  });

  executeScript(env.context);

  assert.equal(env.document.getElementById('section-keyboard'), env.sectionHeadings[0]);
  assert.notEqual(env.document.getElementById('section-keyboard'), env.sectionPanels[0]);

  env.sectionButtons[0].click();

  assert.equal(env.sectionPanels[0].hidden, false);
  assert.equal(env.sectionButtons[0].classList.contains('active'), true);
  assert.equal(env.sectionButtons[0].attributes['aria-pressed'], 'true');
  assert.equal(env.window.location.hash, '#section-keyboard');
});

test('点击 changelog trigger 后会展开，再点一次会收起', () => {
  const env = createEnvironment();

  executeScript(env.context);
  env.changelogTrigger.click();

  assert.equal(env.changelog.hidden, false);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'true');

  env.changelogTrigger.click();

  assert.equal(env.changelog.hidden, true);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'false');
});

test('按 Esc 或点击外部时会关闭 changelog', () => {
  const env = createEnvironment();

  executeScript(env.context);
  env.changelogTrigger.click();
  assert.equal(env.changelog.hidden, false);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'true');

  env.document.dispatchEvent(createEvent('keydown', { key: 'Escape', target: env.document.body }));

  assert.equal(env.changelog.hidden, true);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'false');

  env.changelogTrigger.click();
  assert.equal(env.changelog.hidden, false);
  env.document.dispatchEvent(createEvent('click', { target: env.outsideClickTarget }));

  assert.equal(env.changelog.hidden, true);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'false');
});

test('点击 changelog 面板内部元素时不会关闭，点击外部才关闭', () => {
  const env = createEnvironment();

  executeScript(env.context);
  env.changelogTrigger.click();
  assert.equal(env.changelog.hidden, false);

  env.changelogPanelInner.click();
  assert.equal(env.changelog.hidden, false);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'true');

  env.outsideClickTarget.click();
  assert.equal(env.changelog.hidden, true);
  assert.equal(env.changelogTrigger.attributes['aria-expanded'], 'false');
});

test('脚本初始化不会再写入 cc-density', () => {
  const env = createEnvironment();

  executeScript(env.context);

  assert.equal(env.localStorage.getItem('cc-density'), null);
});
