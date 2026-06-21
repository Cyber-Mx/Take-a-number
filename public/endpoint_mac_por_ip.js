// ═══════════════════════════════════════════════════════════════════
//  ENDPOINT NUEVO — agregar a routes/terminales.js (o donde esté el router)
//
//  GET /api/terminales/mac-por-ip?ip=192.168.1.50
//
//  Hace un ping + ARP lookup en el servidor para obtener la MAC real
//  del equipo cliente a partir de su IP local.
//  Funciona porque el servidor y los mostradores están en la misma LAN.
// ═══════════════════════════════════════════════════════════════════
const { exec } = require('child_process');
const os       = require('os');

router.get('/mac-por-ip', async (req, res) => {
  const ip = (req.query.ip || '').trim();

  // Validar formato IP básico
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return res.json({ ok: false, error: 'IP inválida' });
  }

  try {
    // 1. Hacer ping para llenar la tabla ARP del servidor
    //    (silencioso, solo para garantizar que la entrada ARP existe)
    await pingIP(ip);

    // 2. Leer tabla ARP del sistema operativo
    const mac = await arpLookup(ip);

    if (mac) {
      return res.json({ ok: true, mac, ip });
    } else {
      return res.json({ ok: false, error: `No se encontró MAC para ${ip} en la tabla ARP` });
    }
  } catch (err) {
    console.error('[ARP] Error:', err.message);
    return res.json({ ok: false, error: err.message });
  }
});

// Ping silencioso para actualizar tabla ARP
function pingIP(ip) {
  return new Promise((resolve) => {
    const isWin = os.platform() === 'win32';
    // -n 1 (Win) / -c 1 (Linux/Mac) = un solo ping, -w/-W timeout
    const cmd = isWin
      ? `ping -n 1 -w 500 ${ip}`
      : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, () => resolve()); // ignorar error: si no responde, el ARP puede tener la entrada igual
  });
}

// Lee la tabla ARP y extrae la MAC para la IP dada
function arpLookup(ip) {
  return new Promise((resolve, reject) => {
    const isWin = os.platform() === 'win32';

    exec(isWin ? `arp -a ${ip}` : `arp -n ${ip}`, (err, stdout) => {
      if (err && !stdout) return reject(new Error('ARP falló: ' + err.message));

      const lines = stdout.split('\n');
      let mac = null;

      if (isWin) {
        // Windows: "  192.168.1.50         a4-c3-f0-12-34-56     dinámico"
        for (const line of lines) {
          if (line.includes(ip)) {
            const m = line.match(/([0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2}[-:][0-9a-f]{2})/i);
            if (m) { mac = m[1].replace(/-/g, ':').toLowerCase(); break; }
          }
        }
      } else {
        // Linux: "192.168.1.50 ether a4:c3:f0:12:34:56 C eth0"
        // Mac:   "? (192.168.1.50) at a4:c3:f0:12:34:56 on en0"
        for (const line of lines) {
          const m = line.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
          if (m) { mac = m[1].toLowerCase(); break; }
        }
      }

      resolve(mac);
    });
  });
}
