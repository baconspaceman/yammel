import type { OptionGroupView } from '../state/options';

export interface GroupNavProps {
  groups: OptionGroupView[];
  onJump(name: string): void;
}

export function GroupNav({ groups, onJump }: GroupNavProps) {
  return (
    <nav className="nav" aria-label="Option groups">
      <h2 className="nav__title">Groups</h2>
      <ul className="nav__list">
        {groups.map((group) => (
          <li key={group.name}>
            <button type="button" className="nav__item" onClick={() => onJump(group.name)}>
              <span className="nav__name">{group.name}</span>
              <span className="nav__count">{group.options.length}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
