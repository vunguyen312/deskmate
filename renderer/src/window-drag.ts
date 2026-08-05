import type { VoiceBoxApi } from '../../shared/contract';

const DRAG_THRESHOLD_PX = 5; 

export class WindowDragController {
    private dragStart: { x: number; y: number } | null = null;

    constructor(
        private readonly el: HTMLElement,
        private readonly api: VoiceBoxApi,
    ) {}

    public attach(): void {
        this.el.addEventListener('pointerdown', (e) => {
            this.dragStart = { x: e.screenX, y: e.screenY };
            this.el.setPointerCapture(e.pointerId);
            this.api.windowDragStart();
        });
        this.el.addEventListener('pointermove', (e) => {
            if (!this.dragStart) {
                return;
            }
            const dx = e.screenX - this.dragStart.x;
            const dy = e.screenY - this.dragStart.y;
            if (
                Math.abs(dx) > DRAG_THRESHOLD_PX ||
                Math.abs(dy) > DRAG_THRESHOLD_PX
            ) {
                this.api.windowDragMove(dx, dy);
                this.dragStart = { x: e.screenX, y: e.screenY };
            }
        });
        this.el.addEventListener('pointerup', () => {
            if (this.dragStart) {
                this.dragStart = null;
                this.api.windowDragEnd();
            }
        });
    }
}