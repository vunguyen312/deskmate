import type { VoiceBoxApi } from '../../shared/contract';

const DRAG_THRESHOLD_PX = 5;

interface DragAnchor {

    windowX: number;
    windowY: number;

    screenX: number;
    screenY: number;
}

export class WindowDragController {
    private anchor: DragAnchor | null = null;

    private dragGen = 0;

    constructor(
        private readonly el: HTMLElement,
        private readonly api: VoiceBoxApi,
    ) {}

    public attach(): void {
        this.el.addEventListener('pointerdown', (e) => {
            const gen = ++this.dragGen;
            this.api.windowDragStart();
            try {
                this.el.setPointerCapture(e.pointerId);
            } catch {

            }

            void this.api.getWindowPosition().then((pos) => {
                if (gen !== this.dragGen) {
                    return;
                }
                this.anchor = {
                    windowX: pos.x,
                    windowY: pos.y,
                    screenX: e.screenX,
                    screenY: e.screenY,
                };
            });
        });
        this.el.addEventListener('pointermove', (e) => {
            if (!this.anchor) {
                return;
            }
            const dx = e.screenX - this.anchor.screenX;
            const dy = e.screenY - this.anchor.screenY;
            if (
                Math.abs(dx) > DRAG_THRESHOLD_PX ||
                Math.abs(dy) > DRAG_THRESHOLD_PX
            ) {
                this.api.windowDragMoveTo(
                    this.anchor.windowX + dx,
                    this.anchor.windowY + dy,
                );
            }
        });
        this.el.addEventListener('pointerup', () => {
            this.endDrag();
        });
        this.el.addEventListener('pointercancel', () => {
            this.endDrag();
        });
    }

    private endDrag(): void {
        this.dragGen++;
        if (this.anchor) {
            this.anchor = null;
            this.api.windowDragEnd();
        }
    }
}
