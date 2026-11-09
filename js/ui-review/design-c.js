(() => {
    'use strict';

    const root = document.querySelector('.c-review');
    if (!root) {
        return;
    }
    const find = selector => root.querySelector(selector);
    const icons = () => window.lucide?.createIcons();
    const make = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) {
            element.textContent = text;
        }
        if (className) {
            element.className = className;
        }
        return element;
    };
    icons();
    find('[data-password-toggle]')?.addEventListener('click', event => {
        const input = find('#c-password');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        event.currentTarget.title = show ? 'Hide password' : 'Show password';
        event.currentTarget.innerHTML = show ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        icons();
    });
    find('[data-environment]')?.addEventListener('change', event => {
        find('[data-production]').hidden = event.target.value !== 'EBSPROD';
    });
    find('[data-login-form]')?.addEventListener('submit', event => {
        if (event.currentTarget.checkValidity()) {
            const button = event.currentTarget.querySelector('[type=submit]');
            button.disabled = true;
            button.querySelector('span').textContent = 'Signing in';
        }
    });
    window.addEventListener('pageshow', () => {
        const button = find('[data-login-form] [type=submit]');
        if (button) {
            button.disabled = false;
            button.querySelector('span').textContent = 'Sign in';
        }
    });
    if (!root.matches('[data-dashboard]')) {
        return;
    }

    let snapshot = JSON.parse(find('[data-snapshot]').textContent);
    let jobsChart;
    let inventoryChart;
    let refreshing = false;
    let weatherRequest;
    const palette = ['#188b91', '#d2a13f', '#bd5d81', '#5a88bc', '#659758', '#877cb4', '#b87b4a', '#6c828a'];
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    function showView(view, focus = false) {
        root.querySelectorAll('[data-view]').forEach(button => {
            const selected = button.dataset.view === view;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            if (selected && focus) {
                button.focus();
            }
        });
        root.querySelectorAll('[data-panel]').forEach(panel => {
            panel.hidden = panel.dataset.panel !== view;
        });
        if (view === 'overview') {
            jobsChart?.resize();
            inventoryChart?.resize();
        }
    }

    function jobCard(task, openKeys) {
        const card = make('details', undefined, 'c-job-card');
        card.dataset.taskKey = `${task.jobType}|${task.detail}|${task.assignedAt}`;
        card.open = openKeys.has(card.dataset.taskKey);
        const summary = make('summary');
        const meta = make('div', undefined, 'c-job-meta');
        meta.append(make('strong', task.jobType), make('span', task.status || '--'));
        summary.append(meta, make('strong', task.detail, 'c-job-title'), make('time', `Assigned ${task.assignedAt}`));
        const expanded = make('div', undefined, 'c-job-expanded');
        const fields = make('dl');
        [['Priority', task.priority || '--'], ['Status', task.status || '--'], ['Assigned', task.assignedAt]].forEach(([label, value]) => {
            fields.append(make('dt', label), make('dd', value));
        });
        expanded.append(fields);
        if (task.url) {
            const link = make('a', 'Open WMS task ');
            link.href = task.url;
            link.target = '_blank';
            link.rel = 'noopener';
            const icon = make('i');
            icon.dataset.lucide = 'arrow-up-right';
            icon.setAttribute('aria-hidden', 'true');
            link.append(icon);
            expanded.append(link);
        }
        card.append(summary, expanded);
        return card;
    }

    function renderJobs() {
        const query = find('[data-search]').value.toLowerCase();
        const type = find('[data-job-type]').value;
        const openKeys = new Set([...root.querySelectorAll('.c-job-card[open]')].map(card => card.dataset.taskKey));
        const jobs = snapshot.tasks.filter(task => {
            return (!type || task.jobType === type)
                && `${task.detail} ${task.status} ${task.jobType} ${task.priority}`.toLowerCase().includes(query);
        });
        const preview = find('[data-preview-jobs]');
        const all = find('[data-all-jobs]');
        preview.replaceChildren(...jobs.slice(0, 4).map(task => jobCard(task, openKeys)));
        all.replaceChildren(...jobs.map(task => jobCard(task, openKeys)));
        if (!jobs.length) {
            const message = snapshot.tasksAvailable ? 'No matching pending jobs.' : 'Pending jobs are unavailable.';
            preview.append(make('p', message, 'c-empty'));
            all.append(make('p', message, 'c-empty'));
        }
        find('[data-list-count]').textContent = `${jobs.length} of ${snapshot.tasks.length} jobs`;
        icons();
    }

    function renderDashboard() {
        find('[data-pending-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        root.querySelectorAll('[data-assigned-count]').forEach(element => {
            element.textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : number(snapshot.allocatedTasks.length);
        });
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-subinventory-count]').textContent = snapshot.inventory ? snapshot.inventory.slices.length : '--';
        find('[data-updated]').textContent = `Updated ${time(snapshot.retrievedAt)}`;
        find('[data-errors]').replaceChildren(...snapshot.errors.map(error => make('p', error.message, 'c-error')));
        const filter = find('[data-job-type]');
        const selected = filter.value;
        filter.replaceChildren(new Option('All job types', ''), ...snapshot.pendingJobs.map(job => new Option(job.jobType, job.jobType)));
        filter.value = selected;
        renderJobs();
        ['[data-allocated]', '[data-allocated-full]'].forEach(selector => {
            const list = find(selector);
            list.replaceChildren(...snapshot.allocatedTasks.map(task => {
                const item = make('div', undefined, 'c-allocation');
                item.append(make('time', task.assignDate), make('span', task.message));
                return item;
            }));
            if (!snapshot.allocatedTasks.length) {
                list.append(make('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'c-empty'));
            }
        });
        const news = find('[data-news]');
        news.replaceChildren(...snapshot.announcements.map(announcement => {
            const item = make('article');
            if (announcement.publishedAt) {
                item.append(make('small', new Date(announcement.publishedAt).toLocaleDateString()));
            }
            item.append(make('h3', announcement.title), make('p', announcement.detail));
            return item;
        }));
        if (!snapshot.announcements.length) {
            news.append(make('p', 'No announcements.', 'c-empty'));
        }
        renderCharts();
    }

    function renderCharts() {
        const jobs = snapshot.pendingJobs;
        find('[data-job-values]').replaceChildren(...jobs.map(job => make('span', `${job.jobType}: ${job.count}`)));
        const inventory = snapshot.inventory;
        const slices = inventory?.slices || [];
        const total = inventory?.totalRecords || 0;
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren(...slices.map((slice, index) => {
            const row = make('div', undefined, 'c-legend');
            const swatch = make('span', undefined, 'c-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            row.append(swatch, make('span', slice.subinventory), make('strong', `${total ? (slice.records / total * 100).toFixed(1) : '0.0'}%`));
            row.title = `${number(slice.records)} records`;
            return row;
        }));
        if (!slices.length) {
            legend.append(make('p', inventory ? 'No on-hand records.' : 'Inventory is unavailable.', 'c-empty'));
        }
        find('[data-inventory-time]').textContent = inventory ? `Snapshot ${time(inventory.retrievedAt)}` : '';
        if (!window.Chart) {
            return;
        }
        jobsChart?.destroy();
        inventoryChart?.destroy();
        const animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 };
        jobsChart = new Chart(find('[data-jobs-chart]'), {
            type: 'bar',
            data: {
                labels: jobs.map(job => job.jobType),
                datasets: [{ data: jobs.map(job => job.count), backgroundColor: jobs.map((job, index) => palette[index % palette.length]), borderRadius: 4, maxBarThickness: 40 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e1e8eb' } }, x: { grid: { display: false } } },
                onClick: (event, elements) => {
                    if (elements.length) {
                        find('[data-job-type]').value = jobs[elements[0].index].jobType;
                        renderJobs();
                        showView('jobs', true);
                    }
                }
            }
        });
        inventoryChart = new Chart(find('[data-inventory-chart]'), {
            type: 'pie',
            data: {
                labels: slices.map(slice => slice.subinventory),
                datasets: [{ data: slices.map(slice => slice.records), backgroundColor: slices.map((slice, index) => palette[index % palette.length]), borderWidth: 3, borderColor: '#f3f6f7' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: context => `${context.label}: ${number(context.raw)} records (${total ? (context.raw / total * 100).toFixed(1) : '0.0'}%)` } }
                }
            }
        });
    }

    async function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        find('[data-refresh]').disabled = true;
        root.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/ui-review/main/design-c/snapshot', {
                headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-c');
                return;
            }
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
                throw new Error('Refresh failed');
            }
            snapshot = await response.json();
            renderDashboard();
        } catch {
            find('[data-updated]').textContent = 'Refresh failed. Showing previous snapshot.';
        } finally {
            refreshing = false;
            find('[data-refresh]').disabled = false;
            root.removeAttribute('aria-busy');
        }
    }

    async function weather() {
        weatherRequest?.abort();
        weatherRequest = new AbortController();
        const request = weatherRequest;
        const cities = { hk: [22.3193, 114.1694], sg: [1.3521, 103.8198], tk: [35.6762, 139.6503] };
        const [latitude, longitude] = cities[find('[data-weather-city]').value];
        find('[data-weather-temperature]').textContent = '--';
        find('[data-weather-condition]').textContent = 'Updating weather';
        find('[data-weather-time]').textContent = '';
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`, {
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)])
            });
            if (!response.ok) {
                throw new Error('Weather unavailable');
            }
            const { current } = await response.json();
            if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) {
                throw new Error('Invalid weather');
            }
            find('[data-weather-temperature]').textContent = Math.round(current.temperature_2m);
            const code = current.weather_code;
            find('[data-weather-condition]').textContent = code === 0 ? 'Clear' : code < 4 ? 'Cloudy' : code < 50 ? 'Fog' : code < 70 ? 'Rain' : code < 80 ? 'Snow' : code < 95 ? 'Showers' : 'Thunderstorm';
            find('[data-weather-time]').textContent = `Open-Meteo / ${current.time.replace('T', ' ')}`;
        } catch {
            if (!request.signal.aborted) {
                find('[data-weather-condition]').textContent = 'Weather unavailable';
            }
        }
    }

    root.querySelectorAll('[data-view]').forEach(button => {
        button.addEventListener('click', () => showView(button.dataset.view));
        button.addEventListener('keydown', event => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const view = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'jobs' : button.dataset.view === 'overview' ? 'jobs' : 'overview';
                showView(view, true);
            }
        });
    });
    find('[data-show-all]').addEventListener('click', () => showView('jobs', true));
    find('[data-search]').addEventListener('input', renderJobs);
    find('[data-job-type]').addEventListener('change', renderJobs);
    find('[data-refresh]').addEventListener('click', refresh);
    find('[data-weather-refresh]').addEventListener('click', weather);
    find('[data-weather-city]').addEventListener('change', weather);
    document.addEventListener('click', event => {
        root.querySelectorAll('.c-navigation details[open]').forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.open = false;
            }
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const expanded = document.activeElement?.closest('.c-job-card');
            if (expanded?.open) {
                expanded.open = false;
                expanded.querySelector('summary').focus();
            }
            root.querySelectorAll('.c-navigation details[open]').forEach(menu => { menu.open = false; });
        }
    });
    window.setInterval(() => {
        const workingInCard = document.activeElement?.closest('.c-job-card');
        if (find('[data-auto-refresh]').checked && !document.hidden && !workingInCard) {
            refresh();
        }
    }, 60000);
    renderDashboard();
    weather();
})();