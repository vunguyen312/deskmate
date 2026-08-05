import type { ServiceKind } from '../../shared/contract';

export class ServiceError extends Error {
    constructor(
        readonly kind: ServiceKind,
        message: string,
        readonly status?: number,
    ) {
        super(message);
    }
}

export function errorMessage(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}