import type { Page } from '@playwright/test';

/**
 * Checks the screen that is showing right now for the accessibility problems a script can find:
 * controls with no name, pictures with no text, repeated ids, text that is hard to read against its background,
 * and keyboard focus that cannot be seen. Returns plain sentences; an empty list is a pass.
 */
export async function auditAccessibility(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      for (let node: Element | null = el; node !== null; node = node.parentElement) if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
      return true;
    };
    const describe = (el: Element): string => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`;

    // 1. every control has a name
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria !== null && aria.trim() !== '') return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by !== null) {
        const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (text !== '') return text;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        const labels = el.labels !== null ? Array.from(el.labels).map((l) => l.textContent ?? '').join(' ').trim() : '';
        if (labels !== '') return labels;
        if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) && el.value.trim() !== '') return el.value.trim();
      }
      const title = el.getAttribute('title');
      const text = (el.textContent ?? '').trim();
      if (text !== '') return text;
      if (title !== null && title.trim() !== '') return title.trim();
      return '';
    };
    const controls = document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [role="combobox"], [role="textbox"], [role="searchbox"]');
    controls.forEach((el) => {
      if (!visible(el)) return;
      if (nameOf(el) === '') problems.push(`no accessible name: ${describe(el)}`);
    });

    // 2. pictures
    document.querySelectorAll('img').forEach((img) => {
      if (visible(img) && img.getAttribute('alt') === null) problems.push(`picture without alt text: ${describe(img)}`);
    });

    // 3. repeated ids
    const seen = new Map<string, number>();
    document.querySelectorAll('[id]').forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1));
    for (const [id, count] of seen) if (count > 1) problems.push(`id "${id}" is used ${count} times`);

    // 4. text contrast (WCAG: 4.5, or 3 for large text), skipping disabled controls
    type RGBA = [number, number, number, number];
    const parse = (value: string): RGBA | null => {
      const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
      if (m === null) {
        const c = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(value.trim());
        return c === null ? null : [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255, c[4] === undefined ? 1 : Number(c[4])];
      }
      const parts = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map((i) => (top[i]! * top[3] + bottom[i]! * bottom[3] * (1 - top[3])) / a).concat([a]) as RGBA;
    };
    const backgroundOf = (el: Element): RGBA => {
      const layers: RGBA[] = [];
      for (let node: Element | null = el; node !== null; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c !== null && c[3] > 0) {
          layers.push(c);
          if (c[3] >= 0.99) break;
        }
      }
      let base: RGBA = [255, 255, 255, 1];
      const page = parse(getComputedStyle(document.body).backgroundColor);
      if (page !== null && page[3] > 0.99) base = page;
      for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i]!, base);
      return base;
    };
    const lum = (c: RGBA): number => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA): number => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const checked = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const el = node.parentElement;
      if (text === '' || el === null || !visible(el)) continue;
      if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
      if (el.closest('[disabled], [aria-disabled="true"]') !== null) continue;
      const style = getComputedStyle(el);
      const fg = parse(style.color);
      if (fg === null) {
        problems.push(`the audit cannot read this text colour (${style.color}): ${describe(el)}`);
        continue;
      }
      // faded text: an ancestor's opacity makes it paler than its own colour says
      let fade = 1;
      for (let node: Element | null = el; node !== null; node = node.parentElement) fade *= Number(getComputedStyle(node).opacity);
      const bg = backgroundOf(el);
      const eff = over([fg[0], fg[1], fg[2], fg[3] * fade], bg);
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const got = ratio(eff, bg);
      if (got < need) {
        const key = `${describe(el)}|${got.toFixed(1)}`;
        if (checked.has(key)) continue;
        checked.add(key);
        problems.push(`low contrast ${got.toFixed(2)}:1 (needs ${need}): ${describe(el)}`);
      }
    }

    return problems;
  });
}

/**
 * Presses Tab with the real keyboard and checks that each stop shows a focus ring and that focus keeps moving to new controls
 * (no keyboard trap in the first stops). `stops` is how many Tab presses to try.
 */
export async function auditKeyboard(page: Page, stops = 14): Promise<string[]> {
  const problems: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen = new Set<string>();
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el === null || el === document.body) return null;
      // A focus ring is a look that is there while focused and not there at rest: compare the two states.
      const look = () => {
        const s = getComputedStyle(el);
        return `${s.outlineStyle}|${s.outlineWidth}|${s.outlineColor}|${s.boxShadow}|${s.borderColor}`;
      };
      const focusedLook = look();
      const focusedStyle = getComputedStyle(el);
      const hasOutline = focusedStyle.outlineStyle !== 'none' && parseFloat(focusedStyle.outlineWidth) > 0;
      el.blur();
      const restingLook = look();
      el.focus();
      const visibleRing = focusedLook !== restingLook || hasOutline;
      const path: string[] = [];
      for (let n: Element | null = el; n !== null && path.length < 4; n = n.parentElement) path.push(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : ''));
      const holder = window as unknown as { __lastTab?: Element };
      const same = holder.__lastTab === el;
      holder.__lastTab = el;
      return {
        label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${path.join('<')}`,
        id: Array.prototype.indexOf.call(document.querySelectorAll('*'), el) as number,
        same,
        visibleFocus: visibleRing,
      };
    });
    if (info === null) continue;
    if (!info.visibleFocus) problems.push(`no visible keyboard focus: ${info.label}`);
    if (info.same) problems.push(`keyboard focus is stuck on: ${info.label}`);
    seen.add(String(info.id));
  }
  if (seen.size < Math.min(4, stops)) problems.push(`Tab reached only ${seen.size} different controls`);
  return problems;
}
