import { expect, test } from '@playwright/test';
import { checkLayout } from './layoutCheck';
import { closeApp, launch } from './helpers';

// The layout checker is only worth trusting if it fails on genuinely broken layouts.
// Each case below injects a known bug into a blank page and expects it to be reported.

async function problemsFor(html: string): Promise<string[]> {
  const { app, page } = await launch();
  try {
    await page.setContent(`<!doctype html><html><body style="margin:0;font:16px sans-serif">${html}</body></html>`);
    return (await checkLayout(page)).problems;
  } finally {
    await closeApp(app);
  }
}

test('a clean layout reports nothing', async () => {
  const problems = await problemsFor('<p>First line</p><p>Second line</p><div style="width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long label that is cut with dots</div>');
  expect(problems).toEqual([]);
});

test('reports two pieces of text drawn on top of each other', async () => {
  const problems = await problemsFor(
    '<p style="position:absolute;top:20px;left:20px;margin:0">Hello world here</p><p style="position:absolute;top:24px;left:30px;margin:0">Overlapping words</p>',
  );
  expect(problems.some((p) => p.startsWith('overlap:'))).toBe(true);
});

test('reports text wider than its box when it is not allowed to scroll or end in dots', async () => {
  const problems = await problemsFor('<div style="width:50px;overflow:hidden;white-space:nowrap">Some text that does not fit in the box</div>');
  expect(problems.some((p) => p.startsWith('text wider than its box'))).toBe(true);
});

test('reports text that spills out of its box into its neighbour', async () => {
  const problems = await problemsFor(
    '<div style="display:flex"><div style="width:60px;white-space:nowrap">Text that spills over the next box</div><div>Neighbour</div></div>',
  );
  expect(problems.length).toBeGreaterThan(0);
});

test('reports text outside the window and a page that scrolls sideways', async () => {
  const problems = await problemsFor('<p style="position:absolute;left:5000px;top:10px;margin:0">Far away</p>');
  expect(problems.some((p) => p.startsWith('outside the window'))).toBe(true);
  expect(problems.some((p) => p.startsWith('the page scrolls sideways'))).toBe(true);
});

test('ignores text that a scrolling box hides', async () => {
  const problems = await problemsFor(
    '<div style="height:40px;overflow:auto"><p style="margin:0">Visible line</p><p style="margin:0;margin-top:200px">Hidden below the fold</p></div><p>Next</p>',
  );
  expect(problems).toEqual([]);
});
