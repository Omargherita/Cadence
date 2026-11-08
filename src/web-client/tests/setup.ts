import 'fake-indexeddb/auto';
// Inject a browser-like Web Locks implementation for service tests. No lease fallback.
Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: {
        locks: {
            held: false,
            async request(_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) {
                if (this.held)
                    return callback(null);
                this.held = true;
                try {
                    return await callback({});
                }
                finally {
                    this.held = false;
                }
            }
        }
    }
});
