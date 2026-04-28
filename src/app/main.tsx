import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles.css';

// Note: <React.StrictMode> intentionally double-invokes effects in dev to catch
// cleanup bugs in pure-React code. That double-invocation is hostile to Phaser:
// the first game instance gets created, then destroyed, then a second is
// created — but Phaser's destroy() doesn't fully release scene instances and
// React refs end up out of sync. The result was the "stuck at round 4" bug:
// sceneRef.current was null at modal-click time even though a scene was alive.
// We rely on linting + tests to catch the bugs StrictMode would have surfaced.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
