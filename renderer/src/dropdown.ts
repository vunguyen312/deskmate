
export interface DropdownOption<T> {
    value: T;
    label: string;
}

export class Dropdown<T> {
    private readonly container: HTMLDivElement;
    private readonly toggle: HTMLButtonElement;
    private readonly menu: HTMLUListElement;
    private options: Array<DropdownOption<T>> = [];
    private value: T | undefined;

    constructor(
        private readonly onChange: (value: T) => void,
    ) {
        this.container = document.createElement('div');
        this.container.className = 'dropdown';

        this.toggle = document.createElement('button');
        this.toggle.type = 'button';
        this.toggle.className = 'dropdown-toggle';
        this.toggle.setAttribute('aria-haspopup', 'listbox');
        this.toggle.setAttribute('aria-expanded', 'false');

        const label = document.createElement('span');
        label.className = 'dropdown-label';
        const chevron = document.createElement('span');
        chevron.className = 'dropdown-chevron';
        this.toggle.append(label, chevron);

        this.menu = document.createElement('ul');
        this.menu.className = 'dropdown-menu hidden';
        this.menu.setAttribute('role', 'listbox');
        this.menu.tabIndex = -1;

        this.container.append(this.toggle, this.menu);

        this.toggle.addEventListener('click', () => {
            this.toggleOpen();
        });
        this.toggle.addEventListener('keydown', (e) => {
            if (
                e.key === 'Enter' ||
                e.key === ' ' ||
                e.key === 'ArrowDown' ||
                e.key === 'ArrowUp'
            ) {
                e.preventDefault();
                this.open();
            }
        });
        this.menu.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.moveFocus(1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.moveFocus(-1);
                    break;
                case 'Home':
                    e.preventDefault();
                    this.focusIndex(0);
                    break;
                case 'End':
                    e.preventDefault();
                    this.focusIndex(this.options.length - 1);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    this.chooseFocused();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    this.toggle.focus();
                    break;
                case 'Tab':
                    this.close();
                    break;
            }
        });

        const closeOnOutside = (e: Event) => {
            if (!this.container.contains(e.target as Node)) {
                this.close();
            }
        };
        document.addEventListener('pointerdown', closeOnOutside);
        document.addEventListener('click', closeOnOutside);
    }

    public get element(): HTMLDivElement {
        return this.container;
    }

    public get current(): T | undefined {
        return this.value;
    }

    public setOptions(
        options: ReadonlyArray<DropdownOption<T>>,
        current: T,
    ): void {
        this.options = [...options];
        this.menu.replaceChildren();
        this.options.forEach((o, i) => {
            const item = document.createElement('li');
            item.className = 'dropdown-option';
            item.id = `dropdown-option-${i}`;
            item.setAttribute('role', 'option');
            item.tabIndex = -1;
            item.textContent = o.label;
            item.addEventListener('click', () => {
                this.selectIndex(i);
            });
            item.addEventListener('pointerenter', () => {
                this.focusIndex(i);
            });
            this.menu.append(item);
        });
        const idx = this.options.findIndex((o) => o.value === current);
        this.setValue(this.options[Math.max(0, idx)].value);
    }

    private setValue(value: T): void {
        this.value = value;
        const index = this.options.findIndex((o) => o.value === value);
        const label = this.options[index].label;
        this.toggle.querySelector('.dropdown-label')!.textContent = label;
        this.menu
            .querySelectorAll('.dropdown-option')
            .forEach((el, i) => {
                el.setAttribute('aria-selected', String(i === index));
                el.classList.toggle('selected', i === index);
            });
    }

    private toggleOpen(): void {
        if (this.menu.classList.contains('hidden')) {
            this.open();
        } else {
            this.close();
        }
    }

    private open(): void {
        this.menu.classList.remove('hidden');
        this.toggle.setAttribute('aria-expanded', 'true');
        this.focusIndex(this.selectedIndex());
    }

    private close(): void {
        this.menu.classList.add('hidden');
        this.toggle.setAttribute('aria-expanded', 'false');
    }

    private selectedIndex(): number {
        const idx = this.options.findIndex((o) => o.value === this.value);
        return Math.max(0, idx);
    }

    private focusIndex(index: number): void {
        const items = this.menu.querySelectorAll('.dropdown-option');
        const clamped = Math.min(Math.max(0, index), items.length - 1);
        (items[clamped] as HTMLElement).focus();
        this.menu.setAttribute(
            'aria-activedescendant',
            (items[clamped] as HTMLElement).id,
        );
    }

    private moveFocus(delta: number): void {
        const items = this.menu.querySelectorAll('.dropdown-option');
        const current = Array.from(items).findIndex(
            (el) => el === document.activeElement,
        );
        this.focusIndex((current === -1 ? this.selectedIndex() : current) + delta);
    }

    private chooseFocused(): void {
        const items = this.menu.querySelectorAll('.dropdown-option');
        const index = Array.from(items).findIndex(
            (el) => el === document.activeElement,
        );
        if (index !== -1) {
            this.selectIndex(index);
        }
    }

    private selectIndex(index: number): void {
        this.setValue(this.options[index].value);
        this.close();
        this.toggle.focus();
        this.onChange(this.options[index].value);
    }
}
