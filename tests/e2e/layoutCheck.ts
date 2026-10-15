import type { Page } from '@playwright/test';

export interface LayoutReport {
  /** Human-readable descriptions of everything wrong. Empty means the layout is clean. */
  problems: string[];
  /** How many pieces of visible text were measured (so a test can prove it looked at something). */
  textBoxes: number;
}

/**
 * Measures every visible piece of text in the page and reports:
 *  - two pieces of text drawn on top of each other,
 *  - text wider than its box that is not meant to scroll or end in an ellipsis,
 *  - text drawn outside the window,
 *  - the whole page scrolling sideways.
 * Text hidden by a scrolling or clipping ancestor (for example a clamped description) is not counted.
 */
export async function checkLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate((): LayoutReport => {
    interface Box {
      /** Which piece of text this rectangle belongs to (one piece of text can have a rectangle per line). */
      node: number;
      label: string;
      text: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }

    const OVERLAP_PX = 2;
    const problems: string[] = [];

    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    // While a modal dialog is open, only the dialog is on show: the page behind it is dimmed and unreachable.
    const modal = document.querySelector('[aria-modal="true"]');
    const boxes: Box[] = [];
    let nodeIndex = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      const parent = node.parentElement;
      if (text === '' || parent === null) continue;
      if (parent.closest('script,style,noscript,option,datalist,select')) continue;
      if (modal !== null && !modal.contains(parent)) continue;
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

      nodeIndex += 1;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width < 1 || rect.height < 1) continue;
        let { left: x0, top: y0, right: x1, bottom: y1 } = rect;
        let hidden = false;
        for (let a: Element | null = parent; a !== null && a !== document.documentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const clipX = cs.overflowX !== 'visible';
          const clipY = cs.overflowY !== 'visible';
          if (!clipX && !clipY) continue;
          const box = a.getBoundingClientRect();
          if (clipX) {
            x0 = Math.max(x0, box.left);
            x1 = Math.min(x1, box.right);
          }
          if (clipY) {
            y0 = Math.max(y0, box.top);
            y1 = Math.min(y1, box.bottom);
          }
          if (x1 - x0 < 1 || y1 - y0 < 1) {
            hidden = true;
            break;
          }
        }
        if (hidden) continue;
        boxes.push({ node: nodeIndex, label: describe(parent), text: text.slice(0, 40), x0, y0, x1, y1 });
      }
    }

    // Text drawn outside the window.
    for (const b of boxes) {
      if (b.x0 < -1 || b.y0 < -1 || b.x1 > window.innerWidth + 1 || b.y1 > window.innerHeight + 1) {
        problems.push(`outside the window: ${b.label} "${b.text}"`);
      }
    }

    // Text on top of other text.
    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j += 1) {
        const b = boxes[j]!;
        // Chrome reports the last line of line-clamped text twice; one text never overlaps itself in a healthy layout.
        if (a.node === b.node) continue;
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (w > OVERLAP_PX && h > OVERLAP_PX) {
          problems.push(`overlap: ${a.label} "${a.text}" and ${b.label} "${b.text}"`);
        }
      }
    }

    // Text wider than its box that is not allowed to scroll or end in an ellipsis.
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest('select,input,textarea,option,datalist,svg')) continue;
      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (!hasOwnText) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'none') continue;
      const canScroll = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      if (canScroll || cs.textOverflow === 'ellipsis') continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        problems.push(`text wider than its box: ${describe(el)} (${el.scrollWidth}px in ${el.clientWidth}px)`);
      }
    }

    // The page itself scrolling sideways.
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1) {
      problems.push(`the page scrolls sideways (${root.scrollWidth}px wide in a ${window.innerWidth}px window)`);
    }

    return { problems: Array.from(new Set(problems)), textBoxes: boxes.length };
  });
}

/**
 * checkLayout at every scroll position: each scrollable area is scrolled top to bottom in steps
 * so that text which is only on screen after scrolling gets measured too.
 */
export async function checkEverything(page: Page): Promise<LayoutReport> {
  const scrollers = await page.evaluate(() => {
    const found = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const overflowY = getComputedStyle(el).overflowY;
      return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    });
    found.forEach((el, index) => el.setAttribute('data-scan', String(index)));
    return found.length;
  });

  const problems = new Set<string>();
  let textBoxes = 0;
  const add = (report: LayoutReport) => {
    report.problems.forEach((p) => problems.add(p));
    textBoxes += report.textBoxes;
  };

  add(await checkLayout(page));
  for (let index = 0; index < scrollers; index += 1) {
    const steps = await page.evaluate((i) => {
      const el = document.querySelector<HTMLElement>(`[data-scan="${i}"]`);
      if (el === null) return 0;
      el.scrollTop = 0;
      return Math.ceil(el.scrollHeight / (el.clientHeight * 0.8));
    }, index);
    for (let step = 1; step <= steps; step += 1) {
      await page.evaluate(
        ([i, s]) => {
          const el = document.querySelector<HTMLElement>(`[data-scan="${i}"]`);
          if (el !== null) el.scrollTop = (s as number) * el.clientHeight * 0.8;
        },
        [index, step],
      );
      add(await checkLayout(page));
    }
    await page.evaluate((i) => {
      const el = document.querySelector<HTMLElement>(`[data-scan="${i}"]`);
      if (el !== null) el.scrollTop = 0;
    }, index);
  }
  await page.evaluate(() => document.querySelectorAll('[data-scan]').forEach((el) => el.removeAttribute('data-scan')));
  return { problems: Array.from(problems), textBoxes };
}
