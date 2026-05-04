const snippets = {
    snippet1: `void main() {
  print("Hello")
  if (true) {
    print("Unmatched brace");
  // Missing closing brace here
}`,
    snippet2: `void main() {
  int x = 5
  print("Missing semicolon")
}`,
    snippet3: `void main() {
  int unusedVar = 10;
  print("Hello");
}`,
    snippet4: `void main() {
  int x = 5;
  print(undefinedVar);
}`,
    snippet5: `void main() {
  int number = "I am a string";
  print(number);
}`
};

let editor;
const API_BASE = 'http://localhost:8080';

// Log functionality
function logLSP(method, payload, type = 'outgoing') {
    const logContainer = document.getElementById('lspLog');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;

    const time = new Date().toLocaleTimeString();
    const direction = type === 'outgoing' ? '->' : '<-';

    entry.innerHTML = `
        <div class="log-time">${time}</div>
        <div class="log-method">${direction} ${method}</div>
        <pre style="margin-top: 4px; color: #a1a1aa;">${JSON.stringify(payload, null, 2)}</pre>
    `;

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Initialize Monaco
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {

    editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: snippets.snippet1,
        language: 'dart',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false }
    });

    logLSP('initialize', { processId: 123, clientInfo: { name: 'DartLSP-Proto' } }, 'outgoing');
    logLSP('textDocument/didOpen', { document: { uri: 'file:///main.dart', languageId: 'dart' } }, 'outgoing');

    // Autocomplete Provider
    monaco.languages.registerCompletionItemProvider('dart', {
        provideCompletionItems: async function (model, position) {
            const code = model.getValue();
            const offset = model.getOffsetAt(position);

            logLSP('textDocument/completion', { textDocument: { uri: 'file:///main.dart' }, position }, 'outgoing');

            try {
                const response = await fetch(`${API_BASE}/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, cursor: offset })
                });

                const data = await response.json();
                logLSP('textDocument/completion response', data, 'incoming');

                const suggestions = data.completions.map(c => ({
                    label: c.label,
                    kind: monaco.languages.CompletionItemKind[c.kind] || monaco.languages.CompletionItemKind.Keyword,
                    insertText: c.label
                }));

                return { suggestions: suggestions };
            } catch (err) {
                console.error('Completion error', err);
                return { suggestions: [] };
            }
        }
    });

    // Debounced Analysis
    let timeout;
    editor.onDidChangeModelContent(() => {
        clearTimeout(timeout);
        timeout = setTimeout(analyzeCode, 800);
    });

    // Initial analysis
    analyzeCode();
});

async function analyzeCode() {
    const code = editor.getValue();
    logLSP('textDocument/didChange', { textDocument: { uri: 'file:///main.dart' } }, 'outgoing');

    try {
        const response = await fetch(`${API_BASE}/analyze-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await response.json();
        logLSP('textDocument/publishDiagnostics', { uri: 'file:///main.dart', diagnostics: data.diagnostics }, 'incoming');

        updateDiagnostics(data.diagnostics);
    } catch (err) {
        console.error('Analysis error', err);
        updateDiagnostics([{ message: 'Failed to connect to LSP Backend', severity: 'ERROR', line: 1, column: 1 }]);
    }
}

function updateDiagnostics(diagnostics) {
    const list = document.getElementById('diagnosticsList');
    list.innerHTML = '';

    if (diagnostics.length === 0) {
        list.innerHTML = '<li class="empty-state">No issues found.</li>';
        monaco.editor.setModelMarkers(editor.getModel(), 'dartLSP', []);
        return;
    }

    const markers = [];

    diagnostics.forEach(diag => {
        // UI List
        const li = document.createElement('li');
        const isError = diag.severity === 'ERROR';
        li.innerHTML = `<span class="${isError ? 'diag-error' : 'diag-warning'}">[${diag.severity}]</span> Line ${diag.line}, Col ${diag.column}: ${diag.message}`;
        list.appendChild(li);

        // Editor Markers
        markers.push({
            severity: isError ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            startLineNumber: diag.line,
            startColumn: diag.column,
            endLineNumber: diag.line,
            endColumn: diag.column + 5, // Arbitrary length for marker
            message: diag.message
        });
    });

    monaco.editor.setModelMarkers(editor.getModel(), 'dartLSP', markers);
}

// UI Controls
document.getElementById('snippetSelector').addEventListener('change', (e) => {
    editor.setValue(snippets[e.target.value]);
});

document.getElementById('analyzeBtn').addEventListener('click', analyzeCode);

document.getElementById('runBtn').addEventListener('click', async () => {
    const code = editor.getValue();
    const terminal = document.getElementById('terminalOutput');
    terminal.textContent = 'Running...';

    logLSP('workspace/executeCommand', { command: 'runDart', arguments: [code] }, 'outgoing');

    try {
        const response = await fetch(`${API_BASE}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await response.json();
        terminal.textContent = data.output;
        logLSP('workspace/executeCommand response', { output: data.output }, 'incoming');
    } catch (err) {
        terminal.textContent = 'Error: Failed to connect to Backend';
        console.error(err);
    }
});

// --- Window Manager Logic ---
const windows = document.querySelectorAll('.os-window');
let activeZIndex = 10;

windows.forEach(win => {
    const header = win.querySelector('.window-header');

    // Add 8-directional resizer elements
    const directions = ['t', 'b', 'l', 'r', 'tl', 'tr', 'bl', 'br'];
    let isResizing = false;
    let resizeDir = '';
    let startWidth, startHeight, startLeft, startTop, startX, startY;

    directions.forEach(dir => {
        const resizer = document.createElement('div');
        resizer.className = `resizer resizer-${dir}`;
        win.appendChild(resizer);

        resizer.addEventListener('pointerdown', (e) => {
            if (window.innerWidth <= 1366) return; // Disable all resizing on mobile/tablet
            isResizing = true;
            resizeDir = dir;
            startWidth = win.offsetWidth;
            startHeight = win.offsetHeight;
            startLeft = win.offsetLeft;
            startTop = win.offsetTop;
            startX = e.clientX;
            startY = e.clientY;
            
            document.body.style.userSelect = 'none';
            e.stopPropagation();
            resizer.setPointerCapture(e.pointerId);
        });
    });

    // Bring to front on click
    win.addEventListener('pointerdown', () => {
        activeZIndex++;
        win.style.zIndex = activeZIndex;
        windows.forEach(w => w.classList.remove('active'));
        win.classList.add('active');
    });

    // Drag logic
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('pointerdown', (e) => {
        if (window.innerWidth <= 1366) return; // Disable dragging on mobile/tablet

        // Only trigger drag on the header itself, not on buttons/selects inside
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

        isDragging = true;
        const rect = win.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
        header.setPointerCapture(e.pointerId);
    });

    document.addEventListener('pointermove', (e) => {
        if (isDragging) {
            const desktop = document.getElementById('desktop');
            const dRect = desktop.getBoundingClientRect();

            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            // Prevent dragging outside the desktop area completely
            if (newX < dRect.left) newX = dRect.left;
            if (newY < dRect.top) newY = dRect.top;

            win.style.left = (newX - dRect.left) + 'px';
            win.style.top = (newY - dRect.top) + 'px';
        }

        if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (window.innerWidth > 1366) {
                if (resizeDir.includes('r')) newWidth = startWidth + dx;
                if (resizeDir.includes('l')) { newWidth = startWidth - dx; newLeft = startLeft + dx; }
                if (resizeDir.includes('b')) newHeight = startHeight + dy;
                if (resizeDir.includes('t')) { newHeight = startHeight - dy; newTop = startTop + dy; }
            }

            if (newWidth >= 250) {
                win.style.width = newWidth + 'px';
                if (window.innerWidth > 1366) win.style.left = newLeft + 'px';
            }
            if (newHeight >= 200) {
                win.style.height = newHeight + 'px';
                if (window.innerWidth > 1366) win.style.top = newTop + 'px';
            }
        }
    });

    document.addEventListener('pointerup', (e) => {
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
        try {
            if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
            if (e.target && e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) {
                e.target.releasePointerCapture(e.pointerId);
            }
        } catch(err) {}
    });
});

// Monaco Resize Observer
const editorWindow = document.getElementById('window-editor');
if (editorWindow) {
    const resizeObserver = new ResizeObserver(() => {
        if (editor) {
            editor.layout();
        }
    });
    resizeObserver.observe(editorWindow);
}
