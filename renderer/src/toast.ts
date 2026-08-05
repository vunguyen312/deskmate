const TOAST_DURATION_MS = 4000;

export class Toast {
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly el: HTMLElement) {}

    public show(message: string): void {
        this.el.textContent = message;
        this.el.classList.add('show');
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.el.classList.remove('show');
        }, TOAST_DURATION_MS);
    }
}