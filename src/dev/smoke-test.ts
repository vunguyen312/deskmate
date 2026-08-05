import { Config } from '../app/config';
import { LlmClient } from '../clients/llm-client';
import { APP_DIR } from '../utils/paths';
import { LlamaService } from '../services/llama-service';

async function main(): Promise<void> {
    const config = new Config(`${APP_DIR}/config.json`).data;
    const toasts: string[] = [];
    const svc = new LlamaService(config.llm, (m) => {
        toasts.push(m);
        console.log('[toast]', m);
    });
    const t0 = Date.now();
    await svc.ensureStarted();
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`${config.llm.baseUrl}/health`);
            if (res.ok) {
                const data = (await res.json()) as { status?: string };
                if (data.status === 'ok') {
                    break;
                }
            }
        } catch {
            
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    const upMs = Date.now() - t0;
    const client = new LlmClient(config.llm);
    const reply = await client.chat('こんにちは！今日はどんな気分？', []);
    console.log('UP_IN_MS:', upMs);
    console.log('REPLY:', reply);
    console.log('TOASTS:', JSON.stringify(toasts));
    svc.stop();
    process.exit(0);
}

main().catch((err) => {
    console.error('SMOKE FAILED:', err);
    process.exit(1);
});