import type { YamlDocument } from '../../model/document';
import type { Edit } from '../../model/edits';
import type { OptionGroupView } from '../state/options';
import type { Issue } from '../../validate/types';
import { OptionCard, type GameNames } from './OptionCard';

/** The index keeps ids unique when two names differ only in punctuation. */
export function groupId(name: string, index: number): string {
  return `group-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

export interface OptionGroupsProps {
  game: string;
  doc: YamlDocument;
  groups: OptionGroupView[];
  isOpen(name: string): boolean;
  onToggle(name: string): void;
  onEdit(edits: Edit[]): boolean;
  /** Options kept out of Randomize everything. */
  locked: ReadonlySet<string>;
  onToggleLock(key: string): void;
  /** Validator problems, by option key. */
  issues?: ReadonlyMap<string, readonly Issue[]>;
  /** The game's item and location names, for the list options. */
  names?: GameNames;
}

export function OptionGroups({ game, doc, groups, isOpen, onToggle, onEdit, locked, onToggleLock, issues, names }: OptionGroupsProps) {
  return (
    <div className="groups">
      {groups.map((group, index) => {
        const id = groupId(group.name, index);
        const open = isOpen(group.name);
        return (
          <section key={group.name} id={id} className="group" aria-label={group.name}>
            <h2 className="group__title">
              <button type="button" aria-expanded={open}
                aria-controls={open ? `${id}-body` : undefined}
                onClick={() => onToggle(group.name)}>
                <span className="group__chevron" aria-hidden="true">
                  {open ? '▾' : '▸'}
                </span>
                <span className="group__name">{group.name}</span>
                <span className="group__count">{group.options.length}</span>
              </button>
            </h2>
            {open && (
              <div id={`${id}-body`} className="group__body">
                {group.options.map((option) => {
                  const raw = doc.get(game, option.key);
                  const found = issues?.get(option.key);
                  return (
                    <OptionCard
                      key={`${game}:${option.key}`}
                      game={game}
                      option={option}
                      raw={raw}
                      rawJson={JSON.stringify(raw) ?? ''}
                      onEdit={onEdit}
                      locked={locked.has(option.key)}
                      onToggleLock={onToggleLock}
                      issues={found}
                      names={names}
                      issuesKey={found?.map((i) => `${i.id}:${i.message}:${i.fixes.length}`).join('|') ?? ''}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
