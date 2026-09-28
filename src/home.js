import '../assets/data/projects.js';
import '../assets/js/main.js';
import '../assets/js/site-integration.js';
import '../assets/js/editorial.js';

// Keep the editorial site interactive immediately while the high-quality 3D
// renderer downloads as a separate production chunk.
void import('./interior.js');
