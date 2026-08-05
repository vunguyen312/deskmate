const PLAYBACK_LEAD_SECONDS = 0.05; 

const SPEAKING_RESUME_DELAY_MS = 300; 

const WATCHDOG_MARGIN_MS = 500; 

export class AudioPlayer {
    private nextStart = 0;
    private lastNode: AudioBufferSourceNode | null = null;
    private playing = false;
    private finished = false;

    constructor(
        private readonly sampleRate: number,
        private readonly audioContext: AudioContext,
        private readonly body: HTMLElement,
        private readonly onSpeakingChange: (speaking: boolean) => void,
    ) {}

    public enqueue(f32: Float32Array<ArrayBuffer>): void {
        if (!this.playing) {
            this.playing = true;
            this.body.classList.add('speaking');
            this.onSpeakingChange(true);
            this.nextStart =
                this.audioContext.currentTime + PLAYBACK_LEAD_SECONDS;
        }
        const ab = this.audioContext.createBuffer(
            1,
            f32.length,
            this.sampleRate,
        );
        ab.copyToChannel(f32, 0);
        const src = this.audioContext.createBufferSource();
        src.buffer = ab;
        src.connect(this.audioContext.destination);
        src.start(this.nextStart);
        this.nextStart += ab.duration;
        this.lastNode = src;
    }

    public finish(): void {
        this.finished = false;
        if (this.playing && this.lastNode) {
            this.lastNode.onended = () => {
                this.unDim();
            };
            

            

            const remaining = Math.max(
                0,
                this.nextStart - this.audioContext.currentTime,
            );
            const watchdogMs = remaining * 1000 + WATCHDOG_MARGIN_MS;
            setTimeout(() => {
                this.unDim();
            }, watchdogMs);
        } else {
            this.unDim(); 

        }
        this.playing = false;
    }

    private unDim(): void {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.body.classList.remove('speaking');
        setTimeout(() => {
            this.onSpeakingChange(false);
        }, SPEAKING_RESUME_DELAY_MS);
    }
}