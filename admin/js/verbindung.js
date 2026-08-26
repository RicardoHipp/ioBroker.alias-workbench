/* Die Socket-Verbindung zum Admin.

   `io` kommt als klassisches Skript aus socket.io.js und liegt als
   globale Variable vor - Module sehen sie ueber den globalen
   Gueltigkeitsbereich. */

var parts = location.pathname.split('/');
parts.splice(-3);
if (location.pathname.match(/^\/admin\//)) { parts = []; }
export var socket = io.connect('/', { path: parts.join('/') + '/socket.io' });
