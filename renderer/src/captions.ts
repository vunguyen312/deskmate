

export class Captions {
    constructor(
        private readonly root: HTMLElement,
        private readonly textEl: HTMLElement,
    ) {}

    
    public setText(text: string): void {
        this.textEl.textContent = text;
    }

    
    public showWaiting(): void {
        this.root.classList.add('waiting');
    }

    
    public hideWaiting(): void {
        this.root.classList.remove('waiting');
    }
}