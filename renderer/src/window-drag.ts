import type { VoiceBoxApi } from '../../shared/contract';

const DRAG_THRESHOLD_PX = 5;

interface DragAnchor {
    /** Window position (DIP) when the drag started. */
    windowX: number;
    windowY: number;
    /** Cursor screen position (DIP) when the drag started. */
    screenX: number;
    screenY: number;
}

export class WindowDragController {
    private anchor: DragAnchor | null = null;
    /** Bumped on every pointerdown/up/cancel; invalidates pending anchors. */
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
                // Synthetic pointer (tests/assistive input): no active pointer
                // to capture. The drag still works; moves just need the cursor
                // to stay over the element.
            }
            // Anchor the window position + grab point once. Every move then
            // sends the *absolute* target (anchor + cursor displacement), so
            // late or burst IPC messages all converge on the same position —
            // no accumulation, no feedback, no shake at any drag speed.
            void this.api.getWindowPosition().then((pos) => {
                if (gen !== this.dragGen) {
                    return; // drag ended before the anchor query resolved
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
