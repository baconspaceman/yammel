import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HelperPopout } from './components/HelperPopout';
import './styles/tokens.css';
import './styles/app.css';
import './styles/helper.css';
import './styles/host.css';

// The same page serves both windows: the editor, and the helper chat when it has its own window (?view=helper).
const popout = new URLSearchParams(window.location.search).get('view') === 'helper';
document.title = popout ? 'Helper - Archipelago YAML Editor' : document.title;

createRoot(document.getElementById('root')!).render(<StrictMode>{popout ? <HelperPopout api={window.api} /> : <App />}</StrictMode>);
