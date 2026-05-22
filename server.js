const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3050);
const ROOM = 'main';
const MAX_PEERS = Number(process.env.MAX_PEERS || 2);
const TURN_URLS = (process.env.TURN_URLS || 'turn:your-turn-domain.example.com:3478?transport=tcp')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
const TURN_USERNAME = process.env.TURN_USERNAME || 'replace-me';
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || 'replace-me';
const ICE_TRANSPORT_POLICY = process.env.ICE_TRANSPORT_POLICY || 'relay';
const VIDEO_CONFIG = {
    width: Number(process.env.VIDEO_WIDTH || 1920),
    height: Number(process.env.VIDEO_HEIGHT || 1080),
    frameRate: Number(process.env.VIDEO_FPS || 24),
    maxBitrate: Number(process.env.VIDEO_MAX_BITRATE || 8000000),
    startBitrate: Number(process.env.VIDEO_START_BITRATE || 5000000),
    minBitrate: Number(process.env.VIDEO_MIN_BITRATE || 3000000),
    degradationPreference: process.env.VIDEO_DEGRADATION || 'maintain-resolution',
    preferCodec: process.env.VIDEO_PREFER_CODEC || 'H264',
    strict: process.env.VIDEO_STRICT !== 'false',
};
const AUDIO_MAX_BITRATE = Number(process.env.AUDIO_MAX_BITRATE || 64000);
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
    if (req.url === '/config.json') {
        res.writeHead(200, {
            'Content-Type': MIME['.json'],
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({
            maxPeers: MAX_PEERS,
            iceConfig: {
                iceServers: [{
                    urls: TURN_URLS,
                    username: TURN_USERNAME,
                    credential: TURN_CREDENTIAL,
                }],
                iceTransportPolicy: ICE_TRANSPORT_POLICY,
            },
            video: VIDEO_CONFIG,
            audio: {
                maxBitrate: AUDIO_MAX_BITRATE,
            },
        }));
        return;
    }

    const filePath = (req.url === '/' || req.url.startsWith('/room/'))
        ? path.join(__dirname, 'public', 'index.html')
        : path.join(__dirname, 'public', req.url);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });
const peers = new Map(); // peerId -> { ws }

wss.on('connection', (ws) => {
    // Reject if room already has 2 peers
    if (peers.size >= MAX_PEERS) {
        ws.send(JSON.stringify({ type: 'room-full' }));
        ws.close(4001, 'Room is full (max 2 peers)');
        console.log(`[${ROOM}] Rejected connection, room full (${peers.size})`);
        return;
    }

    const peerId = Math.random().toString(36).substring(2, 10);
    const existing = Array.from(peers.keys());

    peers.set(peerId, { ws });
    console.log(`[${ROOM}] ${peerId} joined. Total: ${peers.size}`);

    ws.send(JSON.stringify({ type: 'init', peerId, peers: existing }));
    broadcast({ type: 'peer-joined', peerId });

    ws.on('message', (data, isBinary) => {
        if (isBinary) {
            const peersFwd = [];
            for (const [id, info] of peers) {
                if (id !== peerId && info.ws.readyState === 1) {
                    info.ws.send(data, { binary: true });
                    peersFwd.push(id.substring(0,6));
                }
            }
            if (peersFwd.length) console.log(`  ⇄ binary ${data.length}B from ${peerId.substring(0,6)} to ${peersFwd.join(',')}`);
            return;
        }
        try {
            const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
            const msg = JSON.parse(text);
            if (msg.type && msg.type.startsWith('wr-')) {
                console.log(`  ⇄ ${msg.type} from ${peerId.substring(0,6)} to ${(msg.to || '').substring(0,6)}`);
            }
            if (msg.to) {
                const target = peers.get(msg.to);
                if (target && target.ws.readyState === 1) {
                    target.ws.send(JSON.stringify({ from: peerId, type: msg.type, data: msg.data }));
                } else if (msg.type && msg.type.startsWith('wr-')) {
                    console.log(`    ! target missing for ${msg.type}: ${msg.to}`);
                }
            }
        } catch(e) {}
    });

    ws.on('close', () => {
        peers.delete(peerId);
        console.log(`[${ROOM}] ${peerId} left. Total: ${peers.size}`);
        broadcast({ type: 'peer-left', peerId });
    });

    function broadcast(msg) {
        for (const [id, info] of peers) {
            if (id !== peerId && info.ws.readyState === 1) {
                info.ws.send(JSON.stringify(msg));
            }
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`RelayTalk running on :${PORT}, room: ${ROOM}, max: ${MAX_PEERS}`);
    console.log(`TURN URLs: ${TURN_URLS.join(', ')}`);
    console.log(`Video: ${VIDEO_CONFIG.width}x${VIDEO_CONFIG.height}@${VIDEO_CONFIG.frameRate}fps, ${Math.round(VIDEO_CONFIG.maxBitrate / 1000)}kbps max`);
});
