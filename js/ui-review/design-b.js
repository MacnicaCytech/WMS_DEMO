(() => {
    'use strict';

    const root = document.querySelector('.b-review');
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
        const input = find('#b-password');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        event.currentTarget.title = show ? 'Hide password' : 'Show password';
        event.currentTarget.innerHTML = show ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
        icons();
    });
    root.querySelectorAll('.b-environments input').forEach(input => {
        input.addEventListener('change', () => {
            find('[data-production]').hidden = find('.b-environments input:checked').value !== 'EBSPROD';
        });
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
    let selectedType = '';
    let refreshing = false;
    let jobsChart;
    let inventoryChart;
    let weatherRequest;
    const dialog = find('[data-task-dialog]');
    const palette = ['#277753', '#4285b1', '#d69b36', '#b95d71', '#7c79ab', '#789b4c', '#9c754c', '#697e86'];
    const number = value => new Intl.NumberFormat('en').format(value);
    const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isHigh = task => /high|urgent|critical/i.test(task.priority);

    function renderQueue() {
        const query = find('[data-search]').value.toLowerCase();
        const highOnly = find('[data-priority]').checked;
        const jobs = snapshot.tasks.map((task, index) => ({ task, index })).filter(({ task }) => {
            return (!selectedType || task.jobType === selectedType)
                && (!highOnly || isHigh(task))
                && `${task.detail} ${task.status} ${task.priority} ${task.jobType}`.toLowerCase().includes(query);
        });
        const list = find('[data-job-list]');
        list.replaceChildren();
        jobs.forEach(({ task, index }) => {
            const item = make('article', undefined, 'b-job');
            item.classList.toggle('b-job-high', isHigh(task));
            const content = make('div');
            const meta = make('div', undefined, 'b-job-type');
            meta.append(make('strong', task.jobType), make('span', task.status || '--'), make('span', task.priority || '--'));
            const title = make(task.url ? 'a' : 'strong', task.detail, 'b-job-title');
            if (task.url) {
                title.href = task.url;
                title.target = '_blank';
                title.rel = 'noopener';
                title.title = 'Open WMS task';
            }
            content.append(meta, title, make('time', `Assigned ${task.assignedAt}`));
            const actions = make('div', undefined, 'b-job-actions');
            const details = make('button', undefined, 'b-icon');
            details.type = 'button';
            details.dataset.taskIndex = index;
            details.title = 'Task details';
            details.setAttribute('aria-label', `Details: ${task.detail}`);
            details.innerHTML = '<i data-lucide="info" aria-hidden="true"></i>';
            actions.append(details);
            if (task.url) {
                const open = make('a', undefined, 'b-command');
                open.href = task.url;
                open.target = '_blank';
                open.rel = 'noopener';
                open.title = 'Open WMS task';
                open.setAttribute('aria-label', `Open WMS task: ${task.detail}`);
                open.innerHTML = '<span>Open</span><i data-lucide="arrow-up-right" aria-hidden="true"></i>';
                actions.append(open);
            }
            item.append(make('div', undefined, 'b-job-marker'), content, actions);
            list.append(item);
        });
        if (!jobs.length) {
            const message = snapshot.tasksAvailable ? 'No matching pending jobs.' : 'Pending jobs are unavailable.';
            list.append(make('p', message, 'b-empty'));
        }
        find('[data-list-count]').textContent = `${jobs.length} of ${snapshot.tasks.length} jobs`;
        find('[data-job-modes]').querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.jobType === selectedType));
        });
        icons();
    }

    function renderDashboard() {
        find('[data-pending-count]').textContent = snapshot.tasksAvailable ? number(snapshot.tasks.length) : '--';
        find('[data-assigned-count]').textContent = snapshot.errors.some(error => error.area === 'Allocated jobs') ? '--' : `${snapshot.allocatedTasks.length} assigned`;
        find('[data-inventory-count]').textContent = snapshot.inventory ? number(snapshot.inventory.totalRecords) : '--';
        find('[data-updated]').textContent = `Updated ${time(snapshot.retrievedAt)}`;
        find('[data-errors]').replaceChildren(...snapshot.errors.map(error => make('p', error.message, 'b-error')));
        const modes = find('[data-job-modes]');
        modes.replaceChildren(...[{ jobType: '', count: snapshot.tasks.length }, ...snapshot.pendingJobs].map(job => {
            const button = make('button', job.jobType || 'All jobs');
            button.type = 'button';
            button.dataset.jobType = job.jobType;
            button.append(make('span', job.count));
            return button;
        }));
        renderQueue();
        const allocated = find('[data-allocated]');
        allocated.replaceChildren(...snapshot.allocatedTasks.map(task => {
            const item = make('div', undefined, 'b-allocation');
            item.append(make('time', task.assignDate), make('span', task.message));
            return item;
        }));
        if (!snapshot.allocatedTasks.length) {
            allocated.append(make('p', snapshot.errors.some(error => error.area === 'Allocated jobs') ? 'Allocated jobs are unavailable.' : 'No allocated jobs.', 'b-empty'));
        }
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
            news.append(make('p', 'No announcements.', 'b-empty'));
        }
        renderCharts();
    }

    function renderCharts() {
        const jobs = snapshot.pendingJobs;
        find('[data-job-values]').replaceChildren(...jobs.map(job => make('span', `${job.jobType}: ${job.count}`)));
        const inventory = snapshot.inventory;
        const total = inventory?.totalRecords || 0;
        const slices = inventory?.slices || [];
        const legend = find('[data-inventory-legend]');
        legend.replaceChildren(...slices.map((slice, index) => {
            const row = make('div', undefined, 'b-legend');
            const swatch = make('span', undefined, 'b-swatch');
            swatch.style.backgroundColor = palette[index % palette.length];
            row.append(swatch, make('span', slice.subinventory), make('strong', `${total ? (slice.records / total * 100).toFixed(1) : '0.0'}%`));
            row.title = `${number(slice.records)} records`;
            return row;
        }));
        if (!slices.length) {
            legend.append(make('p', inventory ? 'No on-hand records.' : 'Inventory is unavailable.', 'b-empty'));
        }
        find('[data-inventory-time]').textContent = inventory ? `Snapshot ${time(inventory.retrievedAt)}` : '';
        if (!window.Chart) {
            return;
        }
        jobsChart?.destroy();
        inventoryChart?.destroy();
        jobsChart = new Chart(find('[data-jobs-chart]'), {
            type: 'bar',
            data: {
                labels: jobs.map(job => job.jobType),
                datasets: [{ data: jobs.map(job => job.count), backgroundColor: '#277753', borderRadius: 2, maxBarThickness: 19 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e3e8e4' } }, y: { grid: { display: false } } },
                onClick: (event, elements) => {
                    if (elements.length) {
                        selectedType = jobs[elements[0].index].jobType;
                        renderQueue();
                    }
                }
            }
        });
        inventoryChart = new Chart(find('[data-inventory-chart]'), {
            type: 'pie',
            data: {
                labels: slices.map(slice => slice.subinventory),
                datasets: [{ data: slices.map(slice => slice.records), backgroundColor: slices.map((slice, index) => palette[index % palette.length]), borderWidth: 2, borderColor: '#f4f6f5' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
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
            const response = await fetch('/ui-review/main/design-b/snapshot', {
                headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(45000)
            });
            if (response.status === 401) {
                location.assign('/ui-review/login/design-b');
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
            const condition = code === 0 ? 'Clear' : code < 4 ? 'Cloudy' : code < 50 ? 'Fog' : code < 70 ? 'Rain' : code < 80 ? 'Snow' : code < 95 ? 'Showers' : 'Thunderstorm';
            find('[data-weather-condition]').textContent = condition;
            find('[data-weather-time]').textContent = `Open-Meteo / ${current.time.replace('T', ' ')}`;
        } catch {
            if (!request.signal.aborted) {
                find('[data-weather-condition]').textContent = 'Weather unavailable';
            }
        }
    }

    find('[data-job-modes]').addEventListener('click', event => {
        const button = event.target.closest('[data-job-type]');
        if (button) {
            selectedType = button.dataset.jobType;
            renderQueue();
        }
    });
    find('[data-search]').addEventListener('input', renderQueue);
    find('[data-priority]').addEventListener('change', renderQueue);
    find('[data-refresh]').addEventListener('click', refresh);
    find('[data-weather-refresh]').addEventListener('click', weather);
    find('[data-weather-city]').addEventListener('change', weather);
    find('[data-nav-toggle]').addEventListener('click', event => {
        const open = !find('#b-navigation').classList.contains('is-open');
        find('#b-navigation').classList.toggle('is-open', open);
        event.currentTarget.setAttribute('aria-expanded', String(open));
    });
    find('[data-job-list]').addEventListener('click', event => {
        const button = event.target.closest('[data-task-index]');
        if (!button) {
            return;
        }
        const task = snapshot.tasks[Number(button.dataset.taskIndex)];
        const detail = make('dl');
        [['Assigned', task.assignedAt], ['Task', task.detail], ['Job type', task.jobType], ['Status', task.status], ['Priority', task.priority || '--']].forEach(([label, value]) => {
            detail.append(make('dt', label), make('dd', value));
        });
        find('[data-task-detail]').replaceChildren(detail);
        const link = find('[data-task-link]');
        link.hidden = !task.url;
        if (task.url) {
            link.href = task.url;
        } else {
            link.removeAttribute('href');
        }
        dialog.showModal();
    });
    root.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && dialog.open) {
            event.preventDefault();
            dialog.close();
        }
    });
    window.setInterval(() => {
        if (find('[data-auto-refresh]').checked && !document.hidden && !dialog.open) {
            refresh();
        }
    }, 60000);
    renderDashboard();
    weather();
})();