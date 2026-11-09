(() => {
    'use strict';

    const root = document.body;
    const design = root.dataset.demoDesign;
    const page = root.dataset.demoPage;
    const designs = new Set(['g', 'a', 'b', 'c', 'e', 'f']);
    const sessionKey = 'wms.layoutDemo.auth';
    const clone = value => structuredClone(value);
    const localDate = () => {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    };
    const paletteQuery = () => {
        const palette = new URL(location.href).searchParams.get('palette');
        return design === 'g' && /^[1-6]$/.test(palette || '') ? `?palette=${palette}` : '';
    };
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'demo.css';
    document.head.append(stylesheet);
    root.querySelectorAll('[data-login-form] input[type="radio"]').forEach(input => {
        input.name = 'Login.ConnectionName';
    });

    function syncPaletteLinks() {
        const palette = new URL(location.href).searchParams.get('palette');
        if (design !== 'g' || !/^[1-6]$/.test(palette || '')) {
            return;
        }
        root.querySelectorAll('a[href]').forEach(anchor => {
            if (anchor.hasAttribute('data-demo-unavailable') || anchor.getAttribute('href').startsWith('#')) {
                return;
            }
            const target = new URL(anchor.href, location.href);
            if (target.origin === location.origin && /\/(?:login|main|about)-g\.html$/.test(target.pathname)) {
                target.searchParams.set('palette', palette);
                anchor.href = target.href;
            }
        });
    }
    document.addEventListener('DOMContentLoaded', syncPaletteLinks, {once: true});
    root.addEventListener('change', event => {
        if (event.target.matches('[data-g-palette-option]')) {
            queueMicrotask(syncPaletteLinks);
        }
    });
    window.addEventListener('popstate', () => queueMicrotask(syncPaletteLinks));

    function authenticated() {
        try {
            return sessionStorage.getItem(sessionKey) === 'demo';
        } catch {
            return false;
        }
    }

    if (page === 'main' && !authenticated()) {
        location.replace(`login-${design}.html${paletteQuery()}`);
        return;
    }

    function notice() {
        const dialog = document.createElement('dialog');
        dialog.className = 'demo-notice';
        dialog.setAttribute('aria-labelledby', 'demo-notice-title');
        const title = document.createElement('h2');
        title.id = 'demo-notice-title';
        title.textContent = 'Action unavailable';
        const message = document.createElement('p');
        message.textContent = 'No changes were made.';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        close.addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove(), {once: true});
        dialog.append(title, message, close);
        root.append(dialog);
        dialog.showModal();
    }

    document.addEventListener('submit', event => {
        const form = event.target;
        event.preventDefault();
        if (form.matches('[data-login-form]')) {
            event.stopImmediatePropagation();
            const username = form.querySelector(`[id="${design}-user"]`);
            const password = form.querySelector('input[type="password"], input[autocomplete="current-password"]');
            let error = form.querySelector('[data-demo-login-error]');
            if (!error) {
                error = document.createElement('p');
                error.className = 'demo-login-error';
                error.setAttribute('data-demo-login-error', '');
                error.setAttribute('role', 'alert');
                form.prepend(error);
            }
            if (username.value.trim() !== 'demo' || password.value !== 'demo2026') {
                error.textContent = 'Username or password is incorrect.';
                error.hidden = false;
                password.setAttribute('aria-invalid', 'true');
                password.focus();
                return;
            }
            try {
                sessionStorage.setItem(sessionKey, 'demo');
            } catch {
                error.textContent = 'Browser storage is unavailable. Sign-in could not be completed.';
                error.hidden = false;
                return;
            }
            location.assign(`main-${design}.html${paletteQuery()}`);
        } else if (form.matches('[data-demo-logout]')) {
            event.stopImmediatePropagation();
            try {
                sessionStorage.removeItem(sessionKey);
            } catch {
            }
            location.assign(`login-${design}.html${paletteQuery()}`);
        }
    }, true);

    document.addEventListener('click', event => {
        const anchor = event.target.closest('a[href]');
        if (!anchor) {
            return;
        }
        const href = anchor.getAttribute('href');
        if (anchor.hasAttribute('data-demo-unavailable') || href === '#') {
            event.preventDefault();
            event.stopImmediatePropagation();
            notice();
            return;
        }
        const target = new URL(anchor.href, location.href);
        if (target.origin === location.origin && /\/(?:login|main|about)-g\.html$/.test(target.pathname)) {
            const palette = new URL(location.href).searchParams.get('palette');
            if (/^[1-6]$/.test(palette || '')) {
                target.searchParams.set('palette', palette);
                anchor.href = target.href;
            }
        }
    }, true);

    const snapshotElement = root.querySelector('[data-snapshot]');
    const summaryElement = root.querySelector('[data-summary]');
    let snapshot = snapshotElement ? JSON.parse(snapshotElement.textContent) : null;
    let summary = summaryElement ? JSON.parse(summaryElement.textContent) : null;

    if (snapshot) {
        snapshot.userName = 'DEMO.REVIEW';
        snapshot.retrievedAt = new Date().toISOString();
        const seed = clone(snapshot.tasks);
        snapshot.tasks = Array.from({length: 40}, (_, index) => {
            const task = clone(seed[index % seed.length]);
            task.detail = `${task.detail} / REVIEW-${String(index + 1).padStart(3, '0')}`;
            return task;
        });
        snapshot.pendingJobs = snapshot.pendingJobs.map(job => ({
            ...job,
            count: snapshot.tasks.filter(task => task.jobType === job.jobType).length
        }));
        snapshot.announcements = [
            {
                publishedAt: `${localDate()}T09:00:00`,
                title: 'Cycle count',
                detail: 'Cycle count is scheduled for Friday, 18:00-19:00.'
            },
            {
                publishedAt: `${localDate()}T08:30:00`,
                title: 'Outbound cutoff',
                detail: 'The final dispatch cutoff today is 16:30.'
            }
        ];
        snapshotElement.textContent = JSON.stringify(snapshot);
    }

    if (summary) {
        const to = localDate();
        const from = new Date(`${to}T00:00:00Z`);
        from.setUTCDate(from.getUTCDate() - 14);
        summary.dateFrom = `${from.toISOString().slice(0, 10)}T00:00:00`;
        summary.dateTo = `${to}T00:00:00`;
        summary.retrievedAt = new Date().toISOString();
        const dateInput = root.querySelector('[data-date-from]');
        dateInput.max = to;
        dateInput.value = summary.dateFrom.slice(0, 10);
        summaryElement.textContent = JSON.stringify(summary);
    }

    const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
        status,
        headers: {'Content-Type': 'application/json'}
    });

    window.fetch = async (input, options = {}) => {
        if (options.signal?.aborted) {
            throw new DOMException('Request aborted.', 'AbortError');
        }
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
        if (url.hostname === 'api.open-meteo.com' && url.pathname === '/v1/forecast') {
            const latitude = Number(url.searchParams.get('latitude'));
            const temperature = latitude > 35 ? 18 : latitude > 25 ? 21 : 26;
            return jsonResponse({current: {temperature_2m: temperature, weather_code: 1, time: new Date().toISOString().slice(0, 16)}});
        }
        const route = /^\/ui-review\/main\/design-([a-g])\/(snapshot|summary)$/.exec(url.pathname);
        if (!route || !designs.has(route[1]) || route[1] !== design || !snapshot) {
            return jsonResponse({message: 'Action unavailable.'}, 404);
        }
        if (!authenticated()) {
            return jsonResponse({message: 'Sign-in required.'}, 401);
        }
        if (route[2] === 'snapshot') {
            const refreshed = clone(snapshot);
            refreshed.retrievedAt = new Date().toISOString();
            return jsonResponse(refreshed);
        }
        if (!summary) {
            return jsonResponse({message: 'Task summary unavailable.'}, 404);
        }
        const from = url.searchParams.get('dateFrom') || summary.dateFrom.slice(0, 10);
        const requested = new Date(`${from}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(requested.getTime())
            || requested.toISOString().slice(0, 10) !== from || from > localDate()) {
            return jsonResponse({message: 'Choose a valid target date.'}, 400);
        }
        const refreshed = clone(summary);
        refreshed.dateFrom = `${from}T00:00:00`;
        refreshed.dateTo = `${localDate()}T00:00:00`;
        refreshed.retrievedAt = new Date().toISOString();
        const days = Math.max(1, Math.round((new Date(`${localDate()}T00:00:00Z`) - requested) / 86400000) + 1);
        for (const row of refreshed.rows) {
            let total = 0;
            for (const field of ['receiving', 'rma', 'shipping', 'stockTransfer', 'miscReceipt', 'miscIssue', 'wipIn', 'wipOut']) {
                row[field] = String(Math.max(0, Math.round(Number(row[field]) * days / 15)));
                total += Number(row[field]);
            }
            row.total = String(total);
        }
        return jsonResponse(refreshed);
    };
})();