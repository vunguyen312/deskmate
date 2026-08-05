export function servicePort(url: string, def: number): number {
    try {
        return Number(new URL(url).port) || def;
    } catch {
        return def;
    }
}

export function baseUrlHost(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export function isLocalHost(host: string): boolean {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}