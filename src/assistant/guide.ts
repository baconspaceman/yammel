import { formatScore, labelFor } from '../difficulty/labels';
import type { DifficultyProfile, Rating } from '../difficulty/types';
import type { YamlDocument } from '../model/document';
import type { Edit } from '../model/edits';
import { presetEdits } from '../presets/presets';
import { acceptsRandom, formatRandom } from '../randomize/randomSpec';
import { planRandomizeAll } from '../randomize/plan';
import { describeOption, formatDefault, summarizeValue } from '../renderer/state/options';
import type { Random } from '../roulette/random';
import type { GameSchema, OptionSchema, SchemaFile } from '../schema/types';
import { bestFix, type Issue } from '../validate/types';
import { clearWinner, searchOptions, words } from './match';
import { nudgeDifficulty } from './nudge';
import type { Pointer, Proposal, Reply } from './types';

/** Everything the built-in guide may look at. It never writes anything itself. */
export interface GuideContext {
  schema: SchemaFile;
  game: GameSchema;
  doc: YamlDocument;
  issues: readonly Issue[];
  rating: Rating | null;
  profiles: ReadonlyMap<string, DifficultyProfile>;
  /** The check count for the current settings, or null when it is not known. */
  checks: number | null;
  /** Options kept out of "Randomize everything" and out of difficulty changes. */
  locked?: ReadonlySet<string>;
  random: Random;
}

const SOURCE = 'guide';

const reply = (text: string, extra: Partial<Omit<Reply, 'text' | 'source'>> = {}): Reply => ({
  text,
  proposals: extra.proposals ?? [],
  pointers: extra.pointers ?? [],
  followUps: extra.followUps ?? [],
  source: SOURCE,
});

let counter = 0;
const proposal = (title: string, edits: Edit[], detail?: string): Proposal => ({ id: `p${(counter += 1)}`, title, edits, ...(detail === undefined ? {} : { detail }) });

const pointer = (game: string, option: OptionSchema): Pointer => ({ game, option: option.key, label: option.displayName });

/** What the person sees for one option's value: "On", "hard", "30". */
function show(option: OptionSchema, value: unknown): string {
  if (value === undefined || value === null) return 'not set';
  if (option.kind === 'toggle' && typeof value === 'boolean') return value ? 'On' : 'Off';
  const choice = option.choices?.find((entry) => entry.key === value);
  return choice?.label ?? summarizeValue(value, 60);
}

function currentOf(ctx: GuideContext, option: OptionSchema): string {
  const raw = ctx.doc.get(ctx.game.name, option.key);
  if (raw === undefined) return `${show(option, option.default)} (the default)`;
  return show(option, describeOption(option, raw).editable ? describeOption(option, raw).value : raw);
}

/** Buttons for the empty chat: only things that make sense right now. */
export function startersFor(ctx: GuideContext): string[] {
  const out: string[] = [];
  if (ctx.issues.length > 0) out.push('Fix my problems');
  if (ctx.rating?.score !== null && ctx.rating?.score !== undefined) out.push('Make it easier', 'Make it harder');
  out.push('Surprise me', 'What did I change?');
  const goal = searchOptions(ctx.game, 'goal', 1)[0];
  if (goal !== undefined) out.push(`What does ${goal.option.displayName} do?`);
  return out.slice(0, 5);
}

const INTENT = {
  greet: /^\s*(hi|hello|hey|yo|help|\?|what can you do|what can i ask)[\s!.?]*$/,
  fix: /\b(fix|problems?|errors?|wrong|broken|invalid|will (this|it) work|does (this|it) work|is (this|it) (ok|okay|valid|good)|check (my|this|it))\b/,
  harder: /\b(harder|more difficult|tougher|more challenging|more punishing|more intense)\b/,
  easier: /\b(easier|more relaxed|less difficult|more casual|chill|simpler|gentler|more forgiving|less punishing)\b/,
  random: /\b(random|randomi[sz]e|surprise|mix it up|shuffle everything|roll)\b/,
  summary: /\b(summary|summari[sz]e|what did i|what have i|what('| i)?s changed|what is changed|overview|my setup|how is this set)\b/,
  reset: /\b(reset|back to (the )?defaults?|start over|start again|clear everything|undo everything)\b/,
  preset: /\bpresets?\b/,
  explain: /\b(what does|what is|what's|whats|explain|tell me about|describe|how does|what do)\b/,
  set: /\b(turn on|turn off|switch on|switch off|enable|disable|set|make|change|put|use|want|give me|add|remove)\b|\b(on|off)\b/,
};

function amountFrom(text: string): number {
  if (/\b(a lot|much|way|very|extremely|super|a ton)\b/.test(text)) return 3;
  if (/\b(a bit|a little|slightly|somewhat|tiny|touch)\b/.test(text)) return 0.8;
  return 1.5;
}

function helpReply(ctx: GuideContext): Reply {
  return reply(
    `Hi! I can change ${ctx.game.name}'s settings for you. Try things like "turn off death link", "set lives to 3", "make it harder", "fix my problems", "what does Goal do?" or "surprise me". I show you each change first, and nothing happens until you press Apply.`,
    { followUps: startersFor(ctx) },
  );
}

function fixReply(ctx: GuideContext): Reply {
  if (ctx.issues.length === 0) return reply('Nothing to fix. Archipelago should accept this YAML.', { followUps: ['What did I change?', 'Surprise me'] });
  const proposals: Proposal[] = [];
  const edits: Edit[] = [];
  for (const issue of ctx.issues) {
    const fix = bestFix(issue);
    if (fix === undefined) continue;
    proposals.push(proposal(fix.label, fix.edits, issue.message));
    edits.push(...fix.edits);
  }
  const unfixable = ctx.issues.filter((issue) => bestFix(issue) === undefined);
  const lines = [`I found ${ctx.issues.length} ${ctx.issues.length === 1 ? 'problem' : 'problems'}.`];
  if (proposals.length > 1) proposals.unshift(proposal(`Apply all ${proposals.length} fixes`, edits));
  if (unfixable.length > 0) {
    lines.push(`I left ${unfixable.length === 1 ? 'this one' : 'these'} alone, because the only fix would remove something you wrote. Look at ${unfixable.length === 1 ? 'it' : 'them'} in the Problems list: ${unfixable.map((i) => i.message).join(' ')}`);
  }
  return reply(lines.join(' '), { proposals, followUps: ['What did I change?'] });
}

function difficultyReply(ctx: GuideContext, direction: 'harder' | 'easier', text: string): Reply {
  const result = nudgeDifficulty({
    game: ctx.game,
    apVersion: ctx.schema.apVersion,
    profiles: ctx.profiles,
    current: currentValues(ctx),
    direction,
    amount: amountFrom(text),
    locked: ctx.locked,
  });
  if (!result.ok) return reply(result.message, { followUps: ['Surprise me', 'What did I change?'] });
  const { nudge } = result;
  const note = ctx.rating?.source === 'estimated' ? ' This game only has a rough estimate, so treat the numbers as a guide.' : '';
  return reply(
    `That moves the difficulty from about ${formatScore(nudge.before)} (${labelFor(nudge.before)}) to about ${formatScore(nudge.after)} (${labelFor(nudge.after)}).${note}`,
    {
      proposals: [proposal(nudge.changes.join(', '), nudge.edits, `${nudge.changes.length} ${nudge.changes.length === 1 ? 'change' : 'changes'}`)],
      followUps: [direction === 'harder' ? 'A bit harder' : 'A bit easier', direction === 'harder' ? 'Make it easier' : 'Make it harder'],
    },
  );
}

function currentValues(ctx: GuideContext): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(ctx.game.options)) {
    if (!ctx.doc.has(ctx.game.name, key)) continue;
    const value = ctx.doc.get(ctx.game.name, key);
    if (value !== null && value !== undefined) values[key] = value;
  }
  return values;
}

function randomReply(ctx: GuideContext): Reply {
  const plan = planRandomizeAll({
    game: ctx.game,
    apVersion: ctx.schema.apVersion,
    profiles: ctx.profiles,
    current: currentValues(ctx),
    locked: ctx.locked ?? new Set(),
    random: ctx.random,
    band: null,
  });
  if (!plan.ok) return reply(plan.message);
  return reply(`I rolled ${plan.rolled} options. Look at the summary before you apply it; you can always undo it, and ask again for a different roll.`, {
    proposals: [proposal(`Randomize ${plan.rolled} options`, plan.edits)],
    followUps: ['Surprise me again', 'Make it easier', 'Fix my problems'],
  });
}

function summaryReply(ctx: GuideContext): Reply {
  const lines: string[] = [];
  const changed: string[] = [];
  const pointers: Pointer[] = [];
  for (const option of Object.values(ctx.game.options)) {
    const raw = ctx.doc.get(ctx.game.name, option.key);
    if (raw === undefined || raw === null) continue;
    const state = describeOption(option, raw);
    if (!state.changed) continue;
    changed.push(`${option.displayName}: ${show(option, state.editable ? state.value : raw)}`);
    if (pointers.length < 6) pointers.push(pointer(ctx.game.name, option));
  }
  lines.push(
    changed.length === 0
      ? `Nothing in ${ctx.game.name} has been changed from its defaults yet.`
      : `You changed ${changed.length} ${changed.length === 1 ? 'setting' : 'settings'} from the defaults: ${changed.slice(0, 10).join('; ')}${changed.length > 10 ? `; and ${changed.length - 10} more` : ''}.`,
  );
  if (ctx.checks !== null) lines.push(`That gives ${ctx.checks} checks.`);
  if (ctx.rating?.score !== null && ctx.rating?.score !== undefined) lines.push(`The difficulty is about ${formatScore(ctx.rating.score)} out of 10 (${labelFor(ctx.rating.score)}).`);
  if (ctx.issues.length > 0) lines.push(`There ${ctx.issues.length === 1 ? 'is 1 problem' : `are ${ctx.issues.length} problems`} to look at.`);
  return reply(lines.join(' '), { pointers, followUps: ctx.issues.length > 0 ? ['Fix my problems'] : ['Make it harder', 'Make it easier'] });
}

function explainReply(ctx: GuideContext, option: OptionSchema): Reply {
  const bits = [`${option.displayName}: ${option.description.replace(/\s+/g, ' ').trim() || 'No description is given for this one.'}`];
  bits.push(`Right now it is ${currentOf(ctx, option)}.`);
  if (option.choices !== undefined && option.choices.length > 0) bits.push(`Choices: ${option.choices.slice(0, 10).map((c) => c.label).join(', ')}${option.choices.length > 10 ? ', ...' : ''}.`);
  const def = formatDefault(option);
  if (def !== null && option.kind !== 'toggle' && ctx.doc.has(ctx.game.name, option.key)) bits.push(`Default: ${def}.`);
  return reply(bits.join(' '), { pointers: [pointer(ctx.game.name, option)], followUps: [`Reset ${option.displayName}`] });
}

/** The value the message asks for, when it says one clearly. */
function valueFrom(option: OptionSchema, message: string): { value?: unknown; note?: string } {
  const lower = message.toLowerCase();
  const own = new Set(words(`${option.displayName} ${option.key}`));
  if (/\brandom\b/.test(lower) && acceptsRandom(option)) return { value: formatRandom({ type: 'random', bias: 'any' }) };

  if (option.kind === 'toggle') {
    const off = /\b(off|disable|disabled|no|false|without|never|stop|remove)\b/.test(lower);
    const on = /\b(on|enable|enabled|yes|true|with|always|add)\b/.test(lower);
    if (on !== off) return { value: on };
    return {};
  }
  if (option.kind === 'choice' || option.kind === 'text_choice') {
    const spoken = new Set(words(lower).filter((word) => !own.has(word)));
    let best: { key: string; score: number } | null = null;
    let tie = false;
    for (const choice of option.choices ?? []) {
      const tokens = words(`${choice.label} ${choice.key}`);
      const score = tokens.filter((token) => spoken.has(token)).length;
      if (score === 0) continue;
      if (best === null || score > best.score) {
        best = { key: choice.key, score };
        tie = false;
      } else if (score === best.score) tie = true;
    }
    return best !== null && !tie ? { value: best.key } : {};
  }
  if (option.kind === 'range' || option.kind === 'named_range') {
    const min = option.min ?? 0;
    const max = option.max ?? 0;
    const special = Object.entries(option.specialNames ?? {}).find(([name]) => new RegExp(`\\b${name.replace(/[_\\s]+/g, '[ _]')}\\b`, 'i').test(lower));
    if (special !== undefined) return { value: special[0] };
    if (/\b(max|maximum|highest|most|full)\b/.test(lower)) return { value: max };
    if (/\b(min|minimum|lowest|least|none|zero)\b/.test(lower)) return { value: min };
    // numbers that are part of the option's own name (for example "Level 99 Goal") are not the value
    const numbers = [...lower.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((n) => !own.has(String(n)));
    if (numbers.length === 0) return {};
    const wanted = numbers[numbers.length - 1]!;
    const clamped = Math.min(max, Math.max(min, wanted));
    return clamped === wanted ? { value: wanted } : { value: clamped, note: `${option.displayName} only goes from ${min} to ${max}, so I used ${clamped}.` };
  }
  return {};
}

function setReply(ctx: GuideContext, message: string, query: string): Reply | null {
  const matches = searchOptions(ctx.game, query, 4);
  const winner = clearWinner(matches);
  if (winner === null) return null;
  const option = winner.option;
  const { value, note } = valueFrom(option, message);
  const here = pointer(ctx.game.name, option);
  const key = option.key;
  if (value !== undefined) {
    const text = option.kind === 'toggle' ? `${value === true ? 'Turn on' : 'Turn off'} ${option.displayName}` : `Set ${option.displayName} to ${typeof value === 'string' && value === 'random' ? 'random' : show(option, value)}`;
    return reply(`${note ?? ''} ${option.displayName} is ${currentOf(ctx, option)} right now.`.trim(), {
      proposals: [proposal(text, [{ op: 'set', game: ctx.game.name, option: key, value }])],
      pointers: [here],
      followUps: ['What did I change?', `What does ${option.displayName} do?`],
    });
  }
  // The option is clear but the value is not: offer the values instead of guessing.
  const proposals: Proposal[] = [];
  if (option.kind === 'toggle') {
    proposals.push(proposal(`Turn on ${option.displayName}`, [{ op: 'set', game: ctx.game.name, option: key, value: true }]));
    proposals.push(proposal(`Turn off ${option.displayName}`, [{ op: 'set', game: ctx.game.name, option: key, value: false }]));
  } else if (option.choices !== undefined) {
    for (const choice of option.choices.slice(0, 6)) proposals.push(proposal(`Set ${option.displayName} to ${choice.label}`, [{ op: 'set', game: ctx.game.name, option: key, value: choice.key }]));
  }
  const ask =
    option.kind === 'range' || option.kind === 'named_range'
      ? ` Tell me the number you want, from ${option.min} to ${option.max}, like "set ${option.displayName} to ${option.default ?? option.min}".`
      : '';
  return reply(`I think you mean ${option.displayName}, which is ${currentOf(ctx, option)} now.${ask}`, { proposals, pointers: [here] });
}

function resetReply(ctx: GuideContext, message: string): Reply {
  const winner = clearWinner(searchOptions(ctx.game, message, 4));
  if (winner !== null) {
    const option = winner.option;
    if (!ctx.doc.has(ctx.game.name, option.key)) return reply(`${option.displayName} is already at its default.`, { pointers: [pointer(ctx.game.name, option)] });
    return reply(`${option.displayName} is ${currentOf(ctx, option)} now. This puts it back to the default.`, {
      proposals: [proposal(`Reset ${option.displayName}`, [{ op: 'reset', game: ctx.game.name, option: option.key }])],
      pointers: [pointer(ctx.game.name, option)],
    });
  }
  const keys = Object.keys(ctx.game.options).filter((key) => ctx.doc.has(ctx.game.name, key));
  if (keys.length === 0) return reply('Everything is already at its defaults.');
  return reply(`${keys.length} ${keys.length === 1 ? 'option is' : 'options are'} written in this YAML. This removes all of them, so the game uses its defaults.`, {
    proposals: [proposal(`Reset all ${keys.length} options`, keys.map((key): Edit => ({ op: 'reset', game: ctx.game.name, option: key })))],
  });
}

function presetReply(ctx: GuideContext, message: string): Reply | null {
  const presets = Object.entries(ctx.game.presets);
  if (presets.length === 0) return null;
  const lower = message.toLowerCase();
  const hit = presets.find(([name]) => lower.includes(name.toLowerCase()));
  const asksList = INTENT.preset.test(lower);
  if (hit === undefined && !asksList) return null;
  const toProposal = ([name, values]: [string, Record<string, unknown>]): Proposal => {
    const edits = presetEdits(ctx.game, values);
    return proposal(`Use the "${name}" preset`, edits, `Sets ${edits.length} ${edits.length === 1 ? 'option' : 'options'}.`);
  };
  if (hit !== undefined) return reply(`The "${hit[0]}" preset changes ${Object.keys(hit[1]).length} options. Apply it to try it; undo puts everything back.`, { proposals: [toProposal(hit)] });
  return reply(`${ctx.game.name} has ${presets.length} ${presets.length === 1 ? 'preset' : 'presets'}: ${presets.map(([name]) => name).join(', ')}.`, { proposals: presets.slice(0, 6).map(toProposal) });
}

/** Finds options for a free question and points at them. */
function findReply(ctx: GuideContext, message: string): Reply {
  const matches = searchOptions(ctx.game, message, 5);
  if (matches.length === 0) {
    return reply(
      `I could not find a setting in ${ctx.game.name} that matches that. I am the built-in guide, so I match words in option names and descriptions. Try different words, or ask "what can you do?". An AI helper (set up in Settings) can understand more open-ended requests.`,
      { followUps: startersFor(ctx) },
    );
  }
  const list = matches.map((m) => `${m.option.displayName} (${currentOf(ctx, m.option)})`).join('; ');
  return reply(`These look closest: ${list}. Tell me what to do with one, like "turn off ${matches[0]!.option.displayName}".`, {
    pointers: matches.map((m) => pointer(ctx.game.name, m.option)),
    followUps: [`What does ${matches[0]!.option.displayName} do?`],
  });
}

/**
 * The built-in guide: reads what was typed with plain rules and word matching, and answers with changes for the person to
 * approve. It is not a language model and says so when it cannot tell what was meant. It works with nothing installed.
 */
export function guideReply(message: string, ctx: GuideContext): Reply {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (text === '' || INTENT.greet.test(lower)) return helpReply(ctx);
  if (INTENT.fix.test(lower) && !INTENT.set.test(lower.replace(/\bchecks?\b/g, ''))) return fixReply(ctx);
  // "harder, not easier" still means harder
  const notEasier = /\b(not|no|never|without)( any| much)? (easier|more relaxed)\b/.test(lower);
  const notHarder = /\b(not|no|never|without)( any| much)? (harder|more difficult)\b/.test(lower);
  if (INTENT.harder.test(lower) && (!INTENT.easier.test(lower) || notEasier) && !notHarder) return difficultyReply(ctx, 'harder', lower);
  if (INTENT.easier.test(lower) && !notEasier) return difficultyReply(ctx, 'easier', lower);
  if (INTENT.summary.test(lower)) return summaryReply(ctx);

  // Words that say what to do are not part of the option's name, so they are left out of the search.
  const query = text.replace(/\b(random(ly)?|randomi[sz]e|surprise( me)?|reset|defaults?|presets?|start over)\b/gi, ' ');
  const winner = clearWinner(searchOptions(ctx.game, query, 4));
  if (INTENT.reset.test(lower)) return resetReply(ctx, query);
  const preset = presetReply(ctx, text);
  if (preset !== null && (winner === null || INTENT.preset.test(lower))) return preset;
  if (INTENT.random.test(lower) && (winner === null || /\b(everything|all|whole|surprise|it)\b/.test(lower))) return randomReply(ctx);
  if (INTENT.explain.test(lower) && winner !== null) return explainReply(ctx, winner.option);
  if (INTENT.set.test(lower)) {
    const set = setReply(ctx, text, query);
    if (set !== null) return set;
  }
  if (winner !== null) return explainReply(ctx, winner.option);
  return findReply(ctx, text);
}
